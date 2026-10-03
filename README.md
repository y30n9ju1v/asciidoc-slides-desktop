# AsciiDoc Slides

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

| 작성                                                         | 결과                                    |
| ------------------------------------------------------------ | --------------------------------------- |
| `= 제목: 부제목` + 작성자 줄 + `:revdate:`                   | 표지 슬라이드                           |
| `== 제목`, `=== 제목`                                        | 슬라이드 한 장                          |
| `[.section]` + `== 제목`                                     | 구분(섹션) 슬라이드                     |
| `[%notitle]` + `== 제목`                                     | 제목을 숨긴 슬라이드                    |
| `<<<`                                                        | 같은 제목으로 다음 슬라이드에 이어 쓰기 |
| `[.notes]` 블록, `[NOTE.speaker]`                            | 발표자 노트 (PPTX 노트로 내보냄)        |
| `[columns]` 열린 블록                                        | 두/세 단 레이아웃 (`columns=3`)         |
| `:slide-theme: light\|dark\|ocean\|warm`                     | 색 테마                                 |
| `:slide-style: classic\|underline\|banner\|minimal\|elegant` | 레이아웃·글꼴 스타일                    |

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

## 편집과 내보내기

- 테마·스타일 변경은 실행 취소할 수 있습니다. 저장 중 다른 문서를 열어도 이전 저장 결과가 새 문서의 경로와 상태를 바꾸지 않습니다.
- 내보내기는 클릭한 시점의 원문을 사용합니다. 미리보기가 갱신 중이거나 파싱에 실패했을 때 이전 미리보기 내용을 대신 내보내지 않습니다.
- 빈 덱과 오류 진단은 내보내기를 막습니다. 경고는 내보내기 전에 내용을 확인하고 계속할지 선택합니다.
- **PPTX 제한:** 수식은 LaTeX 텍스트, 인라인 이미지는 대체 텍스트로 변환됩니다. 해당 슬라이드와 대안을 내보내기 전에 안내합니다. 렌더링된 수식·인라인 이미지를 유지하려면 PDF를 사용하고, PPTX의 이미지는 `image::path[]` 블록 문법으로 작성하세요.
- 외부에서 이미지를 수정하거나 추가한 경우 앱으로 돌아오거나 파일 탐색기의 새로고침을 누르면 반영됩니다. 내보내기에서도 이미지를 다시 읽습니다.
- 발표 중에는 배경 에디터 입력을 차단합니다. 방향키로 이동하고 `Esc`로 종료하면 이전 포커스로 돌아갑니다.
