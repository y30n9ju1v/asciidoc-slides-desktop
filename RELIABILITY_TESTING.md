# 신뢰성·회귀 테스트 가이드

Pages의 `RELIABILITY_TESTING.md`를 Slides에 맞게 적용했다. 자동 테스트는 서명된 macOS 앱의 수동 검증을 대체하지 않는다. 아래의 현재 자동 검증과 추가 수동 검증을 구분해 결과를 기록한다.

## 1. 실행 방법

저장소 루트에서 실행한다.

```sh
npm run lint
npm test
npm run build
```

`src-tauri/`에서 실행한다.

```sh
cargo fmt --check
cargo test
cargo clippy --all-targets -- -D warnings
```

Pages의 `test:publication`, `release:macos:verify`는 이 저장소에 없다. 명령이나 테스트 파일을 가져오지 않고 실행 가능하다고 문서화하지 않는다. `slide_compiler::tests::dump_pdf`는 일반 실행에서 무시되는 보조 테스트이며, 통과한 테스트 수에 포함하지 않는다.

## 2. 현재 자동 검증의 주요 경계

| 영역           | 코드·테스트                                                                                                                                 | 확인 대상                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 문서 저장·전환 | `src/hooks/useDocument.test.ts`                                                                                                             | 저장 중 편집 보존, 실패 후 재시도, 오래된 읽기 무시, Save As 도중 문서 전환   |
| 원자적 저장    | `src-tauri/src/document_store.rs`                                                                                                           | 디스크 충돌, 스코프 거부, 임시 파일 생성 실패 시 원본 보존                    |
| 미리보기       | `src/hooks/useSlideDeck.test.ts`                                                                                                            | 이전 비동기 파싱 결과가 최신 문서를 덮어쓰지 않음                             |
| 내보내기       | `src/services/exportService.test.ts`, `exportPreflight.test.ts`                                                                             | 최신 원문 사용, 오류 차단, 경고 확인·취소                                     |
| PPTX           | `src/services/pptxExporter.test.ts`, `pptxVideo.test.ts`                                                                                    | 생성된 파일 구조와 미디어, 실패 처리                                          |
| PDF            | `src-tauri/src/slide_compiler.rs`, `slide_writer.rs`                                                                                        | 레이아웃·블록 컴파일, 페이지 수, 입력 검증·이스케이프                         |
| 자산           | `src/services/videoStore.test.ts`, `imageStore.test.ts`, `pathNames.test.ts`, `src-tauri/src/fs_scope_commands.rs`                          | 경로 검증, 확장자·상속 키 판별, 이미지 캐시, 폴더 허용 후 민감 경로 차단 유지 |
| 발표·편집 UX   | `src/components/Slides/Presenter.test.tsx`, `src/hooks/usePointerActivity.test.tsx`, `src/components/Layout/EditorTextSizeControl.test.tsx` | 포커스·키보드, 타이머 정리, 글자 크기 범위·저장                               |

변경한 경계에는 정상 입력뿐 아니라 빈 입력, 취소, 잘못된 입력, 실패, 응답 순서 역전을 추가한다. 새 파일 시스템 테스트는 전용 임시 디렉터리만 사용하며 사용자 덱을 수정하지 않는다.

## 3. 수동 검증 시나리오

1. `samples/sample-deck.adoc`를 복사해 열고 표지·구분·본문, 표 가운데 정렬, 한글, 목록, 수식, 코드, 이미지, Mermaid를 미리보기·PPTX·PDF에서 비교한다. 글리프 누락, 잘림, 넘침, 슬라이드 수를 확인한다.
2. 별도 테스트 덱에 실제 로컬 동영상·포스터를 넣는다. 재생 가능한 파일, 없는 파일, 지원하지 않는 코덱, 큰 파일을 확인한다. 편집 미리보기는 재생하지 않아야 한다.
3. 발표 모드에서 Tab·Shift+Tab·Esc, 로컬 재생 컨트롤, 유튜브 클릭 재생, 슬라이드 이동 후 재생 상태 초기화, iframe에 포커스가 있을 때 종료를 확인한다.
4. 종료 버튼의 자동 숨김, 호버 유지, 키보드 포커스, 터치 환경, 모션 감소 설정을 실제 WebView에서 확인한다. CSS 문자열 검사는 실제 hit testing 검증이 아니다.
5. 편집기 글자 크기·테마·Vim 모드 변경 후 커서·선택·Undo·한글 IME가 유지되는지 확인한다. 앱을 재시작해 UI 설정 복원과 원문 불변을 확인한다.
6. 저장 중 추가 편집, 다른 문서 열기, 외부 파일 수정, 다이얼로그 취소를 확인한다. 권한 거부·용량 부족은 폐기 가능한 테스트 환경에서만 재현한다.
   - 열기 버튼과 ⌘O/Ctrl+O가 폴더 선택을 표시하고, 덱 하나는 바로 열며 여러 개는 선택을 제공하는지 확인한다. 서명된 macOS 샌드박스 앱에서 Finder 파일 열기 및 최초 저장·Save As 후 상위 폴더 선택을 확인한다. 올바른 폴더 선택 후 반복 저장, 취소 및 다른 폴더 선택 시 원문·기존 파일 보존을 검사한다. 이 OS 권한 동작은 mock·일반 Rust 테스트만으로 검증되지 않는다.
