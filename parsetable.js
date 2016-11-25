const aterms = require('./aterms.js');
const states = require('./states.js');
const ATerm = aterms.ATerm;
const CharRanges = states.CharRanges;
const Action = states.Action;
const Goto = states.Goto;
const Shift = states.Shift;
const Reduce = states.Reduce;
const ReduceLookahead = states.ReduceLookahead;
const Accept = states.Accept;
const State = states.State;

class Label{
    constructor(id, production, attributes) {
        this.id = id;
        this.prod = production;
        this.attrs = attributes;
    }
}

// Attributes of labels
var AttributeType = {
    CONS : Symbol('CONS'),
    ASSOC : Symbol('ASSOC'),
    BRACKET : Symbol('BRACKET'),
    RECOVER : Symbol('RECOVER'),
    REJECT : Symbol('REJECT'),
    PREFER : Symbol('PREFER'),
    AVOID : Symbol('AVOID'),
    PLACEHOLDER : Symbol('PLACEHOLDER')
};

var AssociativityType = {
    LEFT : Symbol('LEFT'),
    RIGHT : Symbol('RIGHT')
};

var Attribute = {
    Cons : function(cons) {
        this.cons = cons;
        this.type = AttributeType.CONS;
    },
    Assoc : function(leftOrRight) {
        if (leftOrRight === AssociativityType.LEFT || leftOrRight === AssociativityType.RIGHT) {
            this.assoc = leftOrRight;
        } else {
            throw new Error('Unknown associativity :' + leftOrRight + '. Please use an AssociativityType');
        }
        this.type = AttributeType.ASSOC;
    },
    Bracket : {
        type : AttributeType.BRACKET
    },
    Recover : {
        type : AttributeType.RECOVER
    },
    Reject : {
        type : AttributeType.REJECT
    },
    Prefer : {
        type : AttributeType.PREFER
    },
    Avoid : {
        type : AttributeType.AVOID
    },
    Placeholder : {
        type : AttributeType.PLACEHOLDER
    }
};

function mapParseLabel(labelTerm) {
    var prodTerm = labelTerm.kids[0];
    var labelId = labelTerm.kids[1];

    var attrsTerm = prodTerm.kids[2];

    var attrsTerms = [];
    switch(attrsTerm.label) {
    case 'attrs':
        attrsTerms = attrsTerm.kids[0];
    case 'no-attrs':
        break;
    default:
        throw new Error('Unsupported attribute collection: ' + attrsTerm);
    }

    var attrs = attrsTerms.map(attrTerm => {
        switch(attrTerm.label) {
        case 'bracket':
            return Attribute.Bracket;
        case 'reject':
            return Attribute.Reject;
        case 'prefer':
            return Attribute.Prefer;
        case 'avoid':
            return Attribute.Avoid;
        case 'assoc':
            switch(attrTerm.kids[0].label) {
            case 'assoc':
            case 'left':
                return new Attribute.Assoc(AssociativityType.LEFT);
            case 'right':
                return new Attribute.Assoc(AssociativityType.RIGHT);
            default:
                throw new Error('Unsupported associativity type: ' + attrTerm.kids[0].label);
            }
        case 'term':
            var attrChild = attrTerm.kids[0];
            switch(attrChild.label) {
            case 'cons':
                return new Attribute.Cons(attrChild.kids[0]);
            case 'recover':
                return Attribute.Recover;
            case 'placeholder':
                return Attribute.Placeholder;
            default:
                throw new Error('Unsupported term attribute: ' + attrChild.label);
            }
        default:
            throw new Error('Unsupported attribute: ' + attrTerm);
        }
    });
    return new Label(labelId, prodTerm.kids[1], attrs);
}

function mapParseRange(rangeTerm) {
    if (rangeTerm instanceof ATerm) {
        // it's a range(start, end) ATerm
        return rangeTerm.kids;
    } else {
        // it's a single number
        return [rangeTerm];
    }
}

function parseRanges(rangesTerms) {
    var rangesJs = rangesTerms.map(mapParseRange);
    var ranges = new CharRanges(rangesJs);
    return ranges;
}

function mapParseActionItem(itemTerm) {
    switch(itemTerm.label) {
    case 'shift':
        var toState = itemTerm.kids[0];
        return new Shift(toState);
    case 'accept':
        return new Accept();
    case 'reduce':
        var arity = itemTerm.kids[0];
        var label = itemTerm.kids[1];
        var status = itemTerm.kids[2];

        switch(itemTerm.kids.length) {
        case 3:
            return new Reduce(arity, label, status);
        case 4:
            var lookaheadTerms = itemTerm.kids[3];
            var lookaheadRangesJs = lookaheadTerms.map(lookaheadTerm => {
                // follow-restriction([char-class([42, 47, range(30,37)])])
                if (lookaheadTerm.label !== 'follow-restriction') {
                    throw new Error('Unsupported lookahead term: ' + lookaheadTerm + '. Expected a follow-restriction.');
                }
                // should have exactly 1 character-class in a list
                var charClassTerm = lookaheadTerm.kids[0][0];
                return new CharRanges(charClassTerm.kids);
            });
            var lookaheadRanges = [lookaheadRangesJs];
            return new ReduceLookahead(arity, label, status, lookaheadRanges);
        default:
            throw new Error('Unknown reduce with ' + itemTerm.kids.length + ' children. Expected 3 or 4.');
        }
    default:
        throw new Error('Unsupported action item: ' + itemTerm);
    }
}

function mapParseState(stateTerm) {
    var stateId = stateTerm.kids[0];
    var gotoTerms = stateTerm.kids[1];
    var actionTerms = stateTerm.kids[2];
    var prioritiesTerm = stateTerm.kids[3];

    var gotos = gotoTerms.map(gotoTerm => {
        var rangesTerms = gotoTerm.kids[0];
        var toState = gotoTerm.kids[1];
        var ranges = parseRanges(rangesTerms);
        return new Goto(ranges, toState);
    });

    var actions = actionTerms.map(actionTerm => {
        var rangesTerms = actionTerm.kids[0];
        var itemsTerms = actionTerm.kids[1];
        var ranges = parseRanges(rangesTerms);
        var items = itemsTerms.map(mapParseActionItem);
        return new Action(ranges, items);
    });

    // priorities not supported yet

    return new State(stateId, gotos, actions);
}

class ParseTable {
    constructor(termOrFile) {

        var term;
        if (typeof termOrFile === 'string') {
            term = aterms.parse(termOrFile);
        } else {
            term = termOrFile;
        }

        var version = term.kids[0];
        var startStateId = term.kids[1];
        var labelsList = term.kids[2];
        var statesTerm = term.kids[3];
        var prioritiesTerm = term.kids[4];

        if (version != 6) {
            throw new Error('Can only parse tables of version 6, not version ' + version);
        }

        this.startState = startStateId;

        var labels = labelsList.map(mapParseLabel);
        this.labels = {};
        labels.forEach(label => {
            this.labels[label.id] = label;
        });

        // parse the states
        var statesTerms = statesTerm.kids[0];
        var states = statesTerms.map(mapParseState);
        this.states = {};
        states.forEach(state => {
            this.states[state.id] = state;
        });
    }
}

exports.Attribute = Attribute;
exports.AttributeType = AttributeType;
exports.AssociativityType = AssociativityType;
exports.ParseTable = ParseTable;
exports.Label = Label;
