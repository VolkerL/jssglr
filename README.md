# JavaScript Scannerless Generalized LR Parser (JSSGLR)

This project aims to bring the powerful [SGLR parsing algorithm](https://en.wikipedia.org/wiki/Scannerless_parsing) to JavaScript.

What this means is that you can write simple, expressive, and powerful grammar specifications
for any language you desire, and use this project to parse them!

The SGLR algorithm works on parse tables.
Such a parse table can be generated for you by the [Spoofax Language Workbench](http://metaborg.org/en/latest/).
Spoofax allows you to define the syntax for your language in an intuitive way,
by creating a grammar specification in the [Syntax Definition Formalism (SDF)](http://metaborg.org/en/latest/source/langdev/meta/lang/sdf3.html).

From this grammar, it will generate a parse table which can be used by this project to parse the language using JavaScript.

## Usage

For now the project is quite small.
It contains a parse table (i.e. `sdf.tbl`) for a subset of SQL called [MiniSQL](https://github.com/metaborg/spt/tree/master/org.metaborg.lang.minisql)
, a short input file (i.e. `input.dummy`), and the JavaScript code to parse it.

If you do not have [NodeJs](https://nodejs.org/en/) installed, please do so now (by following that link).
With node installed, simply run
```
$ node example.js
```
from the root folder of this repository.

You will see a lot of output appear on the screen (mostly debugs) and hopefully a parse tree at the end as well.
If not, oops, something went wrong.
Feel free to open an issue here.

## Limitations

At the moment the project is very unstructured and this is only the minimal working prototype.
We can only handle parse trees of version 6, and I can't guarantee it covers all fancy features of parse trees.
You should get a proper error when we encounter unknown entries in the parse tree though.

The algorithm itself is a combination between [the paper](http://eelcovisser.org/wiki/thesis)
and the [Java SGLR implementation](https://github.com/metaborg/jsglr/tree/master/org.spoofax.jsglr).
It is based on the JSGLR implementation, because JSGLR works with the parse tables produced by Spoofax,
and on the paper, because the JSGLR implementation has incorporated many new features that make it a lot more complex.

We do not yet handle `prefer` or `avoid`, and don't even attempt any context-free disambiguation at all.
We do apply lexical disambiguation using SDF's reject productions.

## Repository Organization

None whatsoever, kind of.
Just a bunch of dirty JavaScript with rookie mistakes and differing code styles.
This will be the first candidate for future work.

So here's the kind of:
- `aterms.js` contains a `PushBackReader` which can read a String character by character.
  It's kind of like an iterator that allows you to peak by issuing an `unread` after a `read`.

  However, the main part of this module is the `ATerm` class, which represents data in the [Annotated Term (ATerm) format](http://homepages.cwi.nl/~paulk/publications/SPE00.pdf).
  But don't get your hopes up, we only support, list, int, string and applications.
  So Annotations are not even supported.
  How dare we call it ATerm? Guts!

  The `parse` function let's you pass the path to the parse table file and will return its ATerm representation.
- `states.js` contains the classes to represent the SGLR's Graph Structured Stack (GSS),
  as well as the classes for States and their GOTOs and Actions.
- `parsetable.js` contains classes for Labels and Attributes, which are a part of the parse table,
  along with States, GOTOs, and Actions. No idea why they aren't grouped together.

  This file is mainly the provider for the `ParseTable` class, which can be constructed by passing
  either an ATerm of a parse table, or the path to a parse table.
  The parse table itself provides the id of the start state, and the labels and states indexed by their id.
- `parse.js` contains the code for the main reduce and shift actions, as well as the `ParseContext` that they need to do their job.

  It also contains the classes that represent the parse tree that should result from a succesful parse.
- `example.js` is actually more than just an example.
  It starts of with some ramblings about things I didn't understand about the SGLR paper and the JSGLR implementation.
  These may be indicators of what could be wrong with this JSSGLR project.

  It then initialises a parse table and context to parse the `input.dummy` file and continues on with the main SGLR algorithm loop.
  This should obviously be a function instead. But it isn't. For now.

## Troubleshooting

Got any issues? Bugs? Questions? They all go into the Github issues section.
Thanks for your interest in the project.
