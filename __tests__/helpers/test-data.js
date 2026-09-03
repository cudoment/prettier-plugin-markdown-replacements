// A rule that normalizes line-break tags and tidies the spaces around them.
// This is configuration, not built-in plugin behavior.
//
// Replacements are applied to the whole source at once rather than paragraph by
// paragraph, so a pattern that also matches a line break rewrites the document
// structure. Anchoring with `\s` swallows the blank line between two
// paragraphs and merges them; absorbing even a single line break collapses a
// list whose items each end in `<br />` into one line. Both failures showed up
// on a corpus of 614 real documents. The rule therefore matches horizontal
// whitespace only.
export const brRule = "/[^\\S\\r\\n]*<br\\s*\\/?>[^\\S\\r\\n]*/gi=><br />"

// A rule that unescapes square brackets. It needs no regular expression, so it
// is written as a literal rule.
export const escapedBracketRule = "\\[=>["

// The word rule used across the suite: a spelling fix with a space in it, which
// is the shape most replacement rules take.
export const wordRule = "web hook=>webhook"

export const brOptions = { markdownReplacements: [brRule] }

export const wordOptions = { markdownReplacements: [wordRule] }

export const brAndWordOptions = {
  markdownReplacements: [brRule, wordRule],
}

export const escapedBracketOptions = {
  markdownReplacements: [escapedBracketRule],
}

export const brTagTestCases = [
  {
    name: "plain <br> tag",
    input: "first line<br>second line",
    expected: "first line<br />second line",
  },
  {
    name: "self-closing tag",
    input: "first line<br/>second line",
    expected: "first line<br />second line",
  },
  {
    name: "tag with inner space",
    input: "line 1<br >line 2",
    expected: "line 1<br />line 2",
  },
  {
    name: "mixed case",
    input: "line 1<BR>line 2<Br/>line 3",
    expected: "line 1<br />line 2<br />line 3",
  },
]

export const ruleFormatTestCases = [
  {
    name: "literal rule",
    input: "Check the web hook settings",
    entries: [wordRule],
    expected: "Check the webhook settings",
  },
  {
    name: "regular expression rule with a capture group",
    input: "version 3 and version 11 apply",
    entries: ["/version ([0-9]+)/g=>v$1"],
    expected: "v3 and v11 apply",
  },
  {
    name: "the g flag is added when the rule omits it",
    input: "aaa",
    entries: ["/a/=>b"],
    expected: "bbb",
  },
  {
    name: "flags other than g are kept",
    input: "Api and api spelling",
    entries: ["/api/gi=>API"],
    expected: "API and API spelling",
  },
  {
    name: "the replacement may contain the separator",
    input: "arrow",
    entries: ["arrow=>a=>b"],
    expected: "a=>b",
  },
  {
    name: "several rules apply in the order they are registered",
    input: "one of abc",
    entries: ["abc=>bca", "bca=>cab"],
    expected: "cab",
  },
  {
    name: "an entry starting with a slash that is not a regex is a literal rule",
    input: "See /docs/guide for details",
    entries: ["/docs/guide=>/docs/tutorial"],
    expected: "See /docs/tutorial for details",
  },
  {
    name: "an empty right side deletes the match",
    input: "keep [DRAFT] out",
    entries: ["[DRAFT] =>"],
    expected: "keep out",
  },
  {
    name: "a slash inside a character class does not end the pattern",
    input: "a/b and a-b",
    entries: ["/a[/-]b/g=>X"],
    expected: "X and X",
  },
  {
    name: "an escaped slash does not end the pattern",
    input: "path a/b here",
    entries: ["/a\\/b/g=>X"],
    expected: "path X here",
  },
  {
    name: "an unknown flag falls back to a literal rule",
    input: "the /x/q token",
    entries: ["/x/q=>y"],
    expected: "the y token",
  },
  {
    // The pattern is what `RegExp` rejects here, not the entry's shape, so this
    // is the path where the constructor throws and the entry is read as a
    // literal rule instead.
    name: "an invalid pattern with valid flags falls back to a literal rule",
    input: "see /a(/g here",
    entries: ["/a(/g=>X"],
    expected: "see X here",
  },
  {
    name: "flags that cannot be combined fall back to a literal rule",
    input: "see /a/uv here",
    entries: ["/a/uv=>X"],
    expected: "see X here",
  },
  {
    name: "a repeated flag falls back to a literal rule",
    input: "see /a/gg here",
    entries: ["/a/gg=>X"],
    expected: "see X here",
  },
  {
    name: "an entry that looks like a regex but has no separator is skipped",
    input: "keep /abc/g and change me",
    entries: ["/abc/g", "change=>changed"],
    expected: "keep /abc/g and changed me",
  },
]

