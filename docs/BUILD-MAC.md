# macOS 빌드 가이드

**결론: Mac에서 저장소를 클론하고 `npm install` → `npm run dist:mac` 하면 끝.** dmg가 `release/`에 나온다.
Windows에서는 mac dmg를 만들 수 없다(코드 서명·hdiutil이 macOS 전용). 반드시 Mac 본체에서 빌드한다.

---

## 1. 준비물 (Mac)

| 항목 | 버전/비고 |
|---|---|
| macOS | 12(Monterey) 이상 권장 |
| Node.js | **20 LTS 이상** (`node -v`) |
| Git | Xcode Command Line Tools에 포함 — `xcode-select --install` |
| Apple 개발자 계정 | **불필요** (무서명 빌드 방침, `identity: null`) |

내장 글꼴(나눔·KoPubWorld woff2 8개)은 **저장소에 이미 포함**돼 있다. 따로 받을 것 없다.

## 2. 클론 → 설치 → 빌드

```bash
git clone https://github.com/icenovel-rgb/ICEFiction.git
cd ICEFiction
npm install
npm run dist:mac
```

산출물: `release/ICEFiction-<버전>.dmg` (현재 버전이면 `ICEFiction-0.9.0.dmg`)

### 아키텍처 선택

`dist:mac`은 **빌드하는 Mac의 아키텍처**로 만든다(Apple Silicon → arm64, Intel → x64).
다른 아키텍처나 통합 바이너리가 필요하면 플래그를 붙인다.

```bash
npx electron-builder --mac --arm64 --publish never      # Apple Silicon 전용
npx electron-builder --mac --x64 --publish never        # Intel 전용
npx electron-builder --mac --universal --publish never  # 통합(용량 2배)
```

## 3. 빌드 전 검증 (권장 — 증거 기반)

빌드가 성공해도 런타임이 깨질 수 있으므로 Mac에서도 한 번 돌린다(수치는 2026-07-26 Windows 실측 통과분).

```bash
npm run typecheck        # 타입 0 errors (node + web)
npm test                 # 유닛 104 (mdEmbed·정렬·이미지프롬프트·비율·Project·검색·문체·열람·목차·슬래시)
npm run build            # 번들(폰트 8개 포함되는지 로그 확인)
npm run test:e2e         # 편집기 E2E 32 (실제 Electron 창)
npm run test:search:e2e  # 검색 E2E 9 (Ctrl+F 한국어 패널 + 책 전체 검색)
npm run test:lib:e2e     # 책장 E2E 5 (표지·검색·재정렬)
npm run test:folder:e2e  # AI 폴더·문체·슬래시/고스트 E2E 10
npm run test:image:e2e   # 이미지 E2E 9 (생성 엔진은 스텁 PNG로 갈음)
npm run test:ai          # AI 어댑터 유닛 8
npm run test:ai:e2e      # AI E2E 8 (연속 실행 시 간헐 타임아웃 — 재실행하면 통과)
```

E2E는 `playwright-core`가 로컬 Electron 바이너리를 그대로 띄운다. 별도 브라우저 설치 불필요.
AI 관련 E2E는 로컬에 띄우는 **가짜 OpenAI 서버**로 돌기 때문에 API 키도 과금도 필요 없다.

> **AI 이미지 생성(§7.6)만 예외** — 실제 생성은 로컬 CLI(`agy` → `codex` → `gemini`)에 의존한다.
> Mac에 그 CLI가 없으면 앱의 이미지 생성 기능만 못 쓰고, 빌드·테스트에는 영향이 없다(스텁 사용).

## 4. 설치 시 Gatekeeper 경고 (무서명이라 정상)

무서명 dmg라 처음 열 때 macOS가 막는다. **손상된 게 아니다.**

- **방법 A**: Finder에서 앱을 **우클릭 → 열기 → 열기** (최초 1회만)
- **방법 B**: 터미널에서 격리 속성 제거

```bash
xattr -cr /Applications/ICEFiction.app
```

- **방법 C**: 시스템 설정 → 개인정보 보호 및 보안 → 아래 "확인 없이 열기"

> 외부 배포를 하게 되면 Apple Developer ID(연 $99)로 서명 + 공증(notarize)이 필요하다.
> 현재 방침은 Windows와 동일하게 **무서명 유지**(본인 사용).

## 5. 크로스플랫폼 관련 코드 상태

이미 Mac을 고려해 작성돼 있다 — 추가 작업 없음.

- 경로: 프로젝트 루트 기준 **상대 POSIX 경로**만 렌더러로 오간다(§6.11). 절대경로 금지.
- 서재 기본 위치: `app.getPath('documents')/ICEFiction` → Mac에서도 자동으로 `~/Documents/ICEFiction`.
- 설정 파일: `app.getPath('userData')/config.json` → Mac은 `~/Library/Application Support/ICEFiction/`.
- 앱 수명주기: `window-all-closed`에서 `process.platform !== 'darwin'` 분기 + `activate` 처리 완료.
- 커스텀 스킴(`ice-asset://`, `ice-cover://`): 플랫폼 무관.
- 아이콘: `build/icon.png` 512×512 → electron-builder가 **icns 자동 생성**.

## 6. 서재 공유 (Windows ↔ Mac)

서재 경로를 클라우드 폴더(MYBOX·Dropbox 등)로 지정하면 두 기기가 같은 서재를 본다.
책 = 폴더이고 원고 = 표준 마크다운이라 그대로 열린다. 표지(`cover.png`)와 정렬 순서(매니페스트 `order`)도
책 폴더 안에 있으므로 함께 따라간다.

앱 안: **서재 변경** 버튼 → 클라우드 폴더 선택.
