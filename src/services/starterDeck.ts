/** The deck a new document starts from - a short tour of the syntax. */
export const STARTER_DECK = `= 새 발표 자료: 부제목을 입력하세요
작성자 이름
:revdate: ${new Date().toISOString().slice(0, 10)}
:slide-theme: light
:slide-style: classic

[.notes]
--
발표자 노트는 슬라이드에 보이지 않고, PPTX의 노트로 내보내집니다.
--

== 첫 번째 슬라이드

* \`==\` 제목 하나가 슬라이드 한 장입니다
* *굵게*, _기울임_, \`코드\` 를 쓸 수 있습니다
** 중첩 목록도 지원합니다

[.section]
== 구분 슬라이드

== 코드와 표

[source,python]
----
print("Hello, slides!")
----

[.small,width=70%]
|===
| 형식 | 용도

| PPTX | 편집 가능한 PowerPoint
| PDF | 배포용 고정 레이아웃
|===

== 감사합니다

질문이 있으신가요?
`;