// Document constructs that both the markdown and the mdx parser handle the same
// way. Each case is formatted with `wordRule` alone, so a `contains` entry
// means the replacement reached that construct and a `notContains` entry means
// it did not.
export const documentConstructCases = [
  {
    name: "HTML block",
    input: "<div>web hook</div>\n",
    contains: ["<div>webhook</div>"],
  },
  {
    name: "inline HTML",
    input: "a <b>web hook</b> b\n",
    contains: ["<b>webhook</b>"],
  },
  {
    // Whether Prettier keeps the setext form or rewrites it as an ATX heading
    // has changed between releases, so the assertion is on the heading text.
    name: "setext heading",
    input: "web hook title\n==============\n",
    contains: ["webhook title"],
  },
  {
    name: "heading of every level",
    input: "# web hook\n\n## web hook\n\n###### web hook\n",
    contains: ["# webhook", "## webhook", "###### webhook"],
  },
  {
    name: "reference definition title",
    input: '[ref]: /docs/x "web hook title"\n\nSee [x][ref].\n',
    contains: ['"webhook title"'],
  },
  {
    name: "reference link label is left alone",
    input: "See [the guide][ref].\n\n[ref]: /docs/web-hook\n",
    contains: ["[the guide][ref]", "[ref]: /docs/web-hook"],
  },
  {
    name: "footnote definition",
    input: "text[^1]\n\n[^1]: web hook note\n",
    contains: ["[^1]: webhook note"],
  },
  {
    name: "blockquote and nested blockquote",
    input: "> web hook quote\n>\n> > nested web hook\n",
    contains: ["> webhook quote", "> > nested webhook"],
  },
  {
    name: "table keeps its alignment row",
    input: "| a | b |\n| :-- | --: |\n| web hook | 1 |\n",
    contains: ["| :------ | --: |", "| webhook |"],
  },
  {
    name: "escaped pipe in a table cell",
    input: "| a |\n| --- |\n| web hook \\| x |\n",
    contains: ["| webhook \\| x |"],
  },
  {
    name: "image alt text",
    input: "![web hook](/img/web-hook.png)\n",
    contains: ["![webhook](/img/web-hook.png)"],
  },
  {
    name: "link title",
    input: '[x](/y "web hook title")\n',
    contains: ['[x](/y "webhook title")'],
  },
  {
    name: "autolink is left alone",
    input: "<https://example.com/web-hook>\n",
    contains: ["<https://example.com/web-hook>"],
  },
  {
    name: "YAML frontmatter",
    // Replacements run on the source, so a rule reaches frontmatter as well.
    input: "---\ntitle: web hook\n---\n\nweb hook body\n",
    contains: ["title: webhook", "webhook body"],
  },
  {
    name: "hard break made of two spaces",
    input: "line one  \nweb hook\n",
    contains: ["line one  \nwebhook"],
  },
  {
    name: "hard break made of a backslash",
    input: "line one\\\nweb hook\n",
    contains: ["line one\\\nwebhook"],
  },
  {
    name: "thematic break",
    input: "web hook\n\n---\n\nweb hook\n",
    contains: ["webhook\n\n---\n\nwebhook"],
  },
  {
    name: "task list",
    input: "- [ ] web hook todo\n- [x] web hook done\n",
    contains: ["- [ ] webhook todo", "- [x] webhook done"],
  },
  {
    name: "ordered list",
    input: "1. web hook\n2. web hook\n",
    contains: ["1. webhook", "2. webhook"],
  },
  {
    name: "loose list",
    input: "- web hook\n\n- web hook\n",
    contains: ["- webhook\n\n- webhook"],
  },
  {
    name: "deeply nested list",
    input: "- a\n  - b\n    - web hook deep\n",
    contains: ["    - webhook deep"],
  },
  {
    name: "emphasis and strong",
    input: "*web hook* and **web hook** and _web hook_\n",
    contains: ["_webhook_ and **webhook** and _webhook_"],
  },
  {
    name: "HTML entity",
    input: "&amp; web hook\n",
    contains: ["&amp; webhook"],
  },
  {
    name: "fence after a reference definition",
    input: "[ref]: /x\n\n```\nweb hook\n```\n",
    contains: ["[ref]: /x", "```\nweb hook\n```"],
    notContains: ["webhook"],
  },
  {
    name: "fence inside a blockquote",
    input: "> web hook\n>\n> ```\n> web hook\n> ```\n",
    contains: ["> webhook", "> ```\n> web hook\n> ```"],
  },
  {
    name: "fence in a list item with no blank line",
    input: "- web hook\n  ```\n  web hook\n  ```\n",
    contains: ["- webhook", "  ```\n  web hook\n  ```"],
  },
  {
    name: "code span in a table cell",
    input: "| a |\n| --- |\n| `web hook` |\n",
    contains: ["| `web hook` |"],
    notContains: ["webhook"],
  },
  {
    name: "empty document",
    input: "",
    contains: [],
    equals: "",
  },
  {
    name: "document of only whitespace",
    input: "   \n\n  \n",
    contains: [],
    equals: "",
  },
  {
    name: "document with nothing to replace",
    input: "nothing to change\n",
    contains: ["nothing to change"],
  },
]

