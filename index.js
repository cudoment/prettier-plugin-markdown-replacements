import markdownPlugin from "prettier/plugins/markdown.js"

// Replacements run on the source text, before it is parsed. Prettier's Markdown
// printer reprints most nodes from the original text rather than from the AST,
// so a preprocess hook is the only place a replacement reaches every node while
// leaving the printer untouched. Leaving the printer alone is what lets this
// plugin sit alongside a plugin that does own the printer.

const REPLACEMENT_SEPARATOR = "=>"
const EMPTY_REPLACEMENTS = []
const optionReplacementsCache = new WeakMap()

const REGEX_FLAGS_PATTERN = /^[dgimsuvy]*$/

// Finds the closing delimiter of a leading `/pattern/` literal, skipping
// escapes and slashes inside a character class. Returns -1 when the entry does
// not open with a regular expression.
const findRegexBodyEnd = (entry) => {
  if (!entry.startsWith("/")) return -1

  let insideCharacterClass = false
  for (let index = 1; index < entry.length; index += 1) {
    const char = entry[index]
    if (char === "\\") {
      index += 1
      continue
    }
    if (char === "[") insideCharacterClass = true
    else if (char === "]") insideCharacterClass = false
    else if (char === "/" && !insideCharacterClass) return index
  }

  return -1
}

// `/pattern/flags=>replacement`. Returns null when the entry is not a valid
// regular expression rule, so the caller can fall back to a literal rule. That
// keeps a literal replacement starting with `/` (a URL path, for example)
// working.
const parseRegexEntry = (entry) => {
  const bodyEnd = findRegexBodyEnd(entry)
  if (bodyEnd <= 1) return null

  const separatorIndex = entry.indexOf(REPLACEMENT_SEPARATOR, bodyEnd + 1)
  if (separatorIndex === -1) return null

  const flags = entry.slice(bodyEnd + 1, separatorIndex)
  // An explicit allowlist rather than a necessary check: `RegExp` rejects an
  // unknown flag on its own, and the `catch` below turns that into the same
  // literal fallback. Keeping the list here states which flags a rule may use,
  // and keeps a flag added to a future JavaScript version from being accepted
  // before its behavior has been considered.
  if (!REGEX_FLAGS_PATTERN.test(flags)) return null

  try {
    return {
      // Replacing every occurrence is the only useful behavior here, so `g` is
      // added when the rule omits it.
      pattern: new RegExp(
        entry.slice(1, bodyEnd),
        flags.includes("g") ? flags : `${flags}g`
      ),
      to: entry.slice(separatorIndex + REPLACEMENT_SEPARATOR.length),
    }
  } catch {
    return null
  }
}

// `from=>to`. The separator is matched at its first occurrence, so the
// replacement may itself contain `=>`. Nothing is trimmed: leading and
// trailing spaces are part of the rule.
const parseLiteralEntry = (entry) => {
  const separatorIndex = entry.indexOf(REPLACEMENT_SEPARATOR)
  // A missing separator (-1) or an empty left side (0) is not a usable rule.
  if (separatorIndex <= 0) return null
  return {
    from: entry.slice(0, separatorIndex),
    to: entry.slice(separatorIndex + REPLACEMENT_SEPARATOR.length),
  }
}

const parseReplacementEntries = (entries) =>
  entries.flatMap((entry) => {
    if (typeof entry !== "string") return []
    const rule = parseRegexEntry(entry) ?? parseLiteralEntry(entry)
    return rule ? [rule] : []
  })

// The parsed rules are keyed by the option array itself, so a configuration
// that is reused across files is parsed once. A `WeakMap` is what keeps this
// from holding the array alive after Prettier drops it.
const getOptionReplacements = (options) => {
  const entries = options?.markdownReplacements
  if (!Array.isArray(entries) || !entries.length) return EMPTY_REPLACEMENTS

  const cached = optionReplacementsCache.get(entries)
  if (cached) return cached

  const parsed = parseReplacementEntries(entries)
  optionReplacementsCache.set(entries, parsed)
  return parsed
}