7. 실제 PowerPoint에서 텍스트 편집, 발표자 노트, 로컬 영상·온라인 영상을 확인한다. 인터넷 차단 시 동작과 사전 경고가 일치하는지도 확인한다.
8. 시스템 폰트 메뉴에서 선택·검색·기본값 복원을 확인하고 원문의 `:slide-font:` 및 Undo를 확인한다. 한글·영문을 미리보기/PDF/PPTX에서 비교한다. 선택한 폰트가 없는 환경에서는 PDF가 오류를 반환해야 한다. 수식은 설치된 OpenType 수학 폰트가 필요하며, 일반 테스트 환경의 성공은 다른 OS·샌드박스의 시스템 폰트 접근을 보증하지 않는다.

## 4. 검증 결과를 과장하지 않는다

폰트 검사 회귀는 대문자가 포함된 실제 시스템 폰트 이름과 대소문자 변형을 대상으로 한다. `FontBook.families()`의 표시 이름을 소문자 키 전용 조회에 재사용하지 않고 함께 반환된 인덱스를 사용해야 한다. macOS의 `exports_pdf_with_the_samples_mixed_case_font`는 샘플의 `Apple SD Gothic Neo`로 실제 PDF 바이트 생성을 확인한다.

`codeCallouts.test.ts`는 명시적/자동 번호, 중첩 블록, 설명 없는 코드 보존, 줄 강조 병용, PPTX 텍스트와 시작 예제를 검사한다. PDF 테스트의 강조 코드/설명 문단도 같은 정규화 형태를 사용한다. 실제 출력의 긴 설명 줄바꿈과 슬라이드 넘침은 별도 시각 확인 대상이다.

`validates_selected_fonts_using_the_compilers_font_book`는 같은 Typst 엔진의 검색 결과로 대소문자 무시·선택 생략·없는 폰트 거부를 검사하고 컴파일한다. 내보내기별 중복 검색 제거는 테스트 전체의 성능 개선을 보장하지 않는다. 각 레이아웃 테스트의 독립 검색과 조판 작업은 남아 있으므로 실행 시간은 별도로 측정한다. `mermaidRenderer.test.ts`는 실패한 소스의 재시도와 성공 결과·진행 중 작업 공유를 검사한다.

`closingSlide.test.ts`는 `[.closing]`의 본문·발표자 노트 보존, 기본 머리말·꼬리말·번호 숨김, 개별 재정의와 PPTX 텍스트·가운데 정렬을 검사한다. 네이티브 전체 레이아웃 컴파일 테스트에도 closing 장을 포함한다. 샘플 마지막 장의 실제 WebView·PDF·PowerPoint 배치와 긴 제목의 넘침은 별도 시각 검증 대상이다.

머리말·꼬리말·번호 설정은 `slideChrome.test.ts`에서 표지 기본값, 전역/개별 재정의, 시작 번호와 PPTX 텍스트를 확인한다. `compiles_background_and_highlighted_code`는 이 문구가 포함된 PDF 조판도 검사한다. 실제 미리보기·PPTX·PDF에서 긴 한글 문구, 배경 이미지 위 대비, 꼬리말과 번호의 겹침을 별도로 확인한다.

코드 강조는 `slideEnhancements.test.ts`, 배경/PPTX 편집 가능 텍스트는 `pptxEnhancements.test.ts`, 자산·폰트 점검 실패는 `qualityCheckService.test.ts`, 네이티브 조판은 `compiles_background_and_highlighted_code`로 회귀 검사한다. 샘플의 배경·코드 강조를 실제 WebView·PowerPoint·PDF에서 비교하고, 점검 결과 클릭 시 원문 이동도 확인한다. 품질 점검의 레이아웃 경고는 추정치이며 실제 PDF 경계·글리프 지원·영상 재생 검증이 아니다.

자산 경계는 `src-tauri/src/asset_paths.rs`에서 현재 덱 밖으로 나가는 심볼릭 링크도 검사한다. PDF 자산별 스코프·읽기 크기 제한, 출력 심볼릭 링크 거부, 임시 파일 실패 시 기존 PDF 보존과 새 PDF의 배타적 직접 생성(App Sandbox 경로)은 `slide_compiler.rs` 테스트에 포함한다. 프런트엔드 단위 테스트는 네이티브 경로 resolver를 대체하므로 이 Rust 테스트를 함께 실행한다.

- Mock 파일 API의 성공은 네이티브 다이얼로그·샌드박스 성공을 증명하지 않는다.
- 실패 주입 테스트는 실제 디스크 가득 참, 프로세스 강제 종료, 전원 손실을 재현한 것이 아니다.
- PDF 컴파일·페이지 수·텍스트 확인과 PPTX XML 검사는 시각적 품질·실제 재생을 증명하지 않는다.
- 이 저장소에 Pages의 PNG 기준 이미지 비교 파이프라인이 있다고 가정하지 않는다. 시각 회귀 자동화를 추가하면 기준 이미지, 재생성 절차, 허용 오차를 함께 관리한다.
- 결과에는 커밋, OS·CPU, 실행한 명령, 샘플, 통과/실패/미실행, 대체한 외부 경계를 남긴다.