// Constructs that only the mdx parser gives meaning to.
export const mdxConstructCases = [
  {
    name: "JSX flow element children",
    input: "<Note>\n\nweb hook here\n\n</Note>\n",
    contains: ["<Note>", "webhook here", "</Note>"],
  },
  {
    name: "JSX inline element children",
    input: "text <Badge>web hook</Badge> tail\n",
    contains: ["<Badge>webhook</Badge>"],
  },
  {
    name: "JSX attribute string",
    input: '<Note title="web hook">\n\ntext\n\n</Note>\n',
    contains: ['<Note title="webhook">'],
  },
  {
    name: "self-closing JSX element attributes",
    input: '<Img alt="web hook" src="/a.png" />\n',
    contains: ['<Img alt="webhook" src="/a.png" />'],
  },
  {
    name: "string inside an expression attribute",
    input: '<Note count={1} label={"web hook"} />\n',
    contains: ['label={"webhook"}'],
  },
  {
    name: "attribute value holding a greater-than sign",
    input: '<Note cond="a > b web hook">\n\ntext\n\n</Note>\n',
    contains: ['cond="a > b webhook"'],
  },
  {
    name: "code span inside a JSX element",
    input: "<Note>\n\n`web hook` and web hook\n\n</Note>\n",
    contains: ["`web hook` and webhook"],
  },
  {
    name: "fence inside a JSX element",
    input: "<Note>\n\n```\nweb hook\n```\n\n</Note>\n",
    contains: ["```\nweb hook\n```"],
    notContains: ["webhook"],
  },
  {
    name: "MDX comment inside a JSX element",
    input: "<Note>\n\n{/* web hook */}\n\nweb hook\n\n</Note>\n",
    contains: ["{/* web hook */}", "webhook"],
  },
  {
    name: "ESM import specifier",
    input: 'import Note from "./web hook.js"\n\nweb hook\n',
    contains: ['from "./webhook.js"'],
  },
  {
    name: "ESM export value",
    input: 'export const title = "web hook"\n\nweb hook\n',
    contains: ['export const title = "webhook"'],
  },
  {
    name: "expression in prose is left alone",
    input: "value is {someVar} and web hook\n",
    contains: ["{someVar}", "webhook"],
  },
  {
    name: "string inside an expression in prose",
    input: 'value is {"web hook"} here\n',
    contains: ['{"webhook"}'],
  },
  {
    name: "template literal inside an expression",
    // Backticks make this an inline code span to the source scan, so the
    // expression is protected. That is the safe direction for JavaScript.
    input: "value {`web hook`} here and web hook\n",
    contains: ["{`web hook`}", "and webhook"],
  },
  {
    name: "code span wrapping expression markup",
    input: "text `{web hook}` tail web hook\n",
    contains: ["`{web hook}`", "tail webhook"],
  },
  {
    name: "inline MDX comment",
    input: "text {/* web hook */} tail web hook\n",
    contains: ["{/* web hook */}", "tail webhook"],
  },
  {
    name: "two adjacent MDX comments",
    input: "{/* a web hook */}{/* b web hook */}\n\nweb hook\n",
    contains: ["{/* a web hook */}{/* b web hook */}", "webhook"],
  },
  {
    name: "comment end markup inside a comment string",
    input: '{/* text "*/}" more */}\n\nweb hook\n',
    contains: ['{/* text "*/}" more */}', "webhook"],
  },
  {
    name: "escaped braces",
    input: "literal \\{web hook\\} here\n",
    contains: ["\\{webhook\\}"],
  },
  {
    name: "frontmatter next to a JSX element",
    input: "---\ntitle: web hook\n---\n\n<Note>web hook</Note>\n",
    contains: ["title: webhook", "<Note>webhook</Note>"],
  },
]