// The prefix is made of letters, digits and underscores only, so that it can be
// written into a regular expression as it is. A document that already holds
// the chosen prefix gets another one, or the restore below could overwrite the
// document's own text.
const createPlaceholderPrefix = (input) => {
  const build = () =>
    `__MARKDOWN_REPLACEMENTS_PLACEHOLDER_${Math.random()
      .toString(36)
      .slice(2, 8)}__`

  let prefix = build()
  while (input.includes(prefix)) prefix = build()
  return prefix
}

// `String.prototype.replaceAll` reads `$&`, `` $` `` and `$$` in a string
// replacement as substitution patterns. The right side of a literal rule is
// text a user wrote, and a `$` in it has to land verbatim, so the replacement
// goes through `split`/`join`. Do not "simplify" this to `replaceAll`.
const replaceAllLiteral = (text, token, value) => text.split(token).join(value)

// Rewrites the given ranges, which must be sorted and non-overlapping, and
// leaves the text between them alone.
const replaceRanges = (input, ranges, replace) => {
  if (!ranges.length) return input

  let result = ""
  let cursor = 0
  for (const { start, end } of ranges) {
    result += input.slice(cursor, start)
    result += replace(input.slice(start, end))
    cursor = end
  }
  return result + input.slice(cursor)
}

const findMdxCommentRanges = (input) => {
  const ranges = []
  let index = 0

  while (index < input.length) {
    const start = input.indexOf("{/*", index)
    if (start === -1) break
    const end = input.indexOf("*/}", start + 3)
    if (end === -1) break
    ranges.push({ start, end: end + 3 })
    index = end + 3
  }

  return ranges
}

const BLANK_LINE_PATTERN = /^[ \t]*$/
const LEADING_WHITESPACE_PATTERN = /^[ \t]*/
const FENCE_OPEN_PATTERN = /^([ \t]*)(`{3,}|~{3,})(.*)$/
const FENCE_CLOSE_PATTERN = /^([ \t]*)(`{3,}|~{3,})[ \t]*$/
const INDENTED_LINE_PATTERN = /^(?: {4}|\t)/
// A list marker followed by whitespace or the end of the line. The third group
// holds the whitespace after the marker, which is where the item's content
// starts.
const LIST_ITEM_PATTERN = /^([ \t]*)([-*+]|\d{1,9}[.)])(?=[ \t]|$)([ \t]*)/
const ATX_HEADING_PATTERN = /^ {0,3}#{1,6}(?:[ \t]|$)/
const THEMATIC_BREAK_PATTERN =
  /^ {0,3}(?:(?:-[ \t]*){3,}|(?:\*[ \t]*){3,}|(?:_[ \t]*){3,})$/
const SETEXT_UNDERLINE_PATTERN = /^ {0,3}=+[ \t]*$/

// Up to three spaces of indentation still belong to the block that opens on the
// line. A fourth space makes the line indented content of whatever contains it.
const MAX_MARKER_INDENT = 3

const isBlankLine = (text) => BLANK_LINE_PATTERN.test(text)

// The column at which a list item's content starts: after the marker and the
// spaces that follow it. More than four spaces there mean the item opens with
// indented code, so at most four count.
const listItemContentStart = ([, indent, marker, spaces]) =>
  indent.length + marker.length + Math.max(1, Math.min(spaces.length, 4))

// How far a fence marker may be indented on the given line, and whether that
// limit is certain.
//
// After a blank line the surrounding content offset is unknown, so any
// indentation is accepted: that is how a fence nested in a list item is reached
// without tracking the list. Directly under a list marker, the item says where
// its content starts, so a fence written right under the marker is measured
// against the content rather than against the left margin. Directly under any
// other line, that line's own indentation is the best available guess, and a
// marker indented deeper than three spaces on that guess alone is tentative.
const fenceIndentLimit = (lines, index) => {
  if (index === 0) return { max: Infinity, guessed: false }

  const previous = lines[index - 1].text
  if (isBlankLine(previous)) return { max: Infinity, guessed: false }

  const listItem = LIST_ITEM_PATTERN.exec(previous)
  if (listItem) {
    return {
      max: listItemContentStart(listItem) + MAX_MARKER_INDENT,
      guessed: false,
    }
  }

  const indent = LEADING_WHITESPACE_PATTERN.exec(previous)[0].length
  return { max: indent + MAX_MARKER_INDENT, guessed: true }
}

