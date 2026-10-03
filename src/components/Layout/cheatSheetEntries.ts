export const CHEAT_SHEET_ENTRIES = [
  {
    title: '슬라이드와 마무리 장',
    note: '== 제목마다 새 장이 됩니다. [.section]은 구분 장, [.closing]은 가운데 정렬 마무리 장입니다.',
    code: '== 슬라이드 제목\n\n본문입니다.\n\n[.closing]\n== 감사합니다\n\n질문이 있으신가요?',
  },
  {
    title: '줄바꿈과 문단',
    note: '빈 줄은 문단을 나눕니다. Enter만 누르면 같은 문단으로 이어집니다. 줄 끝에 공백과 +를 쓰면 같은 문단 안에서 줄이 바뀝니다(미리보기·PPTX·PDF 공통). 코드 블록과 표 안에서도 쓸 수 있습니다.',
    code: '첫 번째 줄 +\n두 번째 줄\n세 번째 줄은 Enter만 눌러 이어집니다.\n\n새 문단입니다.',
  },
  {
    title: '슬라이드 글자 크기',
    note: '바로 다음 최상위 블록에 적용됩니다. .small은 80%, .large는 120%입니다. 상단 −/+는 편집기 크기만 바꿉니다.',
    code: '[font-size=120%]\n큰 문단입니다.\n\n[.small]\n작은 문단입니다.\n\n[source,python,font-size=80%]\n----\nprint("Hello")\n----',
  },
  {
    title: '서식과 목록',
    note: '별표는 굵게, 밑줄은 기울임, 백틱은 인라인 코드입니다.',
    code: '*굵게*, _기울임_, `코드`\n\n* 첫 번째 항목\n* 두 번째 항목\n** 하위 항목',
  },
  {
    title: '코드 강조와 번호 설명',
    note: 'highlight는 강조할 줄 번호입니다. 코드 끝의 <1>은 (1)로 표시되고 바로 아래 설명과 연결됩니다.',
    code: '[source,python,highlight="2"]\n----\ndef greet(name):\n    return f"Hello, {name}!" # <1>\n----\n<1> 이름을 넣은 인사말을 만듭니다.',
  },
  {
    title: '너비와 가운데 정렬',
    note: '블록의 너비와 정렬을 함께 지정할 수 있습니다.',
    code: '[.center,width=70%]\n가운데 정렬한 문단입니다.\n\n[.small.center,width=70%]\n|===\n| 이름 | 값\n\n| 항목 | 100\n|===',
  },
  {
    title: '폰트·머리말·꼬리말·번호',
    note: '문서 헤더에 설정합니다. 폰트는 이 컴퓨터에 설치된 이름을 사용하세요. 개별 장의 설정으로 덮어쓸 수 있습니다.',
    code: '= 발표 제목\n작성자\n:slide-font: Apple SD Gothic Neo\n:slide-header: 회사명\n:slide-footer: 행사명\n:slide-page-numbers: true\n\n[slide-header="",slide-footer="",slide-page-numbers=false]\n== 번호 없는 장',
  },
  {
    title: '발표자 노트',
    note: '현재 장의 발표자 노트입니다. 슬라이드 본문에는 표시되지 않고 PPTX 노트로 내보내집니다.',
    code: '[.notes]\n--\n여기에서 예시를 설명하세요.\n--',
  },
];
