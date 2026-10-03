# AsciiDoc Slides

## 코드 강조·배경·품질 점검

### 머리말·꼬리말·페이지 번호

문서 헤더에서 전체 설정을 지정합니다. 세 출력 모두 머리말은 왼쪽 위, 꼬리말은 왼쪽 아래, 번호는 오른쪽 아래에 표시합니다.

```asciidoc
= 발표 제목
홍길동
:slide-header: 회사명
:slide-footer: 행사명 · 2026
:slide-page-numbers: true
:slide-title-page-number: false
:slide-number-start: 1

[slide-header="",slide-footer="질문 시간",slide-page-numbers=false]
== 질문과 답변
```

슬라이드별 속성은 문서 설정을 덮어씁니다. 빈 문자열은 해당 문구를 숨깁니다. 기본값은 번호 표시·표지 번호 숨김·1부터 시작이며, 숨긴 슬라이드도 번호에 포함됩니다(표지 다음은 2). 시작 번호는 0~9999, 문구는 일반 텍스트 최대 160자이며 긴 문구는 표시 공간에 맞게 축소·생략될 수 있습니다. `<<<`로 나눈 장에도 각각 번호가 붙습니다.

### 코드·배경·점검 사용법

마지막 장은 제목 앞에 `[.closing]`을 붙입니다. 제목·본문을 가운데 배치하며 테마와 배경 이미지를 유지합니다. 머리말·꼬리말·번호는 기본으로 숨기고, 필요한 항목은 슬라이드별 속성으로 다시 지정할 수 있습니다.

```asciidoc
[.closing]
== 감사합니다

질문이 있으신가요?
```

- 최상위 코드 블록에 `[source,python,highlight="2;4-6"]`을 지정하면 줄 번호와 정적인 줄 강조를 미리보기·PDF·편집 가능한 PPTX에 적용합니다. 구간은 세미콜론으로 구분하며 1~1000번 줄을 지원합니다. 강조 모드는 줄의 굵기·명암을 사용하며 문법별 토큰 색상은 사용하지 않습니다.
- 표지 배경은 헤더의 `:slide-background: images/background.svg`, 개별 슬라이드는 제목 앞의 `[background-image="images/background.svg"]`로 설정합니다. 로컬 상대 경로만 허용하며, 이미지를 화면에 맞게 잘라 채우고 테마 색상을 75% 덧씌웁니다.
- 상단 **Editor settings → Output quality check**에서 PDF 또는 PowerPoint를 점검합니다. 폰트 설치 여부·이미지 읽기·영상 경로·내용량 및 작은 글자 추정을 확인하고, 슬라이드별 경고를 클릭하면 원문과 해당 슬라이드로 이동합니다. 글리프 지원·영상 코덱·PDF의 실제 경계 측정은 보장하지 않으므로 최종 출력은 직접 확인해야 합니다. 내용량 경고는 내보내기 확인에도 포함됩니다.

### 시스템 폰트 선택

상단의 **Slide font (Aa)** 버튼에서 설치된 폰트를 검색·선택합니다. 선택은 원문의 `:slide-font: 폰트 이름`에 저장되고 미리보기·PPTX·PDF에 적용됩니다. 기본값은 스타일에 맞는 시스템 고딕·명조이며, 코드·수식은 별도의 시스템 폰트를 사용합니다.

PDF용 Noto 및 Typst 기본 폰트는 번들하거나 다운로드하지 않습니다. 다른 컴퓨터에서는 글꼴·줄바꿈이 달라질 수 있고, 한글·특수문자 지원 여부는 미리보기와 출력에서 확인해야 합니다. 선택한 폰트가 없으면 PDF 출력을 중단합니다. 수식 PDF에는 설치된 OpenType 수학 폰트(예: STIX Two Math, Cambria Math)가 필요합니다. PPTX 수신자에게도 해당 폰트가 필요할 수 있습니다. 시스템 폰트의 PDF 임베딩 권한은 해당 폰트의 라이선스를 따릅니다.

KaTeX 수식 미리보기의 전용 웹폰트와 Typst 의존성 내부의 PDF 표준 폰트 자산은 별개로 남습니다. 따라서 이 변경은 앱의 모든 폰트 자산을 없애는 변경이 아니라 슬라이드 텍스트 조판을 시스템 폰트로 전환하는 변경입니다.

