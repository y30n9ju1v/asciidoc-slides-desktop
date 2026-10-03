# SafeDocument와 SlideDeck 계약

Pages의 동명 안내처럼 공통 명세를 복제하지 않고 [공유 SafeDocument 명세](./packages/asciidoc-typst/SAFE_DOCUMENT_SPEC.md)를 참조한다. 서브모듈이 비어 있으면 `git submodule update --init --recursive`로 저장소가 고정한 리비전을 준비한다. 임의로 최신 리비전으로 올리지 않는다.

## Slides 전용 계약

- `Slide.layout`의 `closing`은 가운데 정렬 마무리 장이다. 구분 장의 테마·본문 렌더링을 재사용하며, 머리말·꼬리말·번호는 기본 숨김이다. 개별 `slide-header`, `slide-footer`, `slide-page-numbers` 속성으로 재정의할 수 있다. `[.closing]`은 마지막 장 자동 감지가 아닌 명시적인 역할이다.

- TypeScript 기준: [slideDeck.ts](./src/services/slideDeck.ts).
- Rust 대응 모델: [slide_deck.rs](./src-tauri/src/slide_deck.rs).
- 선택적 `fontFamily`는 `:slide-font:`의 설치 폰트 이름이다. 생략하면 시스템 기본값을 사용한다. PDF는 설치 여부를 확인하며 Typst 문자열로 이스케이프한다. 기존 v1 문서는 이 필드 없이도 읽을 수 있다.
- 슬라이드 본문은 공유 `SafeBlock[]`이고, `blockLayouts`가 같은 인덱스의 크기·정렬을 정의한다.
- 선택적 `blockLayouts[].codeHighlights`는 최상위 코드 블록의 1-based 강조 줄 번호다. 선택적 `Slide.backgroundImage`는 문서 상대 이미지 경로이며 기존 자산 경계로 읽는다. 기존 v1 필드 생략은 기본 동작을 유지한다. 공유 서브모듈 모델은 변경하지 않는다.
- 선택적 `Slide.chrome`은 해석된 `header`, `footer`, `pageNumber` 문자열이다. 빈 문자열은 숨김이며, 필드 자체가 없는 기존 v1 슬라이드는 표지 번호 숨김·그 외 실제 장 번호를 사용한다. 파서가 전역/슬라이드별 속성과 시작 번호를 한 번 해석하고 세 출력기가 같은 값을 표시한다.
- 동영상은 공유 블록에 임의 타입을 넣지 않고 `SlideVideo[]`로 보관한다. `at`은 본문 블록 앞의 위치이며 마지막 위치는 본문 뒤다. 순서 처리는 `src/services/slideItems.ts`와 Rust 출력기를 함께 확인한다.
- 문서의 진단·메타데이터·테마·스타일과 슬라이드의 제목·노트·원문 줄 번호는 데이터로 전달한다. DOM, 파일 핸들, 실행 가능한 소스를 추가하지 않는다.
- `SlideDeck.version`과 공유 SafeDocument 버전은 별개다. 호환성 변경 시 양쪽 모델·요청 검증·테스트를 함께 검토한다.

## 변경 규칙

1. 새 문법의 데이터 형태, 위치 진단, 지원하지 않는 출력에서의 손실을 먼저 정의한다.
2. 파서·미리보기·PPTX·PDF를 함께 갱신한다. 일부 출력만 지원하면 preflight에서 명시적으로 알린다.
3. 타입 선언만 믿지 않는다. 외부 입력 경계에서 경로·식별자·숫자·요청 크기·깊이를 검증하고 Rust에서 Typst 이스케이프를 유지한다.
4. 정상 입력, 잘못된 입력, 중첩 내용, 순서, 출력 간 차이를 회귀 테스트한다.
5. 공유 라이브러리 변경이 필요하면 별도 프로젝트로 취급한다. Slides 수정의 부수 효과로 서브모듈을 포맷하거나 업데이트하지 않는다.
