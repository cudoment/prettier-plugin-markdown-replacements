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

const getOptionReplacements = (options) => {
  const entries = options?.markdownReplacements
  if (!Array.isArray(entries) || !entries.length) return EMPTY_REPLACEMENTS

  const cached = optionReplacementsCache.get(entries)
  if (cached) return cached

  const parsed = parseReplacementEntries(entries)
  optionReplacementsCache.set(entries, parsed)
  return parsed
}

const createPlaceholderPrefix = (input) => {
  let prefix = `__MARKDOWN_REPLACEMENTS_PLACEHOLDER_${Math.random()
    .toString(36)
    .slice(2, 8)}__`
  while (input.includes(prefix)) {
    prefix = `__MARKDOWN_REPLACEMENTS_PLACEHOLDER_${Math.random().toString(36).slice(2, 8)}__`
  }
  return prefix
}

const replaceAllLiteral = (text, token, value) => text.split(token).join(value)

const replaceCodeSpans = (input, replace) => {
  let result = ""
  let i = 0

  while (i < input.length) {
    if (input[i] !== "`") {
      result += input[i]
      i++
      continue
    }

    let tickCount = 1
    while (i + tickCount < input.length && input[i + tickCount] === "`") {
      tickCount++
    }

    const fence = "`".repeat(tickCount)
    const end = input.indexOf(fence, i + tickCount)

    if (end === -1) {
      result += input[i]
      i++
      continue
    }

    const span = input.slice(i, end + tickCount)
    result += replace(span)
    i = end + tickCount
  }

  return result
}

const replaceMdxComments = (input, replace) => {
  const ranges = getMdxCommentRanges(input)
  if (!ranges.length) return input

  let result = ""
  let cursor = 0
  for (const range of ranges) {
    result += input.slice(cursor, range.start)
    result += replace(input.slice(range.start, range.end))
    cursor = range.end
  }
  result += input.slice(cursor)
  return result
}

const mdxCommentRangesCache = new Map()

const getMdxCommentRanges = (input) => {
  if (!input) return []
  const cached = mdxCommentRangesCache.get(input)
  if (cached) return cached

  const ranges = []
  let idx = 0
  while (idx < input.length) {
    const start = input.indexOf("{/*", idx)
    if (start === -1) break
    const end = input.indexOf("*/}", start + 3)
    if (end === -1) break
    ranges.push({ start, end: end + 3 })
    idx = end + 3
  }

  mdxCommentRangesCache.set(input, ranges)
  return ranges
}

const applyTextReplacements = (str, replacements = EMPTY_REPLACEMENTS) => {
  let result = str

  for (const rule of replacements) {
    result = rule.pattern
      ? result.replace(rule.pattern, rule.to)
      : replaceAllLiteral(result, rule.from, rule.to)
  }

  return result
}

const applyTextReplacementsSafely = (
  str,
  { replacements = EMPTY_REPLACEMENTS } = {}
) => {
  const placeholders = []
  let placeholderIndex = 0
  const prefix = createPlaceholderPrefix(str)
  const addPlaceholder = (value, kind) => {
    const token = `${prefix}${kind}_${placeholderIndex}__`
    placeholders.push({ token, value })
    placeholderIndex++
    return token
  }

  let processed = replaceMdxComments(str, (match) =>
    addPlaceholder(match, "COMMENT")
  )
  processed = replaceCodeSpans(processed, (match) =>
    addPlaceholder(match, "CODE")
  )

  processed = applyTextReplacements(processed, replacements)

  // A broad pattern can consume the placeholder tokens themselves. Restoring
  // afterwards would leak an internal token into the document, so the safest
  // result is the untouched original text.
  //
  // A token is also absent from `processed` when it sits inside another
  // placeholder's value, which is what happens when the regions nest. An MDX
  // comment written inside a code span, as in `` `{/* ... */}` ``, is lifted
  // out first and the code span then swallows the token it left behind. The
  // reverse-order restore below puts both back correctly, so a nested token is
  // present rather than consumed and must not trip the safeguard.
  const isConsumed = (token, index) =>
    !processed.includes(token) &&
    !placeholders.some(
      (other, otherIndex) => otherIndex !== index && other.value.includes(token)
    )

  if (placeholders.some(({ token }, index) => isConsumed(token, index))) {
    return str
  }

  let result = processed
  for (let i = placeholders.length - 1; i >= 0; i--) {
    const { token, value } = placeholders[i]
    result = replaceAllLiteral(result, token, value)
  }

  return result
}

const parsers = Object.fromEntries(
  Object.entries(markdownPlugin.parsers).map(([name, parser]) => [
    name,
    {
      ...parser,
      preprocess: (text, options) => {
        const base = parser.preprocess ? parser.preprocess(text, options) : text
        const replacements = getOptionReplacements(options)
        if (!replacements.length) return base
        return applyTextReplacementsSafely(base, { replacements })
      },
    },
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
