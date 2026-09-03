import { describe, it, expect, vi } from "vitest"
import { compile } from "@mdx-js/mdx"
import {
  formatWithPlugin,
  formatWithoutPlugin,
  formatWithRules,
  expectBrTagNormalization,
  expectMdxCommentPreservation,
  parserCodeBlockRanges,
  normalizeCodeRanges,
} from "./helpers/test-utils.js"
import {
  brOptions,
  brAndWordOptions,
  wordOptions,
  wordRule,
  escapedBracketOptions,
  brTagTestCases,
  ruleFormatTestCases,
  documentConstructCases,
  mdxConstructCases,
  markupInsertionCases,
  kitchenSinkDocument,
  markdownKitchenSinkDocument,
  blockCodeRangeCases,
} from "./helpers/test-data.js"

// Replacements are applied to the source before it is parsed, so the two
// parsers share the whole mechanism and differ only in how the result is
// printed. Everything that is not specific to one syntax therefore runs against
// both, which is what keeps a change in one from passing unnoticed in the other.
const SHARED_PARSERS = ["markdown", "mdx"]

// The plugin wraps every parser the built-in Markdown plugin declares.
const ALL_PARSERS = ["markdown", "mdx", "remark"]

describe("prettier-plugin-markdown-replacements", () => {
  describe("1. rule formats", () => {
    // Rules are parsed from the option value alone, with no bearing on the
    // parser, so one parser is enough here.
    ruleFormatTestCases.forEach((testCase) => {
      it(testCase.name, async () => {
        const result = await formatWithRules(testCase.input, testCase.entries)
        expect(result).toContain(testCase.expected)
      })
    })

    it("replaces nothing when the option is absent", async () => {
      const result = await formatWithPlugin("Check the web hook settings")
      expect(result).toContain("web hook")
    })

    it("replaces nothing when the option is an empty array", async () => {
      const result = await formatWithRules("Check the web hook settings", [])
      expect(result).toContain("web hook")
    })

    it("rejects an option value that is not an array", async () => {
      // Prettier validates the option before the parser runs, so a malformed
      // value fails loudly rather than being ignored.
      await expect(
        formatWithPlugin("Check the web hook settings", "markdown", {
          markdownReplacements: wordRule,
        })
      ).rejects.toThrow(/markdownReplacements/)
    })

    it("rejects entries that are not strings", async () => {
      await expect(
        formatWithRules("kept text", [null, 42, "kept=>replaced"])
      ).rejects.toThrow(/markdownReplacements/)
    })

    it("skips entries with no separator or an empty left side", async () => {
      const result = await formatWithRules("noseparator noleftside kept", [
        "noseparator",
        "=>noleftside",
        "kept=>replaced",
      ])

      expect(result).toContain("noseparator")
      expect(result).toContain("noleftside")
      expect(result).toContain("replaced")
    })

    it("reads a malformed regular expression as a literal rule and applies the rest", async () => {
      // `/[/g` never closes its character class, so it is not a regular
      // expression. The entry still has a separator, and its left side is the
      // literal text `/[/g`.
      const result = await formatWithRules("valid sentence /[/g", [
        "/[/g=>X",
        "valid=>replaced",
      ])
      expect(result).toContain("replaced sentence X")
    })
  })

  describe("2. parser coverage", () => {
    ALL_PARSERS.forEach((parser) => {
      it(`applies rules with the ${parser} parser`, async () => {
        const result = await formatWithRules(
          "web hook and `web hook`\n",
          [wordRule],
          parser
        )
        expect(result).toContain("webhook and")
        expect(result).toContain("`web hook`")
      })
    })

    it("wraps every parser the built-in plugin declares", async () => {
      const { default: markdownPlugin } =
        await import("prettier/plugins/markdown.js")
      const { default: plugin } = await import("../index.js")

      expect(Object.keys(plugin.parsers).sort()).toEqual(
        Object.keys(markdownPlugin.parsers).sort()
      )
    })
  })

  describe.each(SHARED_PARSERS)(
    "3. where replacements apply (%s)",
    (parser) => {
      it("applies to prose and to table cells alike", async () => {
        const input = `| web hook | value |
| --- | --- |
| web hook | 1 |

Check the web hook settings`
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook")
        expect(result).not.toContain("web hook")
      })

      it("applies to headings and list items", async () => {
        const input = "# web hook guide\n\n- web hook one\n- web hook two"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("# webhook guide")
        expect(result).toContain("- webhook one")
        expect(result).not.toContain("web hook")
      })

      it("applies to link text", async () => {
        const result = await formatWithPlugin(
          "[web hook](/guide/hooks)",
          parser,
          wordOptions
        )
        expect(result).toContain("[webhook]")
      })

      it("applies to a link target", async () => {
        const result = await formatWithRules(
          "[guide](/docs/old)",
          ["/docs/old=>/docs/new"],
          parser
        )
        expect(result).toContain("(/docs/new)")
      })
    }
  )

  describe.each(SHARED_PARSERS)("4. document constructs (%s)", (parser) => {
    documentConstructCases.forEach(
      ({ name, input, contains, notContains = [], equals }) => {
        it(name, async () => {
          const result = await formatWithRules(input, [wordRule], parser)
          if (equals !== undefined) expect(result).toBe(equals)
          contains.forEach((expected) => expect(result).toContain(expected))
          notContains.forEach((absent) => expect(result).not.toContain(absent))
        })
      }
    )
  })

  describe("5. MDX constructs", () => {
    mdxConstructCases.forEach(({ name, input, contains, notContains = [] }) => {
      it(name, async () => {
        const result = await formatWithRules(input, [wordRule], "mdx")
        contains.forEach((expected) => expect(result).toContain(expected))
        notContains.forEach((absent) => expect(result).not.toContain(absent))
      })
    })

    it("keeps a fence inside a JSX element from being replaced", async () => {
      // With no blank line around it, Prettier folds the whole element onto one
      // line, which is its own behavior. What matters here is that the code
      // itself never went through a replacement.
      const input = "<Note>\n```\nweb hook\n```\n</Note>\n"
      const result = await formatWithRules(input, [wordRule], "mdx")

      expect(result).toContain("web hook")
      expect(result).not.toContain("webhook")
    })
  })

  describe.each(SHARED_PARSERS)(
    "6. protected regions: inline code (%s)",
    (parser) => {
      it("leaves an inline code span alone", async () => {
        const input =
          "| name | note |\n| --- | --- |\n| `web hook` | web hook |"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("`web hook`")
        expect(result).toContain("| webhook |")
      })

      it("leaves a multi-backtick code span alone", async () => {
        const input = "web hook and ``a ` web hook`` here"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("``a ` web hook``")
        expect(result).toContain("webhook and")
      })

      it("leaves an unmatched backtick as prose", async () => {
        const result = await formatWithPlugin(
          "web hook ` unmatched web hook",
          parser,
          wordOptions
        )
        expect(result).not.toContain("web hook")
      })

      it("does not pair a backtick across a blank line", async () => {
        // A blank line ends the paragraph, and a code span cannot outlive its
        // paragraph. Pairing the two backticks anyway would protect the prose
        // between them.
        const result = await formatWithPlugin(
          "x ` web hook\n\nweb hook ` y",
          parser,
          wordOptions
        )

        expect(result).toContain("x ` webhook")
        expect(result).toContain("webhook ` y")
      })

      it("pairs a code span across a single line break", async () => {
        const result = await formatWithPlugin(
          "x `web\nhook` y web hook",
          parser,
          wordOptions
        )

        expect(result).toContain("`web hook`")
        expect(result).toContain("y webhook")
      })

      it("confines a stray backtick to its own paragraph", async () => {
        // Paired across paragraphs, one stray backtick would shift every span
        // after it: prose would be protected and code exposed for the rest of
        // the document.
        const result = await formatWithPlugin(
          "stray ` here web hook\n\n`web hook` and web hook and `more`",
          parser,
          wordOptions
        )

        expect(result).toContain("here webhook")
        expect(result).toContain("`web hook` and webhook and `more`")
      })

      it("protects a code span from a regular expression rule too", async () => {
        const input =
          "| name | note |\n| --- | --- |\n| `up to 50` | up to 50 |"
        const result = await formatWithRules(
          input,
          ["/up to ([0-9]+)/g=>up to: $1"],
          parser
        )

        expect(result).toContain("`up to 50`")
        expect(result).toContain("up to: 50")
      })
    }
  )

  describe.each(SHARED_PARSERS)(
    "7. protected regions: fenced code blocks (%s)",
    (parser) => {
      it("leaves a backtick fence alone", async () => {
        const input = "web hook\n\n```\nweb hook\n```"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("```\nweb hook\n```")
        expect(result).toContain("webhook\n")
      })

      it("leaves a fence with an info string alone", async () => {
        const input = 'web hook\n\n```json\n{ "key": "web hook" }\n```'
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain('"web hook"')
      })

      it("leaves a tilde fence alone", async () => {
        // Prettier rewrites a tilde fence into a backtick fence, which is its
        // own normalization; what matters is that the content is untouched.
        const input = "web hook\n\n~~~\nweb hook\n~~~"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("```\nweb hook\n```")
        expect(result).toContain("webhook\n")
      })

      it("keeps a shorter fence run inside a longer one as content", async () => {
        const input = "web hook\n\n````\n```\nweb hook\n```\n````"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("```\nweb hook\n```")
        expect(result).toContain("webhook\n")
      })

      it("leaves a fence indented by three spaces alone", async () => {
        const input = "web hook\n\n   ```\n   web hook\n   ```"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("web hook\n")
        expect(result).toContain("webhook\n")
      })

      it("leaves a fence inside a list item alone", async () => {
        const input = "- web hook item\n\n  ```\n  web hook\n  ```"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("  web hook\n")
        expect(result).toContain("webhook item")
      })

      it("leaves a fence inside a nested list item alone", async () => {
        const input =
          "- outer\n  - web hook inner\n\n    ```\n    web hook\n    ```"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    web hook\n")
        expect(result).toContain("webhook inner")
      })

      it("leaves a fence written right under a list marker alone", async () => {
        // No blank line separates the fence from the marker, and four spaces
        // are within reach of the item's content, so this is a fence to
        // CommonMark and to Prettier. Prettier reindents the block to the
        // item's content column, which is its own normalization.
        const input =
          "1. web hook step\n    ```sh\n    web hook\n    ```\n\nweb hook after\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook step")
        expect(result).toContain("```sh\n   web hook\n   ```")
        expect(result).toContain("webhook after")
      })

      it("leaves a tilde fence written right under a list marker alone", async () => {
        // A tilde run is never an inline code span, so nothing but the block
        // scan can protect this one.
        const input =
          "1. step\n    ~~~sh\n    web hook\n    ~~~\n\nweb hook after\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("web hook\n")
        expect(result).toContain("webhook after")
      })

      it("leaves a fence right under a list marker alone when it holds a backtick run", async () => {
        // Backtick counting alone would pair the opening run with the run
        // inside the block and expose the rest of the block's content.
        const input =
          "1. step\n    ````txt\n    use ``` here web hook\n    ````\n\nweb hook after\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("use ``` here web hook")
        expect(result).toContain("webhook after")
      })

      it("leaves a fence that Prettier formats as embedded Markdown alone", async () => {
        // Prettier formats the content of a `md` fence as a Markdown document
        // of its own, through this same parser, which is what rewrites the
        // emphasis below. The rules must not reach that inner document: the
        // block is code in the document that holds it.
        const input =
          "web hook\n\n```md\nweb hook in *code*\n```\n\n```markdown\nweb hook too\n```\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result.startsWith("webhook\n")).toBe(true)
        expect(result).toContain("```md\nweb hook in _code_\n```")
        expect(result).toContain("```markdown\nweb hook too\n```")
      })

      it("leaves a fence under a nested list marker alone", async () => {
        const input = "- a\n  - b\n    ```\n    web hook\n    ```\n\nweb hook\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    web hook\n")
        expect(result).toContain("\nwebhook\n")
      })

      it("does not read an over-indented closing run as an opening fence", async () => {
        // Six spaces under a two-column marker are too many for a fence, so
        // both runs are paragraph text that Prettier prints as one code span.
        // Reading the second run as a fence that never closes would protect
        // everything after it.
        const input =
          "- item\n      ```\n      web hook\n      ```\n\nweb hook after\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("web hook")
        expect(result).toContain("webhook after")
      })

      it("protects an unclosed fence to the end of the document", async () => {
        // CommonMark reads an unclosed fence as running to the end of the
        // document, and Prettier prints the rest as code, so protecting it is
        // what keeps the plugin consistent with the output.
        const input = "web hook\n\n```\nweb hook\nweb hook again"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook\n")
        expect(result).toContain("web hook\nweb hook again")
      })

      it("leaves a fence that interrupts a paragraph alone", async () => {
        const input = "first line\n```\nweb hook\n```"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("```\nweb hook\n```")
      })

      it("leaves a three-space indented fence that interrupts a paragraph alone", async () => {
        // Up to three spaces still belong to the fence marker, so this opens a
        // code block even though no blank line precedes it.
        const input = "first line\n   ```\nweb hook\n   ```"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("```\nweb hook\n```")
      })

      it("closes on a fence indented up to three spaces further", async () => {
        const input = "web hook\n\n```\nweb hook\n  ```\n\nweb hook again\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("```\nweb hook\n```")
        expect(result).toContain("webhook again")
      })

      it("does not close on a fence indented four spaces further", async () => {
        // Four spaces make the line content of the block, so the fence stays
        // open to the end of the document and Prettier reprints it with a
        // longer marker.
        const input = "web hook\n\n```\nweb hook\n    ```\n\nweb hook again\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("web hook again")
        expect(result).not.toContain("webhook again")
      })

      it("is not closed by a run of the other fence character", async () => {
        // A tilde run inside a backtick fence is content, so the fence stays
        // open and everything up to its real close is protected.
        const input = "web hook\n\n```\nweb hook\n~~~\nweb hook again\n```\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("web hook\n~~~\nweb hook again")
        expect(result).not.toContain("webhook again")
      })

      it("treats a fence run with a backtick in its info string as a span", async () => {
        // A backtick fence may not carry a backtick in its info string, so this
        // line is prose holding an inline code span. Everything after it is
        // prose too, and a replacement has to reach it.
        const input = "prose web hook\n\n``` `x`\nweb hook inside\n```\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("prose webhook")
        expect(result).toContain("`x`")
        expect(result).toContain("webhook inside")
      })
    }
  )

  describe.each(SHARED_PARSERS)(
    "8. protected regions: indented code blocks (%s)",
    (parser) => {
      it("leaves a top-level indented block alone", async () => {
        const input = "web hook\n\n    const a = 'web hook'\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    const a = 'web hook'")
        expect(result).toContain("webhook\n")
      })

      it("leaves an indented block at the start of the document alone", async () => {
        const input = "    const a = 'web hook'\n\nweb hook\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    const a = 'web hook'")
        expect(result).toContain("webhook\n")
      })

      it("leaves a tab-indented block alone", async () => {
        const input = "web hook\n\n\tconst a = 'web hook'\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("const a = 'web hook'")
        expect(result).toContain("webhook\n")
      })

      it("keeps a blank line inside an indented run in the same block", async () => {
        const input =
          "web hook\n\n    web hook one\n\n    web hook two\n\nweb hook\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    web hook one")
        expect(result).toContain("    web hook two")
        expect(result).toContain("webhook\n")
      })

      it("leaves an indented block after a blockquote alone", async () => {
        const input = "> web hook quote\n\n    const a = 'web hook'\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    const a = 'web hook'")
        expect(result).toContain("webhook quote")
      })

      it("leaves an indented block after a fence alone", async () => {
        const input = "```\nfenced\n```\n\n    const a = 'web hook'\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    const a = 'web hook'")
      })

      it("leaves an indented block right under a closing fence alone", async () => {
        // A closing fence ends its block on its own, so unlike a paragraph
        // line it does not turn the indented line after it into continuation
        // text.
        const input = "```\nfenced\n```\n    const a = 'web hook'\n\nweb hook\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("    const a = 'web hook'")
        expect(result).toContain("\nwebhook\n")
      })

      it("leaves an indented block right under a heading alone", async () => {
        const input = "# web hook\n    const a = 'web hook'\n\nweb hook\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("# webhook")
        expect(result).toContain("    const a = 'web hook'")
        expect(result).toContain("\nwebhook\n")
      })

      it("leaves an indented block right under a setext heading alone", async () => {
        const input = "web hook\n===\n    const a = 'web hook'\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook")
        expect(result).toContain("    const a = 'web hook'")
      })

      it("leaves an indented block right under a thematic break alone", async () => {
        const input = "web hook\n\n***\n    const a = 'web hook'\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook\n")
        expect(result).toContain("    const a = 'web hook'")
      })

      it("still replaces in an indented line that continues a paragraph", async () => {
        // An indented chunk cannot interrupt a paragraph, so this line is prose.
        const input = "first line\n    web hook\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook")
      })

      it("still replaces in indented list content", async () => {
        // Four spaces after a list marker are list content, not a code block.
        // Treating them as code would silently stop replacements inside lists,
        // which is the regression this test guards against.
        const input = "- item\n\n    web hook continuation\n"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook continuation")
      })
    }
  )

  describe.each(SHARED_PARSERS)(
    "9. protected regions: MDX comments (%s)",
    (parser) => {
      it("leaves the content of an MDX comment alone", async () => {
        // Whether the `{/* ... */}` markup survives is Prettier's decision and
        // has changed between releases for the markdown parser, so what is
        // asserted here is the plugin's part: no replacement reaches inside.
        const input = "web hook\n\n{/* web hook inside */}"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("web hook inside")
        expect(result.startsWith("webhook")).toBe(true)
      })

      it("leaves the content of a multi-line MDX comment alone", async () => {
        // Prettier rewrites a multi-line MDX comment's markup into
        // `{/_ ... _/}` on its own, with or without this plugin, so the
        // assertion is about the content: no replacement may reach inside.
        // Keeping the markup intact is the job of a plugin that owns the
        // printer.
        const input = "web hook\n\n{/*\nweb hook inside\n*/}"
        const result = await formatWithPlugin(input, parser, wordOptions)
        const plain = await formatWithoutPlugin(input, parser)

        expect(result).toContain("web hook inside")
        expect(result.startsWith("webhook")).toBe(true)
        expect(plain).toContain("web hook inside")
      })

      it("protects a code fence written inside an MDX comment", async () => {
        const input = "web hook\n\n{/*\n```\nweb hook\n```\n*/}"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("```\nweb hook\n```")
        expect(result).toContain("webhook\n")
      })

      it("looks for the comment close after the opener, not inside it", async () => {
        // `{/*/}` is not a comment: the close has to come after `{/*`, so the
        // real close here is the `*/}` at the end and the whole run is one
        // comment. Searching from the opener itself would end the comment on
        // its own third character and expose the text to a replacement.
        const result = await formatWithRules(
          "{/*/} web hook */}\n\nweb hook\n",
          [wordRule],
          parser
        )

        // Prettier reprints the comment's markup differently per parser and
        // per release, so the assertion is that the text inside was not
        // replaced while the prose after it was.
        expect(result).toContain("web hook")
        expect(result).toContain("webhook")
      })

      it("does not treat an unterminated comment opener as a comment", async () => {
        const result = await formatWithRules(
          "web hook {/* unterminated",
          [wordRule],
          parser
        )
        expect(result).toContain("webhook")
      })

      it("does not skip replacements when a code span holds comment markup", async () => {
        // Lifting the comment first leaves a token that the code span then
        // swallows. That is nesting, not loss, so the safeguard must not fire.
        // Guards a case where every replacement in a real document was
        // cancelled.
        const input =
          "web hook guide\n\nComment markup is written `{/* like this */}`."
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook guide")
        expect(result).toContain("`{/* like this */}`")
      })

      it("does not skip replacements when a code block holds comment markup", async () => {
        const input = "web hook guide\n\n```mdx\n{/* web hook */}\n```"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook guide")
        expect(result).toContain("{/* web hook */}")
      })
    }
  )

  describe.each(SHARED_PARSERS)(
    "10. dollar signs are inserted verbatim (%s)",
    (parser) => {
      // `String.prototype.replaceAll` would read these as substitution
      // patterns.
      const cases = [
        { name: "$& in a literal replacement", to: "x$&y", expected: "x$&y" },
        { name: "$$ in a literal replacement", to: "x$$y", expected: "x$$y" },
        { name: "$` in a literal replacement", to: "x$`y", expected: "x$`y" },
        { name: "$1 in a literal replacement", to: "x$1y", expected: "x$1y" },
      ]

      cases.forEach(({ name, to, expected }) => {
        it(name, async () => {
          const result = await formatWithRules(
            "token here",
            [`token=>${to}`],
            parser
          )
          expect(result).toContain(expected)
        })
      })

      it("keeps a dollar sign inside a restored code span", async () => {
        const input = "web hook and `a $& b` here"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("`a $& b`")
        expect(result).toContain("webhook and")
      })

      it("keeps a dollar sign inside a restored code block", async () => {
        const input = 'web hook\n\n```sh\necho "$$ $& $1"\n```'
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain('echo "$$ $& $1"')
        expect(result).toContain("webhook\n")
      })

      it("still expands $1 and $& for a regular expression rule", async () => {
        // A capture reference is the point of a regex rule, so the two rule
        // kinds deliberately differ here.
        const result = await formatWithRules(
          "version 7 applies",
          ["/version ([0-9]+)/g=>[$&|$1]"],
          parser
        )
        expect(result).toContain("[version 7|7]")
      })
    }
  )

  describe.each(SHARED_PARSERS)(
    "11. safeguard for consumed placeholders (%s)",
    (parser) => {
      it("leaves the document untouched when a pattern eats a placeholder", async () => {
        // Replacements run on the whole source at once, so meeting a pattern
        // that consumes a token leaves the entire document as written, not just
        // one paragraph.
        const result = await formatWithRules(
          "value `code` between\n\nanother paragraph",
          ["/[A-Za-z_]+/g=>X"],
          parser
        )
        expect(result).toContain("value `code` between")
        expect(result).toContain("another paragraph")
      })

      it("picks a different placeholder prefix when the document holds one", async () => {
        // A document can hold a token that a broken run leaked, and reusing
        // that prefix would let the restore overwrite the document's own text.
        // `Math.random` is pinned so the first candidate collides and the
        // second does not.
        const leaked = "__MARKDOWN_REPLACEMENTS_PLACEHOLDER_4fzzzx__CODE_0__"
        const randomSpy = vi
          .spyOn(Math, "random")
          .mockReturnValueOnce(0.123456789)
          .mockReturnValue(0.987654321)

        try {
          const result = await formatWithRules(
            `web hook ${leaked} and \`web hook\``,
            [wordRule],
            parser
          )

          // Prettier normalizes the `__ ... __` run into a strong-emphasis
          // marker, so the assertion is on the part it leaves alone. Reusing
          // the colliding prefix would replace this text with the code span's
          // own content.
          expect(result).toContain("MARKDOWN_REPLACEMENTS_PLACEHOLDER_4fzzzx")
          expect(result).toContain("`web hook`")
          expect(result).toContain("webhook")
        } finally {
          randomSpy.mockRestore()
        }
      })

      it("works on a document that already contains the placeholder prefix", async () => {
        const input = "web hook __MARKDOWN_REPLACEMENTS_PLACEHOLDER_ in prose"
        const result = await formatWithPlugin(input, parser, wordOptions)

        expect(result).toContain("webhook")
        expect(result).toContain("__MARKDOWN_REPLACEMENTS_PLACEHOLDER_")
      })

      it("leaves the document untouched when a rule forges a token", async () => {
        // A capture group can copy the prefix out of a real token and write a
        // token-shaped string that was never issued. Restoring would then
        // either leak it or look up a value that does not exist, so the
        // document is left as written.
        const result = await formatWithRules(
          "web hook `code`",
          [
            "/(PLACEHOLDER_[0-9a-z]+__)CODE_0__/g=>$1CODE_1__",
            "web hook=>webhook",
          ],
          parser
        )

        expect(result).toContain("web hook `code`")
        expect(result).not.toContain("webhook")
      })
    }
  )

  describe("12. rules that insert markup", () => {
    markupInsertionCases.forEach(
      ({ name, input, entries, parser, contains }) => {
        it(name, async () => {
          const result = await formatWithRules(input, entries, parser)
          contains.forEach((expected) => expect(result).toContain(expected))
        })
      }
    )
  })

  describe.each(SHARED_PARSERS)("13. line-break tag rule (%s)", (parser) => {
    brTagTestCases.forEach((testCase) => {
      it(testCase.name, async () => {
        const result = await formatWithPlugin(testCase.input, parser, brOptions)
        expectBrTagNormalization(result)
        expect(result.trim()).toBe(testCase.expected)
      })
    })

    it("tidies the spaces around a tag in a table cell", async () => {
      const result = await formatWithPlugin(
        "| A |\n| --- |\n| value <br /> line |",
        parser,
        brOptions
      )
      expect(result).toContain("value<br />line")
    })

    it("tidies the spaces around a tag within one line", async () => {
      const result = await formatWithPlugin(
        "line 1 <br> line 2",
        parser,
        brOptions
      )
      expect(result).toContain("line 1<br />line 2")
    })

    it("leaves the line break after a trailing tag alone", async () => {
      // Absorbing the line break would rewrite the document structure, so only
      // horizontal whitespace is tidied. Prettier then joins the paragraph's
      // lines with a space, which is the space left in the expectation.
      const result = await formatWithPlugin(
        "first line <br>\nsecond line",
        parser,
        brOptions
      )
      expect(result).toContain("first line<br /> second line")
    })

    it("keeps the paragraph boundary", async () => {
      const result = await formatWithPlugin(
        "first paragraph<br />\n\nsecond paragraph",
        parser,
        brOptions
      )
      expect(result).toContain("first paragraph<br />\n\nsecond paragraph")
    })

    it("does not collapse a list whose items end in a tag", async () => {
      // Guards a case where a rule that absorbed the line break broke real
      // documents.
      const result = await formatWithPlugin(
        "1. item A<br />\n1. item B<br />\n1. item C",
        parser,
        brOptions
      )

      expect(result).toContain("1. item A<br />\n")
      expect(result).toContain("1. item B<br />\n")
      expect(result).not.toContain("item A<br />1. item B")
    })

    it("keeps tag markup inside a code span", async () => {
      const input = "| A | B |\n| --- | --- |\n| `<br>` | value<br>line |"
      const result = await formatWithPlugin(input, parser, brOptions)

      expect(result).toContain("`<br>`")
      expect(result).toContain("value<br />line")
    })

    it("normalizes tags inside an HTML table", async () => {
      const input = "<table><tr><td>a<br>b</td></tr></table>"
      const result = await formatWithPlugin(input, parser, brOptions)

      expect(result).toContain("<br />")
      expect(result).not.toContain("<br>")
      expect(result).not.toContain("<br/>")
    })

    it("applies each rule when registered alongside the word rule", async () => {
      const result = await formatWithPlugin(
        "web hook<br>check",
        parser,
        brAndWordOptions
      )
      expect(result).toContain("webhook<br />check")
    })
  })

  describe.each(SHARED_PARSERS)(
    "14. unescaping square brackets (%s)",
    (parser) => {
      it("leaves the escape in place without the rule", async () => {
        const result = await formatWithPlugin("\\[example", parser)
        expect(result).toContain("\\[example")
      })

      it("unescapes with the rule registered", async () => {
        const result = await formatWithPlugin(
          "\\[example",
          parser,
          escapedBracketOptions
        )
        expect(result).toContain("[example")
      })

      it("does not unescape inside code or comments", async () => {
        const input = `\\[example
\`\\\\[code]\`

\`\`\`
\\\\[fence]
\`\`\`

{/* \\[comment] */}`
        const result = await formatWithPlugin(
          input,
          parser,
          escapedBracketOptions
        )

        expect(result).toContain("[example")
        expect(result).toContain("`\\\\[code]`")
        expect(result).toContain("```\n\\\\[fence]\n```")
        // The markup around the comment is Prettier's to print; the escape
        // inside it is what the rule must not have touched.
        expect(result).toContain("\\[comment]")
      })

      it("unescapes in prose that also holds a link", async () => {
        const input =
          "On the [app management page](https://developers.example.com/console/app), check the values in \\[App] > \\[General]."
        const result = await formatWithPlugin(
          input,
          parser,
          escapedBracketOptions
        )

        expect(result).toContain("in [App] > [General].")
        expect(result).not.toContain("\\[App]")
        expect(result).toContain(
          "[app management page](https://developers.example.com/console/app)"
        )
      })
    }
  )

  describe.each(SHARED_PARSERS)("15. idempotency (%s)", (parser) => {
    it("formatting twice gives the same result", async () => {
      const input =
        "web hook<br>check\n\n| a | b |\n| --- | --- |\n| web hook | 1 |"
      const once = await formatWithPlugin(input, parser, brAndWordOptions)
      const twice = await formatWithPlugin(once, parser, brAndWordOptions)
      expect(twice).toBe(once)
    })

    it("formatting twice gives the same result for every code block form", async () => {
      const input = [
        "web hook",
        "",
        "```js",
        "const a = 'web hook'",
        "```",
        "",
        "~~~",
        "web hook tilde",
        "~~~",
        "",
        "    const c = 'web hook'",
        "",
        "web hook",
      ].join("\n")
      const once = await formatWithPlugin(input, parser, wordOptions)
      const twice = await formatWithPlugin(once, parser, wordOptions)
      expect(twice).toBe(once)
    })
  })

  describe.each(SHARED_PARSERS)("16. whole document (%s)", (parser) => {
    const sink =
      parser === "mdx" ? kitchenSinkDocument : markdownKitchenSinkDocument

    it("replaces prose and protects every code form at once", async () => {
      const result = await formatWithPlugin(sink, parser, brAndWordOptions)

      // Replaced.
      expect(result).toContain("title: webhook")
      expect(result).toContain("# webhook guide")
      expect(result).toContain("- [ ] webhook todo")
      expect(result).toContain("> webhook quote")
      expect(result).toContain("webhook inside")
      expect(result).toContain('"webhook title"')
      expect(result).toContain("[^1]: webhook note")
      expect(result).toContain("![webhook](/i.png)")
      expect(result).toContain("<br />")

      // Protected.
      expect(result).toContain("`web hook`")
      expect(result).toContain("web hook tilde")
      expect(result).toContain("    web hook indented")
      expect(result).toContain('const a = "web hook"')
    })

    it("is idempotent", async () => {
      const once = await formatWithPlugin(sink, parser, brAndWordOptions)
      const twice = await formatWithPlugin(once, parser, brAndWordOptions)
      expect(twice).toBe(once)
    })

    it("leaves everything but the rules' targets as Prettier would", async () => {
      // The plugin must not change the printing of anything a rule does not
      // match, so a rule that matches nothing has to reproduce Prettier's own
      // output exactly.
      const withPlugin = await formatWithRules(
        sink,
        ["nothing-in-this-document=>x"],
        parser
      )
      const plain = await formatWithoutPlugin(sink, parser)
      expect(withPlugin).toBe(plain)
    })
  })

  describe("17. MDX comment markup and validity", () => {
    // The mdx parser keeps `{/* ... */}` on every supported release, so the
    // markup itself can be asserted here.
    it("keeps the comment markup", async () => {
      const result = await formatWithPlugin(
        "web hook\n\n{/* web hook */}",
        "mdx",
        wordOptions
      )

      expect(result).toContain("{/* web hook */}")
      expectMdxCommentPreservation(result, ["{/* web hook */}"])
    })

    it("keeps the comment markup in the whole document", async () => {
      const result = await formatWithPlugin(
        kitchenSinkDocument,
        "mdx",
        brAndWordOptions
      )
      expect(result).toContain("{/* web hook comment */}")
    })

    it("produces MDX that compiles", async () => {
      const input = `# web hook

{/* comment */}

| name | value |
| --- | --- |
| web hook | \`web hook\` |`
      const result = await formatWithPlugin(input, "mdx", brAndWordOptions)

      expect(result).toContain("# webhook")
      expect(result).toContain("`web hook`")
      await expect(compile(result, { jsx: true })).resolves.toBeTruthy()
    })

    it("produces MDX that compiles for the whole document", async () => {
      const result = await formatWithPlugin(
        kitchenSinkDocument,
        "mdx",
        brAndWordOptions
      )
      await expect(compile(result, { jsx: true })).resolves.toBeTruthy()
    })
  })

  describe("18. differences between the parsers", () => {
    it("the mdx parser formats an ESM statement as JavaScript", async () => {
      const result = await formatWithRules(
        'import Note from "./web hook.js"\n\nweb hook\n',
        [wordRule],
        "mdx"
      )
      expect(result).toContain('import Note from "./webhook.js";')
    })
  })

  describe("19. without the plugin", () => {
    SHARED_PARSERS.forEach((parser) => {
      it(`replaces nothing with the ${parser} parser`, async () => {
        const result = await formatWithoutPlugin("web hook", parser)
        expect(result).toContain("web hook")
      })
    })
  })

  describe.each(SHARED_PARSERS)("20. non-ASCII text (%s)", (parser) => {
    // The plugin was written for documentation that is largely CJK, where a
    // pattern has no word boundaries to lean on and a character can be outside
    // the BMP. These cases keep that behavior pinned; the literals have to stay
    // non-ASCII to be worth anything.
    it("replaces multi-byte text", async () => {
      const result = await formatWithRules(
        "동의 항목을 확인하세요",
        ["동의 항목=>동의항목"],
        parser
      )
      expect(result).toContain("동의항목을 확인하세요")
    })

    it("replaces a character outside the BMP with the u flag", async () => {
      const result = await formatWithRules(
        "status 😀 here",
        ["/😀/gu=>:grin:"],
        parser
      )
      expect(result).toContain("status :grin: here")
    })

    it("leaves multi-byte text inside a code span alone", async () => {
      const result = await formatWithRules(
        "동의 항목과 `동의 항목`",
        ["동의 항목=>동의항목"],
        parser
      )
      expect(result).toContain("`동의 항목`")
      expect(result).toContain("동의항목과")
    })
  })

  describe("21. block code detection against the parser", () => {
    blockCodeRangeCases.forEach(({ name, input, knownGap = false }) => {
      it(name, async () => {
        const { findBlockCodeRanges } = await import("../index.js")
        const expected = normalizeCodeRanges(
          input,
          await parserCodeBlockRanges(input)
        )
        const actual = normalizeCodeRanges(input, findBlockCodeRanges(input))

        if (knownGap) {
          // The scan reports fewer blocks than the parser here, and every
          // block it does report has to be one the parser agrees on. Reporting
          // a block the parser does not see is the dangerous direction,
          // because it stops replacements in ordinary prose.
          expect(actual.length).toBeLessThan(expected.length)
          actual.forEach((range) => expect(expected).toContain(range))
        } else {
          expect(actual).toEqual(expected)
        }
      })
    })
  })

  describe("22. defensive guards on direct parser use", () => {
    // Prettier validates the option before the parser runs, so these guards are
    // only reachable when the parser is driven directly. They are what keeps a
    // malformed value from throwing out of the preprocess hook.
    const preprocessWith = async (text, markdownReplacements) => {
      const { default: plugin } = await import("../index.js")
      const { parsers } = plugin
      return parsers.markdown.preprocess(text, { markdownReplacements })
    }

    it("ignores an option value that is not an array", async () => {
      expect(await preprocessWith("web hook", "web hook=>webhook")).toContain(
        "web hook"
      )
    })

    it("ignores an absent option value", async () => {
      expect(await preprocessWith("web hook", undefined)).toContain("web hook")
    })

    it("ignores an empty option array", async () => {
      expect(await preprocessWith("web hook", [])).toContain("web hook")
    })

    it("skips entries that are not strings", async () => {
      const result = await preprocessWith("kept text", [
        null,
        42,
        { from: "a", to: "b" },
        ["kept=>replaced"],
        "kept=>replaced",
      ])
      expect(result).toContain("replaced text")
    })

    it("applies a valid entry from a mixed array", async () => {
      expect(
        await preprocessWith("web hook", [null, "web hook=>webhook"])
      ).toContain("webhook")
    })
  })

  describe("23. wrapping a parser's preprocess", () => {
    // The plugin has to compose with Prettier's own preprocess rather than
    // replace it, because that normalization is what the printer then reads.
    const loadWrapper = async () => (await import("../index.js")).wrapParser

    it("runs the parser's own preprocess first", async () => {
      const wrapParser = await loadWrapper()
      const seen = []
      const wrapped = wrapParser({
        preprocess: (text) => {
          seen.push(text)
          return text.replace("PLACEHOLDER", "web hook")
        },
      })

      const result = wrapped.preprocess("PLACEHOLDER", {
        markdownReplacements: [wordRule],
      })

      expect(seen).toEqual(["PLACEHOLDER"])
      expect(result).toBe("webhook")
    })

    it("passes the options through to the parser's preprocess", async () => {
      const wrapParser = await loadWrapper()
      let received = null
      const wrapped = wrapParser({
        preprocess: (text, options) => {
          received = options
          return text
        },
      })

      const options = { markdownReplacements: [wordRule], filepath: "a.md" }
      wrapped.preprocess("web hook", options)

      expect(received).toBe(options)
    })

    it("uses the text as given when the parser has no preprocess", async () => {
      const wrapParser = await loadWrapper()
      const wrapped = wrapParser({})

      expect(
        wrapped.preprocess("web hook", { markdownReplacements: [wordRule] })
      ).toBe("webhook")
    })

    it("returns the parser's own result when no rule is registered", async () => {
      const wrapParser = await loadWrapper()
      const wrapped = wrapParser({ preprocess: (text) => `${text} normalized` })

      expect(wrapped.preprocess("web hook", {})).toBe("web hook normalized")
    })

    it("leaves an embedded document alone", async () => {
      // Prettier sets `parentParser` when it formats a fenced block's content
      // as a document of its own. That content is code in the outer document.
      const wrapParser = await loadWrapper()
      const wrapped = wrapParser({})

      expect(
        wrapped.preprocess("web hook", {
          markdownReplacements: [wordRule],
          parentParser: "markdown",
        })
      ).toBe("web hook")
    })

    it("keeps the parser's other properties", async () => {
      const wrapParser = await loadWrapper()
      const locStart = () => 0
      const wrapped = wrapParser({ astFormat: "mdast", locStart })

      expect(wrapped.astFormat).toBe("mdast")
      expect(wrapped.locStart).toBe(locStart)
    })
  })

  describe.each(SHARED_PARSERS)("24. known limitations (%s)", (parser) => {
    // An indented code block nested in another block is not recognized: four
    // spaces mean something else there, and no container tracking is done. The
    // replacement therefore reaches it. These tests record that, so a change in
    // behavior shows up as a failure rather than passing silently.
    it("does not protect an indented block inside a list item", async () => {
      const input = "- item\n\n      const a = 'web hook'\n"
      const result = await formatWithPlugin(input, parser, wordOptions)

      expect(result).toContain("webhook")
    })

    it("does not protect an indented block inside a blockquote", async () => {
      const input = "> quote\n>\n>     const a = 'web hook'\n"
      const result = await formatWithPlugin(input, parser, wordOptions)

      expect(result).toContain("webhook")
    })
  })
})