// A replacement is inserted verbatim, so a rule whose right side carries
// Markdown or MDX markup changes the document's structure rather than its
// wording. These cases pin that down, because the behavior is easy to mistake
// for a bug and the rule is what has to change.
export const markupInsertionCases = [
  {
    name: "inserting braces creates an MDX expression",
    input: "web hook here\n",
    entries: ["web hook=>{webhook}"],
    parser: "mdx",
    contains: ["{webhook} here"],
  },
  {
    name: "inserting a tag creates a JSX element",
    input: "web hook here\n",
    entries: ["web hook=><Badge/>"],
    parser: "mdx",
    contains: ["<Badge /> here"],
  },
  {
    name: "inserting backticks creates a code span",
    input: "web hook here\n",
    entries: ["web hook=>`webhook`"],
    parser: "markdown",
    contains: ["`webhook` here"],
  },
  {
    name: "inserting a pipe adds a table column",
    input: "| a |\n| --- |\n| web hook |\n",
    entries: ["web hook=>a|b"],
    parser: "markdown",
    contains: ["| a   | b   |"],
  },
]

// One document holding every construct the plugin has to survive, used for the
// end-to-end checks.
export const kitchenSinkDocument = [
  "---",
  "title: web hook",
  "---",
  "",
  "import Note from './note.js'",
  "",
  "# web hook guide",
  "",
  "{/* web hook comment */}",
  "",
  "Prose with web hook, `web hook` code, **web hook** bold and a <br> tag.",
  "",
  "- [ ] web hook todo",
  "  - nested web hook",
  "",
  "> web hook quote",
  "",
  "| name | web hook |",
  "| :--- | -------: |",
  "| web hook | `web hook` |",
  "",
  '<Note title="web hook">',
  "",
  "web hook inside",
  "",
  "</Note>",
  "",
  "```js",
  "const a = 'web hook'",
  "```",
  "",
  "~~~",
  "web hook tilde",
  "~~~",
  "",
  "    web hook indented",
  "",
  '[ref]: /docs/x "web hook title"',
  "",
  "See [x][ref] and ![web hook](/i.png).",
  "",
  "text[^1]",
  "",
  "[^1]: web hook note",
  "",
].join("\n")