// A fence opens with three or more backticks or tildes. A backtick fence may
// not carry a backtick in its info string, because that would make the run an
// inline code span instead.
const openingFence = (text, limit) => {
  const match = FENCE_OPEN_PATTERN.exec(text)
  if (!match) return null

  const [, indent, marker, info] = match
  if (indent.length > limit.max) return null
  if (marker[0] === "`" && info.includes("`")) return null
  return {
    char: marker[0],
    length: marker.length,
    indent: indent.length,
    tentative: limit.guessed && indent.length > MAX_MARKER_INDENT,
  }
}

// A fence closes on a run of the same character that is at least as long,
// carries nothing but trailing whitespace, and is not indented further than the
// opening marker allows.
const closesFence = (text, fence) => {
  const match = FENCE_CLOSE_PATTERN.exec(text)
  if (!match) return false

  const [, indent, marker] = match
  return (
    marker[0] === fence.char &&
    marker.length >= fence.length &&
    indent.length <= fence.indent + MAX_MARKER_INDENT
  )
}

// Four spaces of indentation mean an indented code block at the top level, but
// they mean ordinary content inside a list item. Treating list content as code
// would silently stop replacements there, so an indented run is only recognized
// when the block before it sits at the top level. Fencing is the documented way
// to protect code that is nested in another block.
//
// A blockquote line is a top-level line here: its own content is prefixed with
// `>`, so an unprefixed indented line after it has left the quote.
const isTopLevelPlainLine = (text) =>
  !/^[ \t]/.test(text) && !LIST_ITEM_PATTERN.test(text)

// Whether the line at `index` is a block that ends on that line and cannot be
// continued by the next one: an ATX heading, a thematic break, or the underline
// of a setext heading. A run of `=` is only an underline when a paragraph line
// precedes it; on its own it is paragraph text.
const closesOwnBlock = (lines, index) => {
  const { text } = lines[index]
  return (
    ATX_HEADING_PATTERN.test(text) ||
    THEMATIC_BREAK_PATTERN.test(text) ||
    (SETEXT_UNDERLINE_PATTERN.test(text) &&
      index > 0 &&
      !isBlankLine(lines[index - 1].text))
  )
}

const opensIndentedCode = (lines, index, previousNonBlank, afterFence) => {
  const { text } = lines[index]
  if (isBlankLine(text) || !INDENTED_LINE_PATTERN.test(text)) return false

  // An indented chunk cannot interrupt a paragraph, so the line before it has
  // to be blank or one that closes its block by itself: a heading, a thematic
  // break, or the last line of a fenced block.
  if (
    index > 0 &&
    !isBlankLine(lines[index - 1].text) &&
    !afterFence &&
    !closesOwnBlock(lines, index - 1)
  ) {
    return false
  }

  if (previousNonBlank === null) return true
  return isTopLevelPlainLine(previousNonBlank)
}

const toLines = (input) => {
  const lines = []
  let start = 0

  for (;;) {
    const newline = input.indexOf("\n", start)
    const end = newline === -1 ? input.length : newline
    lines.push({ text: input.slice(start, end), start, end })
    if (newline === -1) break
    start = newline + 1
  }

  return lines
}

