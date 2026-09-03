import prettier from "prettier"
import plugin from "../../index.js"

export async function formatWithPlugin(
  content,
  parser = "markdown",
  options = {}
) {
  return await prettier.format(content, {
    parser,
    plugins: [plugin],
    printWidth: 99999,
    proseWrap: "never",
    ...options,
  })
}

export async function formatWithoutPlugin(content, parser = "markdown") {
  return await prettier.format(content, {
    parser,
    printWidth: 99999,
    proseWrap: "never",
  })
}

export const withReplacements = (entries) => ({
  markdownReplacements: entries,
})

// MDX 주석 보존 검증
export function expectMdxCommentPreservation(result, expectedComments) {
  expectedComments.forEach((comment) => {
    expect(result).toContain(comment)
  })
  // HTML 주석으로 변환되지 않았는지 확인
  expect(result).not.toContain("<!--")
  expect(result).not.toContain("-->")
}

// 줄바꿈 태그 통일 검증
export function expectBrTagNormalization(result) {
  expect(result).toContain("<br />")
  expect(result).not.toContain("<br>")
  expect(result).not.toContain("<br/>")
  expect(result).not.toContain("<BR>")
  expect(result).not.toContain("<Br/>")
  expect(result).not.toContain("<br >")
}
