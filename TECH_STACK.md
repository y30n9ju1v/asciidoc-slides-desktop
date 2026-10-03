# AsciiDoc Slides 기술 구조

Pages의 `TECH_STACK.md`에서 공통 스택 설명을 가져와 현재 Slides 코드에 맞게 정리했다. 정확한 의존성 버전은 [package.json](./package.json), [package-lock.json](./package-lock.json), [Cargo.toml](./src-tauri/Cargo.toml), [Cargo.lock](./src-tauri/Cargo.lock)을 기준으로 한다. Pages의 버전을 그대로 적용하거나 이 문서만으로 업그레이드하지 않는다.

## 1. 하나의 모델과 세 출력기

```text
Monaco 원문 → parseSlideDeck → SlideDeck (SafeBlock + 슬라이드별 데이터)
                              ├─ React 슬라이드 미리보기·발표
                              ├─ pptxLayout → pptxExporter → PPTX
                              └─ JSON → Rust slide_writer → Typst → PDF
```

- `src/hooks/useDocument.ts`: 문서 ID·원문·경로·저장 기준의 소유자.
- `src/hooks/useSlideDeck.ts`: 지연 파싱과 최신 응답 선택. 현재 Slides 파서를 Pages의 Web Worker 파이프라인으로 설명하지 않는다.
- `src/services/slideDeckService.ts`: Asciidoctor AST를 슬라이드로 분할하고 공유 SafeDocument 정규화를 적용.
- `src/services/exportService.ts`: 클릭 시점의 원문을 다시 파싱하고 preflight·저장 흐름을 연결.
- `src-tauri/src/slide_compiler.rs`: 검증한 요청·자산을 내장 컴파일러에 전달하고 선택한 PDF 경로에 저장. Pages의 캐시 경로 반환·프런트엔드 이동 방식과 다르다.

## 2. 구성 요소

| 영역        | 구성                                                       | 책임                                      |
| ----------- | ---------------------------------------------------------- | ----------------------------------------- |
| UI          | React, TypeScript, Vite, Tailwind, shadcn/ui·Radix, Lucide | 앱 화면·접근 가능한 조작·의미론적 색상    |
| 편집기      | Monaco, Shiki, monaco-vim                                  | 로컬 에디터·문법 강조·Vim 입력            |
| 파싱        | Asciidoctor, 공유 `asciidoc-typst` 서브모듈                | AST → 허용된 데이터 모델                  |
| 콘텐츠 표시 | highlight.js, KaTeX, Mermaid, DOMPurify                    | 코드·수식·다이어그램과 살균               |
| PPTX        | PptxGenJS                                                  | 편집 가능한 텍스트·표·이미지, 노트·미디어 |
| PDF         | Rust, Typst, typst-as-lib, typst-pdf, MiTeX                | 네이티브 조판·수식 변환                   |
| 네이티브    | Tauri, fs/dialog/opener 플러그인                           | 파일·선택 다이얼로그·제한된 외부 링크     |
| 검증        | ESLint, Prettier, Vitest, cargo test·clippy                | 정적 분석·단위/회귀 테스트                |

## 3. 편집기 설정과 출력 설정

편집기 글자 크기(12–22px, 기본 14px), Vim, 라이트/다크, 분할 비율은 `useAppPreferences`가 기기별로 저장한다. 크기 검증은 `src/services/editorPreferences.ts`가 맡는다. Monaco의 `updateOptions`로 글자 크기를 바꾸며 모델을 재생성하지 않는다.

슬라이드 테마·스타일·블록 크기는 원문에 속한다. 편집기 크기 변경으로 `SlideDeck`이나 출력 글자 크기를 바꾸지 않는다.

## 4. 보안·외부 경계

- 파일 선택과 저장은 `documentFileAdapter.ts`, 자산은 `imageStore.ts`·`videoStore.ts` 같은 경계를 이용한다.
- `assetAdapter.ts` → Rust `asset_paths.rs`가 현재 덱 안의 실제 경로와 런타임 스코프를 확인한다. 창 제목·전체 화면 호출은 `windowAdapter.ts`에 모은다.
- Tauri capability, 런타임 경로 스코프, 문서 상대 경로 검증은 서로 대체하지 않는 방어 계층이다.
- 로컬 동영상은 asset 프로토콜, 유튜브는 발표 중 명시적인 재생 조작 후 제한된 iframe으로 표시한다. 편집 미리보기는 유튜브에 접속하지 않는다.
- 공유 모델·Rust 요청에는 HTML·DOM·완성된 Typst 소스를 넣지 않는다. 세부 계약은 [SAFE_DOCUMENT_SPEC.md](./SAFE_DOCUMENT_SPEC.md)를 따른다.
- 번들 폰트와 외부 라이브러리 고지는 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md), [폰트 고지](./src-tauri/assets/fonts/THIRD_PARTY_NOTICES.md)를 유지한다. 배포 전 실제 산출물 기준으로 다시 확인한다.

Vault·Book Project·SQLite 검색·HTML/EPUB 출판·iOS는 이 문서의 지원 기능이 아니다.
