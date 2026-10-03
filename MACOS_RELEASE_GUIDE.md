# macOS 출시 준비 가이드

Pages의 `MACOS_RELEASE_GUIDE.md`에서 최소 권한·서명 검증·실기기 점검 원칙을 가져왔다. Slides의 배포 경로를 Mac App Store로 확정하는 문서가 아니며, 서명·심사·공증 완료를 의미하지 않는다. Apple의 최신 요구 사항은 출시 시점에 공식 문서로 다시 확인한다.

## 1. 배포 경로와 설정

- Mac App Store 제출과 Developer ID 직접 배포 중 경로를 먼저 정하고, 해당 경로의 서명·프로비저닝·공증·업데이트 요건을 확인한다. 서로의 검증을 대체한다고 가정하지 않는다.
- 기준 설정은 `src-tauri/tauri.conf.json`, `src-tauri/entitlements.plist`, `src-tauri/capabilities/default.json`이다.
- 현재 설정은 제품명 `AsciiDoc Slides`, Bundle ID `com.asciidoc.slides`, macOS 최소 버전 `11.0`, Hardened Runtime, AsciiDoc 파일 연결을 선언한다. Bundle ID 소유·등록, 실제 지원 OS·CPU, 산출물의 버전·아이콘은 배포자가 확인한다.
- Pages의 인증서·Team ID·Bundle ID·프로비저닝 파일을 복사하지 않는다. 인증 정보와 비밀값은 Git이나 로그에 넣지 않는다.

## 2. 권한과 개인정보

현재 entitlement 파일은 App Sandbox, 사용자 선택 파일 읽기/쓰기, outbound network를 선언한다. 설정 파일의 선언과 최종 서명된 앱의 실제 entitlement를 구분해 검사한다. 샌드박스에서는 저장 패널로 고른 파일 하나만 쓸 수 있으므로, PDF 내보내기는 새 파일이면 직접 생성하고 기존 PDF 교체는 거부하는지 서명된 앱에서 확인한다.

- 선택한 덱·폴더·출력 위치만 허용하고, 편의를 위해 홈 전체 정적 권한을 추가하지 않는다. fs와 asset 스코프의 민감 경로 차단을 모두 확인한다.
- 경로 문자열 저장만으로 재시작 후 접근 권한이 유지된다고 가정하지 않는다. 지속 접근 기능을 추가할 때는 플랫폼의 보안 범위 권한 수명주기를 별도로 구현·검증한다.
- 유튜브 iframe과 브라우저로 열기가 이 앱의 외부 네트워크 동작이다. 오프라인 편집과 클릭 후 외부 연결을 구분해 개인정보 설명·심사 노트에 반영한다.
- 원문 파일과 기기별 UI 설정의 저장 위치·삭제 방법을 설명한다. Pages의 복구·이력·검색 인덱스가 Slides에도 있다고 고지하지 않는다.
- 분석·충돌 보고·업데이트 SDK 등을 추가하면 실제 네트워크 동작, 의존성, privacy manifest 적용 여부와 개인정보 고지를 재검토한다.
- 라이선스·번들 폰트 고지는 실제 배포 산출물과 일치해야 한다.

## 3. 출시 검증

[RELIABILITY_TESTING.md](./RELIABILITY_TESTING.md)의 자동 검증 후, 저장소 루트에서 실제 앱을 빌드한다.

```sh
npm run tauri build -- --bundles app
```

빌드 성공만으로 서명·공증·출시 준비가 끝났다고 표시하지 않는다. 이 저장소에는 Pages의 `release:macos:verify` 스크립트가 없다.

지원할 OS·CPU의 깨끗한 계정/장치에서 다음을 확인한다.

1. 설치·실행·재실행, Finder에서 덱 열기, 실행 중 추가 파일 전달.
2. 파일·폴더 열기, 저장·다른 이름 저장·취소·외부 수정 충돌, 허용되지 않은 경로 거부.
3. 한글 IME·Vim·Undo·편집기 크기, 라이트/다크·좁은 창·키보드 탐색.
4. 전체 화면 진입·종료·포커스 복원, 로컬 영상과 유튜브, 네트워크 차단 상태.
5. 샘플 덱의 PDF 한글·표·수식·이미지·다이어그램·정렬과 PowerPoint의 편집·노트·영상 재생.
6. 최종 앱의 서명·entitlement·샌드박스와 배포 경로별 검사. 직접 배포라면 공증·Gatekeeper 확인 기록도 남긴다.

PDF/A 등 표준 준수를 제품 설명에 넣으려면 별도 검증기를 사용한 실제 출력 검증이 필요하다. 단위 테스트나 PDF 생성 성공만으로 인증을 주장하지 않는다.

## 4. 출시 기록과 공식 참고 자료

커밋·버전·CPU 대상·OS·산출물·서명 검사·수동 테스트·미해결 이슈를 기록한다. 스토어 등록, 가격·계약, 지원/개인정보 URL, 스크린샷, 서명·공증 상태는 실제 준비 결과로 채운다.

출시 때 확인할 공식 자료(이 가이드 이식 작업에서 최신 정책 검증을 완료한 것은 아니다):

- [Apple 심사 지침](https://developer.apple.com/app-store/review/guidelines/)
- [App Sandbox 구성](https://developer.apple.com/documentation/xcode/configuring-the-macos-app-sandbox)
- [직접 배포 공증](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution)
- [Privacy manifest](https://developer.apple.com/documentation/bundleresources/privacy-manifest-files)
