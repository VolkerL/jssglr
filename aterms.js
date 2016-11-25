const fs = require('fs');

// a Reader that reads 1 char at a time, can also unread
// this is kind of a gross way to do peeking
var PushBackReader = function(txt) {
    // allow both Buffers and Strings
    if (Buffer.isBuffer(txt)) {
        this.txt = txt.toString('utf8');
    } else {
        this.txt = txt;
    }
    this.index = 0;
};
PushBackReader.prototype.read = function () {
    if (this.index < this.txt.length) {
        return this.txt.charAt(this.index++);
    } else {
        return false;
    }
};
PushBackReader.prototype.unread = function (count) {
    if (count) {
        this.index -= count;
    } else {
        this.index--;
    }
};

// JavaScript representation of an ATerm Application
var ATerm = function(label) {
    this.label = label;
    this.kids = [];
};
ATerm.prototype.toString = function() {
    return this.label + '(' + this.kids.map(kid => {
        if (typeof kid === 'string' || kid instanceof String) {
            return '"' + kid.replace('\n', '\\n') + '"';
        } else {
            return kid.toString();
        }
    }).join(', ') + ')';
};

// Parse functions for ATerms
function parseElement(it) {
    skipWhitespace(it);
    var ch = it.read();
    switch (ch) {
    case '"':
        return parseString(it);
    case '[':
        return parseList(it);
    default:
        if (ch.match(/[a-zA-Z]/) !== null) {
            return parseAppl(it);
        }
        if (ch.match(/[0-9]/) !== null) {
            return parsePos(it);
        }
        throw new Error('No elements known starting with a ' + ch + ' at index ' + it.index);
    }
}

function skipWhitespace(it) {
    var ch = it.read();
    while (true) {
        switch (ch) {
        case '\t':
        case ' ':
        case '\r':
        case '\n':
            ch = it.read();
            break;
        default:
            it.unread();
            return;
        }
    }
}

function parseSequenceUntil(it, chEnd) {
    var elements = [];
    skipWhitespace(it);
    var ch = it.read();
    while (ch !== false) {
        switch (ch) {
        case chEnd:
            return elements;
        case ',':
            elements.push(parseElement(it));
            skipWhitespace(it);
            break;
        default:
            // assume it's the first element in the sequence
            it.unread();
            elements.push(parseElement(it));
            skipWhitespace(it);
            break;
        }
        ch = it.read();
    }
    throw new Error('Not a valid sequence, end character was ' + ch  + 'instead of ' + chEnd);
}

function parseString(it) {
    var str = '';
    var ch = it.read();
    while (ch !== false) {
        switch (ch) {
        case '"':
            return str;
        case '\\':
            var ch2 = it.read();
            switch (ch2) {
            case 'r':
                str += '\r';
                break;
            case 'n':
                str += '\n';
                break;
            case 't':
                str += '\t';
                break;
            case '"':
                str += '"';
                break;
            default:
                str += '\\' + ch2;
            }
            break;
        default:
            str += ch;
        }
        ch = it.read();
    }
    throw 'Not a valid String';
}

function parseList(it) {
    return parseSequenceUntil(it, ']');
}

function parseAppl(it) {
    var label = '';
    it.unread();
    var ch = it.read();
    if (ch.match(/[a-zA-Z]/) === null) {
        throw new Error('Not a valid name for an ATerm');
    }
    while (ch.match(/[a-zA-Z_\-*$+0-9]/) !== null) {
        label += ch;
        ch = it.read();
    }
    var term = new ATerm(label);
    if (ch === '(') {
        term.kids = parseSequenceUntil(it, ')');
    } else {
        it.unread();
    }
    return term;
}

function parsePos(it) {
    var int = '';
    it.unread();
    var ch = it.read();
    while (ch.match(/[0-9]/) !== null) {
        int += ch;
        ch = it.read();
    }
    it.unread();
    return parseInt(int);
}

exports.PushBackReader = PushBackReader;
exports.ATerm = ATerm;

// export the function that parses an ATerm from a file
exports.parse = function (tblFile) {
    return parseElement(new PushBackReader(fs.readFileSync(tblFile)));
};
