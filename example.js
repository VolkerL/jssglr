const fs = require('fs');
const parsetableImport = require('./parsetable.js');
const ParseTable = parsetableImport.ParseTable;
const parseImport = require('./parse.js');
const reduce = parseImport.reduce;
const shift = parseImport.shift;
const ParseContext = parseImport.ParseContext;
const ToShift = parseImport.ToShift;
const Token = parseImport.Token;
const atermsImport = require('./aterms.js');
const PushBackReader = atermsImport.PushBackReader;
const statesImport = require('./states.js');
const ActionType = statesImport.ActionType;
const Node = statesImport.Node;

/*

Notes on the Java implementation and the algorithm:

In Java, new states from reductions are always added to for-actor-delayed.
In the algorithm, only 'rejectable' states are added to for-actor-delayed.
Therefore, there is no reason to use for-actor-delayed in the Java implementation,
as it is no different from adding them to for-actor directly.
According to the paper, this may lead to rejecting stacks 'escaping'.
No clue how relevant that is though, as nobody is complaining about the Java implementation.

Management of for-actor in the algorithm is hard to understand.
We iterate over all elements of for-actor,
but while doing that for-actor may be overwritten to be some new state and for-actor-delayed.
I'm not sure if, or how, that is supposed to effect the current iteration.
The Java implementation simply adds new states to for-actor-delayed
and replaces for-actor with for-actor-delayed when for-actor is empty.
No priorities are used (even though the paper mentions them, not sure why) for stacks in for-actor-delayed.
This means we can just as well append the new stacks directly to for-actor, as discussed above.

The function do-limited-reductions is invoked when a new link is added.
It will do reductions over that link (if there are any)
for all states that are part of active states, but not part of for-actor(-delayed).
Due to the weird management of for-actor in the algorithm,
I can't deduce what states should or should not be a part of this set.
In the Java algorithm each stack is popped from for-actor before it is processed.
This means that do-limited-reductions operates on the stacks
of which actions have been processed already, or on which actions are *being* processed at the moment.
I have no clue if new links added from a reduction starting from a certain state
can create new reduction paths for other reductions starting from that state.
If so, we have a problem as the new link will be added, do-limited-reductions will process a reduction,
and then that same reduction will be applied again, as we are still iterating over the actions of that stack.
If it can not, there is no reason to call do-limited-reductions on the current stack.
Either way, I suspect this might only cause problems in edge cases, but we might want to resolve it.

Not sure about the algorithm, but GOTOs in the Java code only operate on labels.
Labels start at 257 to not conflict with the first 256 of characters.
However, characters in a GOTO are not used by the algorithm, only labels.
So we could skip all those GOTOs and scale the label numbers down by 257.

 */


var table = new ParseTable('sdf.tbl');
var ctx = new ParseContext();
ctx.table = table;
/* FIXME: Dirty Hack!
   We append char code 256 as this is considered EOF by Spoofax.
   This is not UTF-8 compatible, only ASCII.
   But that's a Spoofax limitation atm.
 */
ctx.reader = new PushBackReader(fs.readFileSync('input.dummy') + String.fromCharCode(256));
ctx.activeNodes = [new Node(table.states[table.startState])];
ctx.nodesToProcess = Array.from(ctx.activeNodes);

var acceptingNode = false;

var nextChar = ctx.reader.read();
while (nextChar !== false) {

    console.log('parsing character: ' + nextChar);
    if (ctx.nodesToProcess.length === 0) {
        console.log('NO NODES TO PROCESS!');
    }

    ctx.currentToken = new Token(nextChar);
    var node = ctx.nodesToProcess.shift();
    while (node !== undefined) {

        console.log('processing state ' + node.state.id);

        // mark it as processed, because we need to recheck previous reductions
        // if a new link is added during one of the reduce actions
        /* TODO: that could theoretically lead to double reductions,
         let's say there are 3 reductions: [a, b, c]
         if a creates a new link, b can reduce over it,
         then a.limited-reductions will process b, and so will the current
         processing of all actions (as it still needs to process b and c).
         */
        ctx.processedNodes.push(node);

        if(!node.allLinksRejected()) {
            var actions = node.state.getActions(ctx.currentToken.point);

            //console.log('checking actions for char point ', ctx.currentToken.point, ': ', actions);

            if (actions === false) {
                // no actions to take in this branch
            } else {
                for (var actionItem of actions) {
                    switch(actionItem.type) {
                    case ActionType.REDUCE_LOOKAHEAD:
                        var lookaheadOK = true;
                        var numLookaheads = 0;
                        for (var lookaheadRange of actionItem.ranges) {
                            var nChar = ctx.reader.read();
                            numLookaheads++;
                            if (nChar === false) {
                                // if there is no character anymore
                                // it also can't violate the follow-restriction
                                break;
                            }
                            var nToken = new Token(nChar);
                            if (lookaheadRange.within(nToken.point)) {
                                // the next token is within the follow-restriction
                                // so it's NOT ok
                                lookaheadOK = false;
                                break;
                            }
                        }
                        ctx.reader.unread(numLookaheads);
                        if (!lookaheadOK) {
                            break;
                        }
                        // else we fall through and process the reduce
                    case ActionType.REDUCE:
                        reduce(actionItem, node, ctx);
                        break;
                    case ActionType.SHIFT:
                        ctx.forShifter.push(new ToShift(node, actionItem));
                        break;
                    case ActionType.ACCEPT:
                        acceptingNode = node;
                    }
                }
            }
        }

        node = ctx.nodesToProcess.shift();
    }

    shift(ctx);
    nextChar = ctx.reader.read();
}

if (acceptingNode === false) {
    throw new Error('Parsing did not end in an accepting stack.');
} else {
    var path = findAcceptingPath(acceptingNode, table.startState);
    if (path === false) {
        throw new Error('All accepting paths were rejected.');
    } else {
        // TODO: get the parse tree from the path
        // TODO: disambiguation
        console.log('PARSING SUCCES!: ' + path[0].tree);
    }
}

function findAcceptingPath(node, startStateId, optPath) {
    if (typeof optPath === 'undefined') {
        optPath = [];
    }
    for (var link of node.links) {
        if (link.to.state.id === startStateId && link.rejected === false) {
            optPath.push(link);
            return optPath;
        } else if (link.rejected === false) {
            path.push(link);
            return findAcceptingPath(link.to, startStateId, optPath);
        }
    }
    return false;
}