// Documents whose code blocks the source scan has to find. Each is measured
// against the ranges Prettier's own Markdown parser reports, so the scan is
// held to the parser's reading of the document rather than to a guess.
//
// A case marked `knownGap` is one the scan deliberately under-reports. An
// indented code block nested in another block is left unprotected, because
// four spaces mean ordinary content there and mistaking list content for code
// would silently stop replacements; a block whose container the line before it
// does not reveal is left unprotected for the same reason. Such a case must
// still never report a range the parser does not, which is what the subset
// assertion checks.
export const blockCodeRangeCases = [
  { name: "top-level indented block", input: "text\n\n    code here\n" },
  { name: "indented block at the start", input: "    code here\n\ntext\n" },
  { name: "indented block after a heading", input: "# H\n\n    code here\n" },
  {
    name: "indented block after a list",
    input: "- a\n- b\n\ntext\n\n    code here\n",
  },
  {
    name: "indented block after a blockquote",
    input: "> quote\n\n    code here\n",
  },
  { name: "indented block after a fence", input: "```\na\n```\n\n    code\n" },
  {
    name: "indented run with an inner blank line",
    input: "t\n\n    a\n\n    b\n\nt\n",
  },
  { name: "tab-indented block", input: "text\n\n\tcode here\n" },
  {
    name: "indented line continuing a paragraph",
    input: "text\n    not code\n",
  },
  {
    name: "list content indented four spaces",
    input: "- item\n\n    content\n",
  },
  { name: "backtick fence", input: "text\n\n```js\ncode\n```\n" },
  { name: "tilde fence", input: "text\n\n~~~js\ncode\n~~~\n" },
  {
    name: "long backtick fence holding a short run",
    input: "t\n\n````\n```\n````\n",
  },
  {
    name: "fence indented three spaces",
    input: "text\n\n   ```\ncode\n   ```\n",
  },
  { name: "unclosed fence", input: "text\n\n```\nrest of doc\n" },
  {
    name: "fence run with a backtick in its info string",
    input: "t\n\n``` `x`\nc\n```\n",
  },
  {
    name: "backtick fence is not closed by a tilde run",
    input: "text\n\n~~~\ncode\n```\nmore\n~~~\n",
  },
  {
    name: "tilde fence is not closed by a backtick run",
    input: "text\n\n```\ncode\n~~~\nmore\n```\n",
  },
  {
    name: "two fences of different characters",
    input: "```\na\n```\n\nt\n\n~~~\nb\n~~~\n",
  },
  { name: "fence in a list item", input: "- item\n\n  ```\n  code\n  ```\n" },
  {
    name: "fence in a nested list item",
    input: "- outer\n  - inner\n\n    ```js\n    code\n    ```\n",
  },
  {
    name: "fence written inside an indented block",
    input: "text\n\n    ```\n    x\n    ```\n",
  },
  { name: "fence interrupting a paragraph", input: "text\n```\ncode\n```\n" },
  {
    // Four spaces of indentation are too many for a fence marker, and an
    // indented chunk cannot interrupt a paragraph either, so this line is
    // paragraph text and only the run at the end opens a block.
    name: "four-space indented fence continuing a paragraph",
    input: "text\n    ```\ncode\n```\n",
  },
  {
    name: "four-space indented fence after a blank line",
    input: "text\n\n    ```\ncode\n```\n",
  },
  {
    name: "fence indented three spaces interrupting a paragraph",
    input: "text\n   ```\ncode\n   ```\n",
  },
  {
    name: "closing fence indented three spaces further",
    input: "text\n\n```\ncode\n  ```\n\nmore\n",
  },
  {
    name: "closing fence indented four spaces further stays content",
    input: "text\n\n```\ncode\n    ```\n\nmore\n",
  },
  { name: "no code at all", input: "just prose\n\nmore prose\n" },
  { name: "empty document", input: "" },
  {
    // No blank line separates the fence from the marker. The item's content
    // starts two columns in, so four spaces are within reach of a fence.
    name: "fence right under a bullet marker",
    input: "- item\n    ```\n    code\n    ```\n",
  },
  {
    name: "fence right under an ordered marker",
    input: "1. step\n    ```sh\n    code\n    ```\n",
  },
  {
    name: "fence right under a wide ordered marker",
    input: "10. step\n    ```\n    code\n    ```\n",
  },
  {
    name: "tilde fence right under a list marker",
    input: "1. step\n    ~~~sh\n    code\n    ~~~\n",
  },
  {
    name: "fence right under a nested list marker",
    input: "- a\n  - b\n    ```\n    code\n    ```\n",
  },
  {
    name: "fence right under an empty list item",
    input: "-\n    ```\n    code\n    ```\n",
  },
  {
    name: "fence right under a marker followed by two spaces",
    input: "-  item\n      ```\n      code\n      ```\n",
  },
  {
    name: "fence five spaces under a bullet marker",
    input: "- item\n     ```\n     code\n     ```\n",
  },
  {
    name: "tab-indented fence right under a list marker",
    input: "- item\n\t```\n\tcode\n\t```\n",
  },
  {
    // No trailing newline: whether an unclosed fence inside a list item ends
    // before or after the final line break differs between Prettier releases.
    name: "unclosed fence right under a list marker",
    input: "- item\n    ```\n    code",
  },
  {
    name: "fence under a continuation line of a list item",
    input: "- item\n  more\n    ```\n    code\n    ```\n",
  },
  {
    name: "fence under a paragraph inside a list item",
    input: "- item\n\n    text\n    ```\n    code\n    ```\n",
  },
  {
    name: "fence under a nested list and an outer continuation line",
    input: "- a\n  - b\n  text\n    ```\n    code\n    ```\n",
  },
  {
    // Six spaces under a two-column marker are too many for a fence, so both
    // runs are paragraph text. Neither may be reported as a block: the closing
    // run in particular must not be read as an opening fence on the strength
    // of the indented line before it, which would protect the rest of the
    // document.
    name: "fence run indented too far under a bullet marker",
    input: "- item\n      ```\n      code\n      ```\n",
  },
  {
    name: "fence run indented eight spaces under a bullet marker",
    input: "- item\n        ```\n        code\n        ```\n",
  },
  {
    name: "indented block right after an ATX heading",
    input: "# H\n    code here\n",
  },
  {
    name: "indented block right after a thematic break",
    input: "***\n    code here\n",
  },
  {
    name: "indented block right after an underscore thematic break",
    input: "___\n    code here\n",
  },
  {
    name: "indented block right after a setext heading",
    input: "Title\n===\n    code here\n",
  },
  {
    name: "indented block right after a closing fence",
    input: "```\na\n```\n    code here\n",
  },
  {
    name: "indented block after a list ended by a thematic break",
    input: "- item\n---\n    code here\n",
  },
  {
    // A run of `=` with nothing but a blank line above it is paragraph text,
    // not a heading underline, so the indented line continues that paragraph.
    name: "indented line after an equals paragraph",
    input: "\n===\n    text\n",
  },
  {
    name: "indented line after an equals line opening the document",
    input: "===\n    text\n",
  },
  {
    name: "indented line after a heading-like paragraph",
    input: "#hashtag\n    text\n",
  },
  {
    name: "indented line after a heading inside a list item",
    input: "- item\n  # H\n    text\n",
  },
  {
    name: "indented line after an HTML block",
    input: "<div>\n</div>\n    text\n",
  },
  {
    name: "indented block inside a list item",
    input: "- item\n\n      nested code\n",
    knownGap: true,
  },
  {
    name: "indented block inside a blockquote",
    input: "> quote\n>\n>     quoted code\n",
    knownGap: true,
  },
  {
    name: "indented block after a blockquote that holds one",
    input: ">     inner\n\n    code here\n",
    knownGap: true,
  },
  {
    // The parser ends the table at the indented line; the scan does not know
    // a table row when it sees one.
    name: "indented block right after a table",
    input: "| a |\n| - |\n    code here\n",
    knownGap: true,
  },
  {
    // Five spaces after the marker open an indented code block inside the
    // item, which is nested indented code.
    name: "list item opening with indented code",
    input: "-     code here\n",
    knownGap: true,
  },
  {
    // The fence is accepted on the indentation of the line before it alone,
    // and with nothing closing it that guess is not acted on.
    name: "unclosed fence under a continuation line of a list item",
    input: "- item\n  more\n    ```\n    code\n",
    knownGap: true,
  },
]

// The same document without the MDX comment, for the markdown parser. Prettier
// releases before 3.9 rewrite `{/* ... */}` into emphasis markup when the
// markdown parser prints it, and once the comment markup is gone its text is
// ordinary prose that a rule then reaches. An MDX comment is an MDX construct,
// so the markdown-parser checks use a document without one.
export const markdownKitchenSinkDocument = kitchenSinkDocument
  .split("\n")
  .filter((line) => !line.startsWith("{/*"))
  .join("\n")
