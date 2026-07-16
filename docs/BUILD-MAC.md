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

산출물: `release/ICEFiction-<버전>.dmg` (예: `ICEFiction-0.5.0.dmg`)

### 아키텍처 선택

`dist:mac`은 **빌드하는 Mac의 아키텍처**로 만든다(Apple Silicon → arm64, Intel → x64).
다른 아키텍처나 통합 바이너리가 필요하면 플래그를 붙인다.

```bash
npx electron-builder --mac --arm64 --publish never      # Apple Silicon 전용
npx electron-builder --mac --x64 --publish never        # Intel 전용
npx electron-builder --mac --universal --publish never  # 통합(용량 2배)
```

## 3. 빌드 전 검증 (권장 — 증거 기반)

빌드가 성공해도 런타임이 깨질 수 있으므로 Mac에서도 한 번 돌린다.

```bash
npm run typecheck      # 타입 0 errors
npm test               # 유닛: mdEmbed 7 · ProjectService 21 · Library 9
npm run build          # 번들(폰트 8개 포함되는지 로그 확인)
npm run test:e2e       # 편집기 E2E 24 (실제 Electron 창)
npm run test:lib:e2e   # 책장 E2E 5 (표지·검색·재정렬)
```

E2E는 `playwright-core`가 로컬 Electron 바이너리를 그대로 띄운다. 별도 브라우저 설치 불필요.

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

이미 Mac을 고려해 작성돼 있다.

- 경로: 프로젝트 루트 기준 **상대 POSIX 경로**만 렌더러로 오간다(§6.11). 절대경로 금지.
- 서재 기본 위치: `app.getPath('documents')/ICEFiction` → Mac에서도 자동으로 `~/Documents/ICEFiction`.
- 설정 파일: `app.getPath('userData')/config.json` → Mac은 `~/Library/Application Support/ICEFiction/`.
- 앱 수명주기: `window-all-closed`에서 `process.platform !== 'darwin'` 분기 + `activate` 처리 완료.
- CLI 스폰: Finder 실행 시 GUI 앱은 셸 PATH를 못 물려받으므로 `proc.ts`가 homebrew(`/opt/homebrew/bin`
  ·`/usr/local/bin`) 등 표준 위치를 PATH에 보강한다 — agy·codex·ollama 감지 실패 방지.
- 커스텀 스킴(`ice-asset://`, `ice-cover://`): 플랫폼 무관.
- 아이콘: `build/icon.png` 512×512 → electron-builder가 **icns 자동 생성**.
- **네이티브 메뉴**(`src/main/menu.ts`, darwin 전용): App·편집·보기·창·도움말. 메뉴를 안 주면 Electron이
  개발자용 기본 메뉴를 노출하고, 그 기본 메뉴의 줌 role(Cmd+= · Cmd+- · Cmd+0)이 렌더러 자체 줌과
  겹쳐 **이중 줌**이 난다 — 커스텀 메뉴에서 줌 role을 빼 렌더러만 줌을 다루게 한다. Windows/Linux는 무영향.

## 6. CI로 dmg 뽑기 (Mac 본체가 없어도 됨)

`.github/workflows/build-mac.yml` — GitHub **macOS 러너**에서 무서명 dmg를 빌드한다.

- 실행: 저장소 **Actions** 탭 → `build-mac` → **Run workflow**(수동), 또는 `v*` 태그 push 시 자동.
- 산출: `arm64`(Apple Silicon)·`x64`(Intel) dmg가 Actions **아티팩트**로 올라온다.
- 파이프라인: `npm ci` → `typecheck` → `npm test` → `electron-builder --mac`.

로컬 Mac에서 직접 빌드하려면 아래 §7(구 §6) 그대로 `npm run dist:mac`.

## 7. 서재 공유 (Windows ↔ Mac)

서재 경로를 클라우드 폴더(MYBOX·Dropbox 등)로 지정하면 두 기기가 같은 서재를 본다.
책 = 폴더이고 원고 = 표준 마크다운이라 그대로 열린다. 표지(`cover.png`)와 정렬 순서(매니페스트 `order`)도
책 폴더 안에 있으므로 함께 따라간다.

앱 안: **서재 변경** 버튼 → 클라우드 폴더 선택.