AsciiDoc으로 발표 자료를 쓰고 **PowerPoint(.pptx)** 와 **PDF** 로 출판하는 데스크톱 앱입니다.
Tauri v2 + React + Monaco Editor + Asciidoctor.js 기반이며, [AsciiDoc Studio](../asciidoc-pages-desktop)와
같은 스택과 `packages/asciidoc-typst` 서브모듈(SafeDocument 파이프라인)을 공유합니다.

## 개발

```bash
git submodule update --init   # packages/asciidoc-typst
npm install
npm run tauri dev             # 앱 실행 (dev 서버 포트 1430)
npm run tauri dev -- -- -- /path/deck.adoc   # 덱을 바로 열어서 실행
npm test                      # 프런트엔드 테스트
cd src-tauri && cargo test    # Rust(PDF) 테스트
```

## 슬라이드 문법

| 작성                                                               | 결과                                                      |
| ------------------------------------------------------------------ | --------------------------------------------------------- |
| `= 제목: 부제목` + 작성자 줄 + `:revdate:`                         | 표지 슬라이드                                             |
| `== 제목`, `=== 제목`                                              | 슬라이드 한 장                                            |
| `[.section]` + `== 제목`                                           | 구분(섹션) 슬라이드                                       |
| `[.closing]` + `== 감사합니다`                                     | 가운데 정렬 마무리 슬라이드; 머리말·꼬리말·번호 기본 숨김 |
| `[%notitle]` + `== 제목`                                           | 제목을 숨긴 슬라이드                                      |
| `<<<`                                                              | 같은 제목으로 다음 슬라이드에 이어 쓰기                   |
| `[.notes]` 블록, `[NOTE.speaker]`                                  | 발표자 노트 (PPTX 노트로 내보냄)                          |
| `[columns]` 열린 블록                                              | 두/세 단 레이아웃 (`columns=3`)                           |
| `video::media/clip.mp4[poster=media/clip.png,start=5]`             | 로컬 동영상 (덱 폴더 안)                                  |
| `video::VIDEO_ID[youtube,start=30]`, `video::https://youtu.be/…[]` | 유튜브 동영상                                             |
| `:slide-theme: light\|dark\|ocean\|warm`                           | 색 테마                                                   |
| `:slide-style: classic\|underline\|banner\|minimal\|elegant`       | 레이아웃·글꼴 스타일                                      |

편집기 글자 크기는 헤더의 `− / +` 버튼 또는 `Editor settings` 메뉴에서 1px씩 조절합니다(12–22px, 기본 14px).
크기는 이 앱의 기기별 설정으로 저장되며 원문·슬라이드 출력·편집 이력에는 영향을 주지 않습니다.

### 동영상

| 출력      | 로컬 동영상                     | 유튜브                                              |
| --------- | ------------------------------- | --------------------------------------------------- |
| 미리보기  | 포스터 + ▶ (재생하지 않음)      | 포스터(`cover=`) 또는 제목 카드 + ▶, 외부 접속 없음 |
| 발표 모드 | 그 자리에서 재생                | 클릭하면 youtube-nocookie에서 재생, 브라우저로 열기 |
| PPTX      | 파일을 넣어 PowerPoint에서 재생 | 온라인 비디오 (최신 PowerPoint, 인터넷 필요)        |
| PDF       | 포스터 + 파일 이름              | 포스터 + 클릭 가능한 유튜브 링크                    |

동영상은 슬라이드에 바로 놓아야 합니다(단·목록 안에서는 경고). 크기 역할(`[.small,width=60%]`)도 적용됩니다.
PPTX에 넣는 로컬 동영상은 파일당 300 MB까지이며, 파일을 읽지 못하면 내보내기가 실패합니다.
로컬 동영상의 `start=`는 앱에서만 적용되고 PPTX에서는 처음부터 재생됩니다(내보내기 전 경고).
발표 모드에서는 Tab으로 재생·종료 버튼으로 이동할 수 있습니다. 유튜브 플레이어에 포커스가 있으면 화면 오른쪽 위 종료 버튼을 사용하세요.
종료 버튼은 마우스를 움직이면 나타나고 2초 동안 움직임이 없으면 숨겨집니다. 버튼 위에 마우스를 두거나 키보드로 포커스하면 계속 표시되며, 호버를 지원하지 않는 터치 환경에서는 항상 표시됩니다.

### 블록 크기 조절

