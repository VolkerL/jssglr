const parsetable = require('./parsetable.js');
const ParseTable = parsetable.ParseTable;
const AttributeType = parsetable.AttributeType;
const statesImport = require('./states.js');
const Node = statesImport.Node;
const Link = statesImport.Link;
const ReduceStatus = statesImport.ReduceStatus;
const Shift = statesImport.Shift;
const atermsImport = require('./aterms.js');
const PushBackReader = atermsImport.PushBackReader;
const ATerm = atermsImport.ATerm;

class ToShift {
    constructor (node, shiftAction) {
        this.node = node;
        this.shift = shiftAction;
    }
}

class Token {
    constructor(char) {
        this.point = char.charCodeAt(0);
        this.char = char;
    }
}

class ParseContext {
    constructor(reader) {
        this.table = null;
        // the PushBackReader for the input
        this.reader = reader;
        // should become a Token after reading
        this.currentToken = null;
        // all stack nodes that are active during
        // the reductions phase for the current Token
        // starts of as the start state,
        // cleared before shifting, filled during shifting
        // expanded during reductions
        this.activeNodes = [];
        // active nodes on which the reductions have already been performed
        // useful to check for reductions from these nodes when a new link is added.
        this.processedNodes = [];
        // active nodes on which reductions will still be performed
        // the union of this and processedNodes should always be activeNodes.
        this.nodesToProcess = [];

        // Shift actions that have to be taken after reductions are done
        this.forShifter = [];
    }
}

class TreeNode {
    constructor(prod, trees) {
        this.prod = prod;
        this.kids = trees;
    }

    toString() {
        return 'apply(' + this.prod.toString() + ', [' +
            this.kids.map(o=>o.toString()).join(', ') + '])';
    }
}

class AmbTreeNode extends TreeNode {
    constructor(trees) {
        super(new ATerm('amb'), trees);
    }
}

class TokenTreeNode {
    constructor(token) {
        this.token = token;
    }

    toString() {
        return '"' + this.token.char.replace('\n', '\\n') + '"';
    }
}

// apply func in DFS style on all paths (i.e. Array of Links)
// from the given startNode of the given length.
//
// void func(startNode, path)
function onPath(func, pathLength, startNode, pathSoFar) {
    if (pathLength === 0) {
        // reached the end of the path, we can process
        func(startNode, pathSoFar);
        return;
    }

    var node;
    if (pathSoFar.length === 0) {
        node = startNode;
    } else {
        node = pathSoFar[pathSoFar.length - 1].to;
    }

    node.links.forEach(link => {
        pathSoFar.push(link);
        onPath(func, pathLength - 1, startNode, pathSoFar);
        pathSoFar.pop();
    });
}

function applyProduction(label, trees) {
    return new TreeNode(label.prod, trees);
}

function createAmbNode(oldTree, newTree) {
    if (oldTree instanceof AmbTreeNode) {
        oldTree.kids.push(newTree);
        return oldTree;
    }
    return new AmbTreeNode([oldTree, newTree]);
}

// find a goto for the given state and token and return the state ID it goes to.
function goto(state, label) {
    for (var go of state.gotos) {
        if (go.ranges.within(label.id)) {
            return go.state;
        }
    }
    throw new Error('There is no goto in state ' + state.id);
}

function reduce(reduceAction, node, ctx, optLink) {
    // if optLink is a link, we do limited reductions
    // in other words: we only reduce paths that contain the link
    var limited = optLink instanceof Link;

    var label = ctx.table.labels[reduceAction.label];
    for (var attr of label.attrs) {
        if (attr.type === AttributeType.RECOVER
            || attr.type === AttributeType.PLACEHOLDER) {
            // TODO: we don't support recovery or completion stuff
            return;
        }
    }

    onPath((startNode, path) => {
        if (limited  && path.findIndex(l => {
            return l.to.state.id === optLink.to.state.id
                && l.from.state.id === optLink.from.state.id;
        }) == -1) {
            // skip this path as it does not contain optLink
            return;
        }

        var trees = path.map(link => {return link.tree;});
        var tree = applyProduction(label, trees.reverse());
        var pathEndNode;
        if (path.length === 0) {
            pathEndNode = startNode;
        } else {
            pathEndNode = path[path.length - 1].to;
        }

        var newStateId = goto(pathEndNode.state, label);

        info('REDUCING ', reduceAction, ' TO: ', newStateId, ' ON PATH ',
             path.map(l=>{return {
                 to: l.to.state.id,
                 from: l.from.state.id,
                 tree: (l.tree.token ? l.tree.token : l.tree.prod.toString())
             };
                         }));

        var newNode = ctx.activeNodes.find(node => {
            return node.state.id === newStateId;
        });
        if (newNode === undefined) {
            // making a new stack node for this state
            var state = ctx.table.states[newStateId];
            newNode = new Node(state);
            ctx.activeNodes.push(newNode);
            ctx.nodesToProcess.push(newNode);
        }

        var newLink = newNode.links.find(link => {
            return link.to.state.id === pathEndNode.state.id;
        });
        if (newLink === undefined) {
            newLink = new Link(newNode, pathEndNode, tree);
            newNode.links.push(newLink);
            // we are adding a new link
            // so we need to reprocess reductions
            // through this new link for all nodes
            // we already processed
            ctx.processedNodes.forEach(processedNode => {
                reduce(reduceAction, processedNode, ctx, newLink);
            });
        } else {
            // there was already a link, so we found an ambiguity
            tree = createAmbNode(newLink.tree, tree);
        }
        // TODO: deal with rejections, do we care about the reject attribute on a label?
        // or do we only care about the reject status of a reduce action?
        if (reduceAction.status === ReduceStatus.REJECT) {
            newLink.reject = true;
        }

    }, reduceAction.arity, node, []);
}

function shift(ctx) {
    ctx.activeNodes = [];
    ctx.nodesToProcess = [];
    ctx.processedNodes = [];

    var tree = new TokenTreeNode(ctx.currentToken);

    for (var toShift of ctx.forShifter) {
        // no need to shift if there is never going to be an accepting path
        if (toShift.node.allLinksRejected()) {
            continue;
        }
        var newStateId = toShift.shift.state;
        var newNode = ctx.activeNodes.find(n => {return n.state.id === newStateId;});
        if (newNode === undefined) {
            newNode = new Node(ctx.table.states[newStateId]);
            ctx.activeNodes.push(newNode);
            ctx.nodesToProcess.push(newNode);
        }
        var link = new Link(newNode, toShift.node, tree);
        newNode.links.push(link);
    }
    ctx.forShifter = [];
}

function info() {
    console.log.apply(null, arguments);
}

exports.ParseContext = ParseContext;
exports.shift = shift;
exports.reduce = reduce;
exports.ToShift = ToShift;
exports.Token = Token;
exports.AmbTreeNode = AmbTreeNode;
exports.TreeNode = TreeNode;
exports.TokenTreeNode = TokenTreeNode;
