// 줄바꿈 태그 표기를 통일하고 앞뒤 공백을 정리하는 규칙.
// 플러그인 내장 동작이 아니라 설정으로 관리한다.
//
// 치환은 문단 단위가 아니라 원문 전체에 한 번에 적용된다. 그래서 줄바꿈까지
// 잡는 패턴은 문서 구조를 무너뜨린다. `\s`로 앞뒤를 잡으면 문단 사이의 빈 줄을
// 삼켜 두 문단이 합쳐지고, 줄바꿈 하나만 흡수하게 해도 항목마다 `<br />`로
// 끝나는 목록이 한 줄로 뭉친다. 실제 문서 614건으로 확인한 사항이다.
// 그러므로 줄바꿈이 아닌 가로 공백만 잡는다.
export const brRule = "/[^\\S\\r\\n]*<br\\s*\\/?>[^\\S\\r\\n]*/gi=><br />"

// 이스케이프된 대괄호를 되돌리는 규칙. 정규식이 필요 없는 문자열 규칙이다.
export const escapedBracketRule = "\\[=>["

export const brOptions = { markdownReplacements: [brRule] }

export const wordOptions = { markdownReplacements: ["동의 항목=>동의항목"] }

export const brAndWordOptions = {
  markdownReplacements: [brRule, "동의 항목=>동의항목"],
}

export const escapedBracketOptions = {
  markdownReplacements: [escapedBracketRule],
}

// 줄바꿈 태그 통일 테스트 케이스
export const brTagTestCases = [
  {
    name: "기본 <br> 태그",
    input: "첫 줄<br>둘째 줄",
    expected: "첫 줄<br />둘째 줄",
  },
  {
    name: "자체 닫는 태그",
    input: "첫 줄<br/>둘째 줄",
    expected: "첫 줄<br />둘째 줄",
  },
  { name: "공백이 있는 태그", input: "줄1<br >줄2", expected: "줄1<br />줄2" },
  {
    name: "대소문자 혼합",
    input: "줄1<BR>줄2<Br/>줄3",
    expected: "줄1<br />줄2<br />줄3",
  },
]

// 규칙 형식 테스트 케이스
export const ruleFormatTestCases = [
  {
    name: "문자열 규칙",
    input: "동의 항목을 확인하세요",
    entries: ["동의 항목=>동의항목"],
    expected: "동의항목을 확인하세요",
  },
  {
    name: "정규식 규칙과 캡처 그룹",
    input: "버전 3과 버전 11 기준입니다",
    entries: ["/버전 ([0-9]+)/g=>v$1"],
    expected: "v3과 v11 기준입니다",
  },
  {
    name: "g 플래그를 생략하면 자동으로 붙는다",
    input: "가가가",
    entries: ["/가/=>나"],
    expected: "나나나",
  },
  {
    name: "g 외의 플래그도 그대로 쓴다",
    input: "Api와 api 표기",
    entries: ["/api/gi=>API"],
    expected: "API와 API 표기",
  },
  {
    name: "바꿀 문자열에 구분자가 들어갈 수 있다",
    input: "화살표",
    entries: ["화살표=>a=>b"],
    expected: "a=>b",
  },
  {
    name: "여러 규칙은 등록한 순서대로 이어서 적용된다",
    input: "가나다 중 첫 글자",
    entries: ["가나다=>나다가", "나다가=>다가나"],
    expected: "다가나",
  },
  {
    name: "슬래시로 시작해도 정규식이 아니면 문자열 규칙으로 다룬다",
    input: "/docs/guide 를 참고하세요",
    entries: ["/docs/guide=>/docs/tutorial"],
    expected: "/docs/tutorial 를 참고하세요",
  },
]
