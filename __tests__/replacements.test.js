import { describe, it, expect } from "vitest"
import { compile } from "@mdx-js/mdx"
import {
  formatWithPlugin,
  withReplacements,
  expectBrTagNormalization,
  expectMdxCommentPreservation,
} from "./helpers/test-utils.js"
import {
  brOptions,
  brAndWordOptions,
  wordOptions,
  escapedBracketOptions,
  brTagTestCases,
  ruleFormatTestCases,
} from "./helpers/test-data.js"

describe("prettier-plugin-markdown-replacements 종합 테스트", () => {
  describe("1. 규칙 형식", () => {
    ruleFormatTestCases.forEach((testCase) => {
      it(testCase.name, async () => {
        const result = await formatWithPlugin(
          testCase.input,
          "markdown",
          withReplacements(testCase.entries)
        )
        expect(result).toContain(testCase.expected)
      })
    })

    it("옵션이 없으면 아무것도 치환하지 않는다", async () => {
      const result = await formatWithPlugin("동의 항목을 확인하세요")
      expect(result).toContain("동의 항목을 확인하세요")
    })

    it("빈 배열을 넘겨도 아무것도 치환하지 않는다", async () => {
      const result = await formatWithPlugin(
        "동의 항목을 확인하세요",
        "markdown",
        withReplacements([])
      )
      expect(result).toContain("동의 항목을 확인하세요")
    })

    it("구분자가 없거나 좌변이 빈 항목은 무시한다", async () => {
      const result = await formatWithPlugin(
        "구분자없음 좌변없음 정상",
        "markdown",
        withReplacements(["구분자없음", "=>좌변없음", "정상=>치환됨"])
      )

      expect(result).toContain("구분자없음")
      expect(result).toContain("좌변없음")
      expect(result).toContain("치환됨")
    })

    it("문법이 잘못된 정규식은 무시하고 나머지 규칙은 적용한다", async () => {
      const result = await formatWithPlugin(
        "정상 문장",
        "markdown",
        withReplacements(["/[/g=>X", "정상=>치환됨"])
      )
      expect(result).toContain("치환됨 문장")
    })
  })

  describe("2. 적용 범위", () => {
    it("본문과 표 셀에 모두 적용된다", async () => {
      const input = `| 동의 항목 | 값 |
| --- | --- |
| 동의 항목 | 1 |

동의 항목을 확인하세요`
      const result = await formatWithPlugin(input, "markdown", wordOptions)

      expect(result).toContain("동의항목")
      expect(result).not.toContain("동의 항목")
    })

    it("제목과 목록에도 적용된다", async () => {
      const input = "# 동의 항목 안내\n\n- 동의 항목 하나\n- 동의 항목 둘"
      const result = await formatWithPlugin(input, "markdown", wordOptions)

      expect(result).toContain("# 동의항목 안내")
      expect(result).toContain("- 동의항목 하나")
      expect(result).not.toContain("동의 항목")
    })

    it("링크 문구와 URL 모두 규칙 대상이다", async () => {
      const result = await formatWithPlugin(
        "[동의 항목](/guide/동의%20항목)",
        "markdown",
        wordOptions
      )
      expect(result).toContain("[동의항목]")
    })
  })

  describe("3. 보호 구간", () => {
    it("인라인 코드는 치환하지 않는다", async () => {
      const input =
        "| 이름 | 설명 |\n| --- | --- |\n| `동의 항목` | 동의 항목 |"
      const result = await formatWithPlugin(input, "markdown", wordOptions)

      expect(result).toContain("`동의 항목`")
      expect(result).toContain("| 동의항목 |")
    })

    it("코드 블록은 치환하지 않는다", async () => {
      const input = "동의 항목\n\n```\n동의 항목\n```"
      const result = await formatWithPlugin(input, "markdown", wordOptions)

      expect(result).toContain("```\n동의 항목\n```")
      expect(result).toContain("동의항목\n")
    })

    it("언어를 지정한 코드 블록도 치환하지 않는다", async () => {
      const input = '동의 항목\n\n```json\n{ "key": "동의 항목" }\n```'
      const result = await formatWithPlugin(input, "markdown", wordOptions)

      expect(result).toContain('"동의 항목"')
    })

    it("MDX 주석은 치환하지 않는다", async () => {
      const input = "동의 항목\n\n{/* 동의 항목 */}"
      const result = await formatWithPlugin(input, "mdx", wordOptions)

      expect(result).toContain("{/* 동의 항목 */}")
      expectMdxCommentPreservation(result, ["{/* 동의 항목 */}"])
    })

    it("정규식 규칙에서도 코드 스팬은 보호된다", async () => {
      const input =
        "| 이름 | 설명 |\n| --- | --- |\n| `최대 50개` | 최대 50개 |"
      const result = await formatWithPlugin(
        input,
        "markdown",
        withReplacements(["/최대 ([0-9]+)개/g=>최대: $1개"])
      )

      expect(result).toContain("`최대 50개`")
      expect(result).toContain("최대: 50개")
    })

    it("보호 구간까지 삼키는 넓은 패턴은 문서를 그대로 둔다", async () => {
      // 치환이 원문 전체에 한 번에 적용되므로, 자리표시자를 삼키는 패턴을
      // 만나면 문단 하나가 아니라 문서 전체가 원문으로 남는다.
      const result = await formatWithPlugin(
        "값 `code` 사이\n\n다른 문단",
        "markdown",
        withReplacements(["/[A-Za-z_]+/g=>X"])
      )
      expect(result).toContain("값 `code` 사이")
      expect(result).toContain("다른 문단")
    })

    it("코드 스팬 안에 MDX 주석 표기가 있어도 치환을 건너뛰지 않는다", async () => {
      // 주석을 먼저 들어내면 그 자리표시자를 코드 스팬이 삼킨다. 중첩일 뿐
      // 소실이 아니므로 안전장치가 발동하면 안 된다.
      // 실제 문서에서 문서 전체의 치환이 통째로 취소되던 사례에 대한 회귀 방지.
      const input = "동의 항목 안내\n\n주석 표기는 `{/* 예시 */}`처럼 씁니다."
      const result = await formatWithPlugin(input, "mdx", wordOptions)

      expect(result).toContain("동의항목 안내")
      expect(result).toContain("`{/* 예시 */}`")
    })

    it("코드 블록 안에 MDX 주석 표기가 있어도 치환을 건너뛰지 않는다", async () => {
      const input = "동의 항목 안내\n\n```mdx\n{/* 동의 항목 */}\n```"
      const result = await formatWithPlugin(input, "mdx", wordOptions)

      expect(result).toContain("동의항목 안내")
      expect(result).toContain("{/* 동의 항목 */}")
    })
  })

  describe("4. 줄바꿈 태그 통일", () => {
    brTagTestCases.forEach((testCase) => {
      it(testCase.name, async () => {
        const result = await formatWithPlugin(
          testCase.input,
          "markdown",
          brOptions
        )
        expectBrTagNormalization(result)
        expect(result.trim()).toBe(testCase.expected)
      })
    })

    it("태그 앞뒤 공백까지 정리한다", async () => {
      const result = await formatWithPlugin(
        "| A |\n| --- |\n| 값 <br /> 줄 |",
        "markdown",
        brOptions
      )
      expect(result).toContain("값<br />줄")
    })

    it("한 줄 안의 앞뒤 공백을 정리한다", async () => {
      const result = await formatWithPlugin(
        "줄1 <br> 줄2",
        "markdown",
        brOptions
      )
      expect(result).toContain("줄1<br />줄2")
    })

    it("줄 끝 태그 뒤의 줄바꿈은 건드리지 않는다", async () => {
      // 줄바꿈까지 흡수하면 문서 구조가 무너지므로 가로 공백만 정리한다.
      // Prettier 가 문단 안의 줄바꿈을 공백으로 합치므로 한 칸이 남는다.
      const result = await formatWithPlugin(
        "첫 줄 <br>\n둘째 줄",
        "markdown",
        brOptions
      )
      expect(result).toContain("첫 줄<br /> 둘째 줄")
    })

    it("문단 경계는 유지한다", async () => {
      const result = await formatWithPlugin(
        "첫 문단<br />\n\n둘째 문단",
        "markdown",
        brOptions
      )
      expect(result).toContain("첫 문단<br />\n\n둘째 문단")
    })

    it("항목마다 태그로 끝나는 목록을 한 줄로 합치지 않는다", async () => {
      // 줄바꿈을 흡수하는 규칙에서 실제 문서가 깨졌던 사례에 대한 회귀 방지.
      const result = await formatWithPlugin(
        "1. 항목 A<br />\n1. 항목 B<br />\n1. 항목 C",
        "markdown",
        brOptions
      )

      expect(result).toContain("1. 항목 A<br />\n")
      expect(result).toContain("1. 항목 B<br />\n")
      expect(result).not.toContain("항목 A<br />1. 항목 B")
    })

    it("코드 스팬 안의 표기는 보존한다", async () => {
      const input = "| A | B |\n| --- | --- |\n| `<br>` | 값<br>줄 |"
      const result = await formatWithPlugin(input, "markdown", brOptions)

      expect(result).toContain("`<br>`")
      expect(result).toContain("값<br />줄")
    })

    it("HTML 표 안의 태그도 통일한다", async () => {
      const input = "<table><tr><td>a<br>b</td></tr></table>"
      const result = await formatWithPlugin(input, "markdown", brOptions)

      expect(result).toContain("<br />")
      expect(result).not.toContain("<br>")
      expect(result).not.toContain("<br/>")
    })

    it("단어 규칙과 함께 등록해도 각각 적용된다", async () => {
      const result = await formatWithPlugin(
        "동의 항목<br>확인",
        "markdown",
        brAndWordOptions
      )
      expect(result).toContain("동의항목<br />확인")
    })
  })

  describe("5. 이스케이프된 대괄호 되돌리기", () => {
    it("규칙을 등록하지 않으면 그대로 둔다", async () => {
      const result = await formatWithPlugin("\\[예시")
      expect(result).toContain("\\[예시")
    })

    it("규칙을 등록하면 되돌린다", async () => {
      const result = await formatWithPlugin(
        "\\[예시",
        "markdown",
        escapedBracketOptions
      )
      expect(result).toContain("[예시")
    })

    it("코드와 주석 구간은 되돌리지 않는다", async () => {
      const input = `\\[예시
\`\\\\[코드]\`

\`\`\`
\\\\[펜스]
\`\`\`

{/* \\[주석예시] */}`
      const result = await formatWithPlugin(input, "mdx", escapedBracketOptions)

      expect(result).toContain("[예시")
      expect(result).toContain("`\\\\[코드]`")
      expect(result).toContain("```\n\\\\[펜스]\n```")
      expect(result).toContain("{/* \\[주석예시] */}")
      expect(result).not.toContain("{/* [주석예시] */}")
    })

    it("링크가 함께 있는 본문에서도 되돌린다", async () => {
      const input =
        "On the [app management page](https://developers.example.com/console/app), check the values in \\[App] > \\[General]."
      const result = await formatWithPlugin(input, "mdx", escapedBracketOptions)

      expect(result).toContain("in [App] > [General].")
      expect(result).not.toContain("\\[App]")
      expect(result).toContain(
        "[app management page](https://developers.example.com/console/app)"
      )
    })
  })

  describe("6. 파서 호환성", () => {
    it("markdown 파서", async () => {
      const result = await formatWithPlugin(
        "동의 항목",
        "markdown",
        wordOptions
      )
      expect(result).toContain("동의항목")
    })

    it("mdx 파서", async () => {
      const result = await formatWithPlugin("동의 항목", "mdx", wordOptions)
      expect(result).toContain("동의항목")
    })

    it("치환 결과가 유효한 MDX여야 한다", async () => {
      const input = `# 동의 항목

{/* 주석 */}

| 이름 | 값 |
| --- | --- |
| 동의 항목 | \`동의 항목\` |`
      const result = await formatWithPlugin(input, "mdx", brAndWordOptions)

      expect(result).toContain("# 동의항목")
      expect(result).toContain("`동의 항목`")
      await expect(compile(result, { jsx: true })).resolves.toBeTruthy()
    })

    it("플러그인을 쓰지 않으면 치환하지 않는다", async () => {
      const result = await formatWithoutPluginCheck()
      expect(result).toContain("동의 항목")
    })
  })

  describe("7. 멱등성", () => {
    it("두 번 포맷해도 결과가 같다", async () => {
      const input =
        "동의 항목<br>확인\n\n| a | b |\n| --- | --- |\n| 동의 항목 | 1 |"
      const once = await formatWithPlugin(input, "markdown", brAndWordOptions)
      const twice = await formatWithPlugin(once, "markdown", brAndWordOptions)
      expect(twice).toBe(once)
    })
  })
})

async function formatWithoutPluginCheck() {
  const { formatWithoutPlugin } = await import("./helpers/test-utils.js")
  return formatWithoutPlugin("동의 항목")
}