// Fenced and indented code blocks, as sorted non-overlapping ranges. Inline
// code spans are handled separately, by `replaceInlineCodeSpans`.
const findBlockCodeRanges = (input) => {
  const lines = toLines(input)
  const ranges = []
  let previousNonBlank = null
  // The index of the last line of the most recent fenced block, so that an
  // indented run directly under a closing fence is recognized.
  let fenceEnd = -1
  let index = 0

  while (index < lines.length) {
    const line = lines[index]

    // The indented rule is tried first, because a fence written inside an
    // indented code block is literal content of that block rather than a fence.
    if (
      opensIndentedCode(lines, index, previousNonBlank, fenceEnd === index - 1)
    ) {
      // Blank lines sit inside an indented run, but the ones trailing it belong
      // to whatever follows, so the range ends on the last indented line. The
      // range keeps the indentation, which is the block's own marker.
      let scan = index
      let lastIndented = index
      while (
        scan < lines.length &&
        (isBlankLine(lines[scan].text) ||
          INDENTED_LINE_PATTERN.test(lines[scan].text))
      ) {
        if (!isBlankLine(lines[scan].text)) lastIndented = scan
        scan += 1
      }
      ranges.push({ start: line.start, end: lines[lastIndented].end })
      previousNonBlank = lines[lastIndented].text
      index = lastIndented + 1
      continue
    }

    const fence = openingFence(line.text, fenceIndentLimit(lines, index))
    if (fence) {
      let closeIndex = index + 1
      while (
        closeIndex < lines.length &&
        !closesFence(lines[closeIndex].text, fence)
      ) {
        closeIndex += 1
      }
      const unclosed = closeIndex === lines.length

      // An unclosed fence runs to the end of the document, which is how
      // CommonMark reads it and how Prettier prints it. A tentative marker is
      // the exception: with nothing closing it, the run is more likely the
      // trailing half of an inline span that was indented too far to be a
      // fence, and protecting the rest of the document on a guess would
      // silently skip every replacement after it. The span scan pairs it up
      // instead.
      if (!unclosed || !fence.tentative) {
        const lastIndex = Math.min(closeIndex, lines.length - 1)
        // The range starts at the beginning of the line, so the fence's own
        // indentation is protected too. That indentation is what the content
        // is measured against, and a rule that reached it would shift every
        // line of the block.
        ranges.push({ start: line.start, end: lines[lastIndex].end })
        previousNonBlank = lines[lastIndex].text
        fenceEnd = lastIndex
        index = lastIndex + 1
        continue
      }
    }

    if (!isBlankLine(line.text)) previousNonBlank = line.text
    index += 1
  }

  return ranges
}

// The offset of the newline that opens the first blank line at or after `from`,
// or the end of the text. A blank line ends a paragraph, and with it any code
// span that was still open.
const findParagraphEnd = (input, from) => {
  const pattern = /\n[ \t]*\n/g
  pattern.lastIndex = from
  const match = pattern.exec(input)
  return match ? match.index : input.length
}

// Inline code is a run of backticks closed by a run of the same length within
// the same paragraph. Block fences are lifted out before this runs, so what is
// left are spans.
const replaceInlineCodeSpans = (input, replace) => {
  let result = ""
  let index = 0
  let paragraphEnd = -1

  while (index < input.length) {
    if (input[index] !== "`") {
      result += input[index]
      index += 1
      continue
    }

    let tickCount = 1
    while (
      index + tickCount < input.length &&
      input[index + tickCount] === "`"
    ) {
      tickCount += 1
    }

    // A backtick that would only pair up past a blank line is literal text.
    // Pairing it anyway would protect the prose in between, and one stray
    // backtick would then shift every span after it in the document.
    if (paragraphEnd < index) paragraphEnd = findParagraphEnd(input, index)
    const fence = "`".repeat(tickCount)
    const end = input.indexOf(fence, index + tickCount)

    if (end === -1 || end > paragraphEnd) {
      result += input[index]
      index += 1
      continue
    }

    result += replace(input.slice(index, end + tickCount))
    index = end + tickCount
  }

  return result
}

const applyTextReplacements = (str, replacements) => {
  let result = str

  for (const rule of replacements) {
    result = rule.pattern
      ? result.replace(rule.pattern, rule.to)
      : replaceAllLiteral(result, rule.from, rule.to)
  }

  return result
}

