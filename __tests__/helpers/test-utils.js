import prettier from "prettier"
import plugin from "../../index.js"

// The suite pins `printWidth` and `proseWrap` so that a failure points at a
// replacement rather than at Prettier's own reflowing.
const baseOptions = {
  printWidth: 99999,
  proseWrap: "never",
}

export async function formatWithPlugin(
  content,
  parser = "markdown",
  options = {}
) {
  return await prettier.format(content, {
    parser,
    plugins: [plugin],
    ...baseOptions,
    ...options,
  })
}

export async function formatWithoutPlugin(content, parser = "markdown") {
  return await prettier.format(content, {
    parser,
    ...baseOptions,
  })
}

export const withReplacements = (entries) => ({
  markdownReplacements: entries,
})

// Shorthand for the common case: one document, one list of rules.
export async function formatWithRules(content, entries, parser = "markdown") {
  return await formatWithPlugin(content, parser, withReplacements(entries))
}

export function expectMdxCommentPreservation(result, expectedComments) {
  expectedComments.forEach((comment) => {
    expect(result).toContain(comment)
  })
  // An MDX comment that Prettier escaped into an HTML comment is broken output,
  // so the absence of both markers is part of the assertion.
  expect(result).not.toContain("<!--")
  expect(result).not.toContain("-->")
}

export function expectBrTagNormalization(result) {
  expect(result).toContain("<br />")
  expect(result).not.toContain("<br>")
  expect(result).not.toContain("<br/>")
  expect(result).not.toContain("<BR>")
  expect(result).not.toContain("<Br/>")
  expect(result).not.toContain("<br >")
}

// The ranges Prettier's own Markdown parser reports for code blocks, used as
// the reference the plugin's source scan is measured against.
export async function parserCodeBlockRanges(text) {
  const { default: markdownPlugin } =
    await import("prettier/plugins/markdown.js")
  const ast = await markdownPlugin.parsers.markdown.parse(text, {
    originalText: text,
  })

  const ranges = []
  const walk = (node) => {
    if (!node || typeof node !== "object") return
    if (node.type === "code" && node.position?.start?.offset != null) {
      ranges.push({
        start: node.position.start.offset,
        end: node.position.end.offset,
      })
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(ast)
  return ranges
}

// Whether a fenced block's range starts at the line or at the marker has
// changed between Prettier releases, and either answer protects the same code.
// Normalizing both sides past the indentation in front of a fence marker is
// what lets one expectation hold across the supported range of versions.
const FENCE_INDENT_PATTERN = /^[ \t]*(?=[`~]{3,})/

export const normalizeCodeRanges = (text, ranges) =>
  ranges.map(({ start, end }) => {
    const indent = FENCE_INDENT_PATTERN.exec(text.slice(start, end))
    return `${start + (indent ? indent[0].length : 0)}-${end}`
  })
