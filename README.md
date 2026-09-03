# prettier-plugin-markdown-replacements

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE) [![Prettier 3.5+](https://img.shields.io/badge/prettier-3.5%2B-1A2B34?logo=prettier&logoColor=F7B93E)](https://prettier.io) [![Node.js 18+](https://img.shields.io/badge/node-%3E%3D18-5FA04E?logo=node.js&logoColor=white)](https://nodejs.org)

**English** | [한국어](./README.ko.md)

A [Prettier](https://prettier.io) plugin that applies the text replacements you register to Markdown and MDX documents, and leaves code spans, code blocks and MDX comments exactly as written.

Register the spellings you keep getting wrong, or the notation your project has settled on, and they are corrected every time a document is formatted.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Rule formats](#rule-formats)
- [What is protected](#what-is-protected)
- [Writing rules that span whitespace](#writing-rules-that-span-whitespace)
- [Recipes](#recipes)
- [Using it with other plugins](#using-it-with-other-plugins)
- [Options](#options)
- [Compatibility](#compatibility)
- [Development](#development)
- [License](#license)

## Requirements

| Item     | Version        |
| -------- | -------------- |
| Node.js  | 18 or later    |
| Prettier | 3.5.3 or later |

## Installation

Install it as a dev dependency alongside Prettier.

```sh
# npm
npm install --save-dev prettier prettier-plugin-markdown-replacements

# yarn
yarn add --dev prettier prettier-plugin-markdown-replacements

# pnpm
pnpm add --save-dev prettier prettier-plugin-markdown-replacements
```

The plugin is ESM-only and cannot be loaded through `require()`. Prettier 3's plugin loader handles ESM directly, so naming it in the configuration file is all that is needed.

## Configuration

Add the package to `plugins` and list your rules. The default is empty, so nothing is replaced until you add one.

```json
{
  "plugins": ["prettier-plugin-markdown-replacements"],
  "markdownReplacements": ["Javascript=>JavaScript", "Github=>GitHub"]
}
```

**Before**

<!-- prettier-ignore -->
```md
Send a Javascript request from Github.

| Field | Description |
| --- | --- |
| `Javascript` | Javascript runtime |
```

**After**

<!-- prettier-ignore -->
```md
Send a JavaScript request from GitHub.

| Field | Description |
| --- | --- |
| `Javascript` | JavaScript runtime |
```

Prose in the body, in headings, in lists and in table cells is corrected, while anything wrapped in code markup keeps its original spelling.

## Rule formats

| Format             | Example                        | Behavior                                                                    |
| ------------------ | ------------------------------ | --------------------------------------------------------------------------- |
| Literal            | `Javascript=>JavaScript`       | Compared as a plain string and replaced at every occurrence                 |
| Regular expression | `/Max ([0-9]+)/g=>Maximum: $1` | Written as `/pattern/flags`, with capture references such as `$1` available |

With the regular expression above, `Max 50` becomes `Maximum: 50`. The `g` flag is added automatically when omitted, so every occurrence is replaced.

- The separator is the first `=>` in a literal rule, and the `=>` after the flags in a regular expression rule. The replacement itself may contain `=>`.
- Nothing is trimmed, so leading and trailing spaces are part of the rule.
- Rules are applied in array order, and the output of one rule is the input of the next.
- An entry without a separator, with an empty left side, or with an invalid regular expression is ignored while the remaining rules still run.
- An entry that starts with `/` but is not a valid regular expression is treated as a literal rule, so a path rewrite such as `/docs/guide=>/docs/tutorial` works as expected.
- In a JSON configuration file every backslash in the pattern is written twice, because JSON uses the backslash as an escape character itself. The rule `/<br\s*\/?>/gi=><br />` is stored as `"/<br\\s*\\/?>/gi=><br />"`.

## What is protected

Replacements run on the document source before it is parsed, and these regions are lifted out first and put back untouched.

| Region             | Example            |
| ------------------ | ------------------ |
| Inline code        | `` `Javascript` `` |
| Fenced code blocks | ` ```js ... ``` `  |
| MDX comments       | `{/* ... */}`      |

A string that must survive verbatim, such as a value an API really returns, is protected by wrapping it in code markup.

There is one safeguard on top of that. A pattern broad enough to match the internal tokens used to protect those regions would leak a token into the document, so when that happens the document is left exactly as it was. A rule such as `/[A-Za-z_]+/g=>X` therefore does nothing rather than something destructive.

## Writing rules that span whitespace

Replacements see the whole document at once, not one paragraph at a time, and in Markdown a line break carries structure. A pattern that reaches across one is a structural edit, not a spelling fix. Two failures show up quickly.

| Pattern                                                  | What it breaks                                                                                                                                 |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `/\s*<br\s*\/?>\s*/gi`                                   | `\s` matches the blank line between two paragraphs, so the paragraphs merge into one                                                           |
| `/[^\S\r\n]*<br\s*\/?>[^\S\r\n]*(?:\r?\n(?![\r\n]))?/gi` | The one newline it absorbs is also the newline between two list items, so a list whose items each end in `<br />` collapses onto a single line |

Match horizontal whitespace only and leave every line break alone.

<!-- prettier-ignore -->
```
/[^\S\r\n]*<br\s*\/?>[^\S\r\n]*/gi=><br />
```

`[^\S\r\n]` is whitespace that is not a line break. A line break inside a paragraph is then left to Prettier, which joins it with a space under `proseWrap: "never"`, so `line one <br>` followed by `line two` prints as `line one<br /> line two`.

## Recipes

### Unifying line-break tags

<!-- prettier-ignore -->
```json
{
  "markdownReplacements": ["/<br\\s*\\/?>/gi=><br />"]
}
```

`<br>`, `<br/>`, `<BR>` and `<br >` all become `<br />`. To tidy the spacing around the tag as well, use the whitespace-aware form from the section above.

### Restoring escaped brackets

Prettier escapes a leading `[` in prose as `\[` to keep it from reading as a link. A project that would rather keep the bracket plain can register a literal rule.

<!-- prettier-ignore -->
```json
{
  "markdownReplacements": ["\\[=>["]
}
```

`\[App] > \[General]` then prints as `[App] > [General]`. Brackets inside code markup and MDX comments keep their escape.

## Using it with other plugins

Prettier resolves one parser per language. This plugin contributes a parser, and so does any plugin that wraps Prettier's Markdown printer, so **list this plugin last** and the others before it. Listed first, its rules are silently skipped.

```json
{
  "plugins": ["prettier-plugin-markdown-compact-tables", "prettier-plugin-markdown-replacements"],
  "markdownReplacements": ["Javascript=>JavaScript"]
}
```

The companion plugin [`prettier-plugin-markdown-compact-tables`](https://github.com/cudoment/prettier-plugin-markdown-compact-tables) prints Markdown tables without alignment padding. The two are independent: either works on its own, and in the order above they work together.

## Options

| Option                 | Type       | Default | Description                                                                                                                                                        |
| ---------------------- | ---------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `markdownReplacements` | `string[]` | `[]`    | Text replacements applied outside code spans, code blocks and MDX comments. Use `"from=>to"` for a literal rule or `"/pattern/flags=>to"` for a regular expression |

It is available on the command line as well.

```sh
npx prettier --write "**/*.md" --markdown-replacements "Javascript=>JavaScript"
```

## Compatibility

| Prettier      | Status                                                                      |
| ------------- | --------------------------------------------------------------------------- |
| 3.5.3 ~ 3.9.x | Supported. All 43 tests pass on 3.5.3, 3.6.2, 3.7.4, 3.8.1, 3.9.0 and 3.9.6 |

Both of Prettier's built-in parsers, `markdown` and `mdx`, are covered. The plugin adds a `preprocess` step to them and leaves the printer alone, which is what lets it sit alongside a plugin that does own the printer.

## Development

```sh
# install dependencies
npm install

# run the tests once
npm run test:run

# run the tests in watch mode
npm test

# format this repository's own documents
npm run format
```

The tests are written with [Vitest](https://vitest.dev) and live in `__tests__/`.

## License

[MIT](./LICENSE)