const applyTextReplacementsSafely = (str, replacements) => {
  const prefix = createPlaceholderPrefix(str)
  const values = new Map()
  const addPlaceholder = (value, kind) => {
    const token = `${prefix}${kind}_${values.size}__`
    values.set(token, value)
    return token
  }

  // MDX comments come first, because a comment may hold a code block and has to
  // be protected as one region. Block code comes next, so that a fence is
  // matched by the line rules that actually govern it rather than by the
  // backtick counting that inline spans use.
  let processed = replaceRanges(str, findMdxCommentRanges(str), (match) =>
    addPlaceholder(match, "COMMENT")
  )
  processed = replaceRanges(
    processed,
    findBlockCodeRanges(processed),
    (match) => addPlaceholder(match, "CODE")
  )
  processed = replaceInlineCodeSpans(processed, (match) =>
    addPlaceholder(match, "CODE")
  )

  processed = applyTextReplacements(processed, replacements)

  // A broad pattern can consume the placeholder tokens themselves, and a rule
  // with a capture group can even forge one. Restoring afterwards would leak an
  // internal token into the document, so unless the tokens found are exactly
  // the tokens written, the safest result is the untouched original text.
  //
  // A token is also absent from `processed` when it sits inside another
  // placeholder's value, which is what happens when the regions nest. An MDX
  // comment written inside a code span, as in `` `{/* ... */}` ``, is lifted
  // out first and the code span then swallows the token it left behind. The
  // restore below puts both back, so a nested token counts as present.
  const tokenPattern = new RegExp(`${prefix}[A-Z]+_\\d+__`, "g")
  const found = new Set()
  const collect = (text) => {
    for (const token of text.match(tokenPattern) ?? []) found.add(token)
  }
  collect(processed)
  for (const value of values.values()) collect(value)

  const intact =
    found.size === values.size && [...found].every((token) => values.has(token))
  if (!intact) return str

  // A value may hold a token of its own, so restored text is scanned again.
  // The replacer is a function, which inserts its result verbatim: a `$` in
  // protected text must not be read as a substitution pattern.
  const restore = (text) =>
    text.replace(tokenPattern, (token) => restore(values.get(token)))
  return restore(processed)
}

// Prettier's own Markdown parsers define no `preprocess` step, so the one added
// here is the first. Should a parser carry one, it runs first and the
// replacements are applied to its result, which keeps the plugin correct if a
// later release adds such a step.
const wrapParser = (parser) => ({
  ...parser,
  preprocess: (text, options) => {
    const base = parser.preprocess ? parser.preprocess(text, options) : text

    // A fenced block whose info string names a Markdown language is formatted
    // by Prettier as an embedded document, through this same parser, and the
    // rules would reach its content that way even though the block is
    // protected in the document that holds it. `parentParser` is set on that
    // inner call only, so an embedded document is handed back as it is.
    if (options?.parentParser) return base

    const replacements = getOptionReplacements(options)
    if (!replacements.length) return base
    return applyTextReplacementsSafely(base, replacements)
  },
})

const parsers = Object.fromEntries(
  Object.entries(markdownPlugin.parsers).map(([name, parser]) => [
    name,
    wrapParser(parser),
  ])
)

const plugin = {
  parsers,
  languages: markdownPlugin.languages,
  options: {
    markdownReplacements: {
      type: "string",
      array: true,
      default: [{ value: [] }],
      category: "Markdown Replacements",
      description:
        'Text replacements applied outside code spans, code blocks and MDX comments. Use "from=>to" for a literal rule or "/pattern/flags=>to" for a regular expression.',
    },
  },
}

export default plugin

// Exported for the test suite, not as part of the plugin's interface. The
// ranges these return are compared against the ranges Prettier's own Markdown
// parser reports for the same document, which is what keeps a source scan that
// runs before parsing honest about what counts as code.
export { findBlockCodeRanges, findMdxCommentRanges, wrapParser }