표·코드·이미지 등 슬라이드 최상위 블록 위에 역할/속성을 붙입니다.

```asciidoc
[.small.center,width=60%]      // 글자 80%, 가운데, 너비 60%
|===
| 이름 | 값
|===

[source,python,font-size=70%]  // 정확한 글자 크기
----
print("hi")
----
```

역할: `.tiny` `.smaller` `.small` `.large` `.larger` `.huge` `.lead`, `.left` `.center` `.right`.
내용이 슬라이드를 넘치면 미리보기·PPTX·PDF 모두 글자를 자동으로 줄입니다.

## 구조

- `src/services/slideDeckService.ts` — Asciidoctor AST → `SlideDeck` (본문은 SafeDocument 블록)
- 미리보기 `src/components/Slides`, PPTX `src/services/pptxLayout.ts`·`pptxExporter.ts`,
  PDF `src-tauri/src/slide_writer.rs`(Typst 소스 생성) → `slide_compiler.rs`(내장 Typst 컴파일러)
- WebView는 Rust에 데이터만 넘기고, Typst 소스는 Rust만 생성합니다. 이미지는 사용자가 고른
  덱 폴더 안에서만 읽습니다.

설계·개발·검증 기준은 [DESIGN_GUIDELINES.md](./DESIGN_GUIDELINES.md), UI 레이아웃 변경 규칙은 [CLAUDE.md](./CLAUDE.md)를 참고하세요.

추가 가이드: [기술 구조](./TECH_STACK.md) · [SafeDocument·SlideDeck 계약](./SAFE_DOCUMENT_SPEC.md) · [신뢰성 테스트](./RELIABILITY_TESTING.md) · [macOS 출시 준비](./MACOS_RELEASE_GUIDE.md).

코드·자동 검증과 남은 수동 검증은 [개발 가이드 점검 결과](./GUIDE_AUDIT.md)에 기록합니다.

## 편집과 내보내기

- 테마·스타일 변경은 실행 취소할 수 있습니다. 저장 중 다른 문서를 열어도 이전 저장 결과가 새 문서의 경로와 상태를 바꾸지 않습니다.
- 열기 버튼과 ⌘O/Ctrl+O는 폴더를 엽니다. 덱이 하나면 바로 열고, 여러 개면 선택할 수 있습니다. Finder로 파일을 열 때와 최초 저장·다른 이름으로 저장 시에는 해당 파일이 들어 있는 폴더를 추가로 선택해야 합니다. 폴더 선택을 취소하면 열기·저장을 중단합니다. 이는 macOS 샌드박스에서 원본 옆에 임시 파일을 만드는 안전한 저장에 필요한 권한입니다.
- 내보내기는 클릭한 시점의 원문을 사용합니다. 미리보기가 갱신 중이거나 파싱에 실패했을 때 이전 미리보기 내용을 대신 내보내지 않습니다.
- 빈 덱과 오류 진단은 내보내기를 막습니다. 경고는 내보내기 전에 내용을 확인하고 계속할지 선택합니다.
- **PPTX 제한:** 수식은 LaTeX 텍스트, 인라인 이미지는 대체 텍스트로 변환됩니다. 해당 슬라이드와 대안을 내보내기 전에 안내합니다. 렌더링된 수식·인라인 이미지를 유지하려면 PDF를 사용하고, PPTX의 이미지는 `image::path[]` 블록 문법으로 작성하세요.
- 외부에서 이미지를 수정하거나 추가한 경우 앱으로 돌아오거나 파일 탐색기의 새로고침을 누르면 반영됩니다. 내보내기에서도 이미지를 다시 읽습니다.
- 이미지·동영상은 실제 경로도 덱 폴더 안에 있어야 합니다. 다른 허용 폴더를 가리키는 심볼릭 링크로 이 경계를 우회할 수 없습니다.
- 참조한 로컬 이미지·포스터 또는 다이어그램을 내보내기에 준비하지 못하면 오류로 중단합니다. PDF는 안전한 임시 파일을 만들 수 없는 출력 위치(예: macOS App Sandbox)에서 새 파일은 직접 만들지만, 기존 파일은 덮어쓰지 않고 새 이름이나 쓰기 가능한 폴더를 선택하도록 안내합니다.
- 발표 중에는 배경 에디터 입력을 차단합니다. 방향키로 이동하고 `Esc`로 종료하면 이전 포커스로 돌아갑니다.
