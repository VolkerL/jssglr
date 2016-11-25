// Stack nodes and edges for a Graph Structured Stack
var Node = function (state) {
    this.links = [];
    this.state = state;
};

Node.prototype.allLinksRejected = function () {
    for (var link of this.links) {
        if (link.rejected === false) {
            return false;
        }
    }
    return this.links.length !== 0;
};

var Link = function (fromNode, toNode, tree) {
    this.from = fromNode;
    this.to = toNode;
    this.tree = tree;
    this.rejected = false;
};

// States and actions for the parse table
var State = function (id, gotos, actions) {
    this.id = id;
    this.gotos = gotos;
    this.actions = actions;
};

State.prototype.getActions = function (charPoint) {
    for (var i in this.actions) {
        var action = this.actions[i];
        if (action.ranges.within(charPoint)) {
            return action.actions;
        }
    }
    return false;
};

var Goto = function (charRanges, stateId) {
    this.ranges = charRanges;
    this.state = stateId;
};

var Action = function (charRanges, actionItems) {
    this.ranges = charRanges;
    this.actions = actionItems;
};

// ActionItems
var ActionType = {
    REDUCE : Symbol('REDUCE'),
    REDUCE_LOOKAHEAD : Symbol('REDUCE_LOOKAHEAD'),
    SHIFT : Symbol('SHIFT'),
    ACCEPT : Symbol('ACCEPT')
};

var Reduce = function (arity, label, status) {
    this.arity = arity;
    this.label = label;
    this.status = status;
};
Reduce.prototype.type = ActionType.REDUCE;

var Shift = function (newStateId) {
    this.state = newStateId;
};
Shift.prototype.type = ActionType.SHIFT;

var Accept = function () {};
Accept.prototype.type = ActionType.ACCEPT;

var ReduceLookahead = class extends Reduce {
    constructor(arity, label, status, charRanges) {
        super(arity, label, status);
        this.ranges = charRanges;
    }
};
ReduceLookahead.prototype.type = ActionType.REDUCE_LOOKAHEAD;

var CharRanges = function (ranges) {
    this.ranges = ranges;
};
CharRanges.prototype.within = function (charPoint) {
    for (var i in this.ranges) {
        var range = this.ranges[i];
        if (range.length > 0) {
            var x = range[0];
            if (x == charPoint) {
                return true;
            }
            if (range.length == 1) {
                continue;
            }
            if (charPoint >= x) {
                var y = range[1];
                if (charPoint <= y) {
                    return true;
                }
            }
            continue;
        }
    }
    return false;
};

exports.State = State;
exports.CharRanges = CharRanges;
exports.Action = Action;
exports.ActionType = ActionType;
exports.Goto = Goto;
exports.Shift = Shift;
exports.Reduce = Reduce;
exports.ReduceLookahead = ReduceLookahead;
exports.Accept = Accept;
exports.ReduceStatus = {REJECT : 1};
exports.Node = Node;
exports.Link = Link;
