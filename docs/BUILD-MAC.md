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
| Apple 개발자 계정 | 무서명 빌드는 **불필요**. 외부 배포용 서명·공증은 §8 참조 |

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

> 외부 배포를 하게 되면 Apple Developer ID(연 $99)로 서명 + 공증(notarize)이 필요하다 —
> 배선은 이미 돼 있고 **Secrets만 채우면 자동**이다(§8). 기본 방침은 본인 사용 **무서명 유지**.

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
- 파이프라인: `npm ci` → `typecheck` → `npm test` → `electron-builder --mac` → dmg 공증·stapling → 업로드.
- 산출: **`arm64`(Apple Silicon) dmg**. 올라가는 곳이 두 군데이고 성격이 다르다.

| | Actions 아티팩트 | 릴리스 에셋 |
|---|---|---|
| 언제 | 모든 실행 | **`v*` 태그 push + Secrets 있을 때만** |
| 보관 | 90일 후 삭제 | 영구 |
| 접근 | GitHub 로그인 필요 | 링크만으로 누구나 |
| 용도 | 빌드 확인 | 배포 |

릴리스 첨부는 **서명·공증을 거친 경우에만** 한다(`HAS_SIGNING` 조건). Secrets가 없으면 무서명
dmg가 나오는데 그게 공개 릴리스로 나가면 안 되기 때문이다. 해당 태그의 릴리스가 아직 없으면
`--generate-notes`로 만들고 붙인다.

> **Windows exe는 별도 워크플로**(`.github/workflows/build-win.yml`, `windows-latest`)가 만든다.
> 트리거가 같아서 `v*` 태그 하나로 dmg·exe가 함께 나온다 — 예전처럼 Windows 기기에서 손으로
> 빌드해 올릴 필요가 없다. 이쪽은 **서명 조건이 없다**: Windows 코드 서명 인증서가 없어 무서명이
> 기본이고, 조건을 걸면 exe가 영구히 안 붙기 때문이다(설치 시 SmartScreen 경고는 그대로).
>
> 두 워크플로가 같은 태그에서 동시에 도는 만큼 릴리스를 둘이 같이 만들려 할 수 있어, 양쪽 다
> `gh release create` 실패 시 상대가 만든 릴리스를 다시 확인하는 방어를 넣어 뒀다.

> **Intel(x64)은 매트릭스에서 뺐다.** `macos-13` 라벨이 GitHub 러너 목록에서 사라져 그 잡에
> 러너가 배정되지 않고 `queued`로 방치된다(2026-07-26 실행이 14시간 넘게 대기, 같은 실행의
> arm64 잡은 그 사이 성공). `fail-fast: false`라 arm64 산출물은 나오지만 워크플로 전체가
> 끝나지 않아 릴리스가 완료 표시되지 않는다.
>
> Intel이 다시 필요하면 워크플로의 주석 처리된 항목을 되살린다. **라벨 주의 — `macos-15`는
> ARM64다.** Intel 러너는 `-intel` 접미사가 붙는다(2026-07 기준 `macos-15-intel`·`macos-26-intel`).
> 한 파일로 끝내고 싶으면 arm64 러너에서 `--universal`로 통합 바이너리를 뽑아도 된다(용량 2배).

로컬 Mac에서 직접 빌드하려면 아래 §7(구 §6) 그대로 `npm run dist:mac`.

## 7. 서재 공유 (Windows ↔ Mac)

서재 경로를 클라우드 폴더(MYBOX·Dropbox 등)로 지정하면 두 기기가 같은 서재를 본다.
책 = 폴더이고 원고 = 표준 마크다운이라 그대로 열린다. 표지(`cover.png`)와 정렬 순서(매니페스트 `order`)도
책 폴더 안에 있으므로 함께 따라간다.

앱 안: **서재 변경** 버튼 → 클라우드 폴더 선택.

## 8. 서명 · 공증 (외부 배포용)

무서명 dmg는 macOS가 "확인되지 않은 개발자"로 막고, 최신 macOS는 공증 없는 앱을 아예 거부한다.
외부 배포를 하려면 **① Developer ID 서명 + ② 공증(notarize)** 이 필요하다(Apple Developer Program, 연 $99).

### 8.1 최초 1회 준비 (한 번만)

1. **Developer ID Application 인증서** 발급 → 키체인에서 **`.p12`로 내보내기**(비밀번호 지정).
2. **App Store Connect API 키** 생성(Users and Access → Integrations/Keys, Developer 권한) →
   **`.p8` 1회 다운로드**. Key ID·Issuer ID도 기록.
3. 아래 값을 저장소 **Settings → Secrets and variables → Actions**에 등록:

   | Secret | 값 |
   |---|---|
   | `MAC_CSC_LINK` | `.p12` 를 base64 인코딩한 문자열 (`base64 -i cert.p12 \| pbcopy`) |
   | `MAC_CSC_KEY_PASSWORD` | `.p12` 비밀번호 |
   | `APPLE_API_KEY_BASE64` | `.p8` 를 base64 인코딩한 문자열 (`base64 -i AuthKey_XXX.p8 \| pbcopy`) |
   | `APPLE_API_KEY_ID` | API 키 ID |
   | `APPLE_API_ISSUER` | API 이슈어 ID |

> `.p12`·`.p8`·`.cer`은 `.gitignore`로 커밋이 막혀 있다. **절대 저장소에 넣지 말 것** — Secrets에만 둔다.

**base64 인코딩 헬퍼**: `.p12`와 `.p8`를 만든 뒤 아래 한 줄이면 5개 Secret 값이 복붙용으로 출력된다.

```bash
tools/mac-secrets-encode.sh 경로/cert.p12 경로/AuthKey_XXXX.p8
```

### 8.2 이후 릴리스 (버전업마다 — 자동)

준비가 끝나면 **버전 숫자만 올리고 태그를 밀면** CI가 알아서 서명·공증까지 한다. 인증서 절차를
다시 밟지 않는다.

```bash
# package.json 의 version 을 올린 뒤
git tag v0.7.2 && git push origin v0.7.2   # → build-mac 이 서명+공증된 dmg 산출
```

또는 Actions 탭에서 `build-mac` 수동 실행(**Run workflow**)해도 Secrets가 있으면 서명·공증된다.
PR·검증 빌드는 **항상 무서명**이라 인증서를 쓰지 않는다(빠른 확인).

### 8.3 로컬 Mac에서 서명·공증

```bash
export CSC_LINK=$(base64 -i cert.p12)      # 또는 .p12 파일 경로
export CSC_KEY_PASSWORD=...                 # p12 비밀번호
export APPLE_API_KEY=./AuthKey_XXX.p8
export APPLE_API_KEY_ID=...
export APPLE_API_ISSUER=...
npm run dist:mac:release                    # 서명 + 공증
```

`npm run dist:mac`(공증 없음)은 키체인에 Developer ID가 있으면 **서명만**, 없으면 무서명으로 나온다.

### 8.4 앱과 dmg는 따로 공증된다 (놓치기 쉬움)

electron-builder의 `mac.notarize`는 **`.app`만** 공증한다. dmg 껍데기는 별개 산출물이라 그대로 두면
무서명으로 남고, 다운로드한 dmg를 여는 첫 단계에서 Gatekeeper가 막는다
(`spctl -t open` → `rejected, source=no usable signature`). 안에 든 앱이 공증돼 있어도 그렇다.

그래서 두 가지를 해뒀다.

- `electron-builder.yml`의 **`dmg.sign: true`** — dmg 서명(electron-builder가 처리).
- CI의 **`dmg 공증·stapling`** 스텝 — 서명된 dmg를 notarytool로 공증하고 티켓을 붙인다.

로컬에서 수동으로 할 때도 dmg는 따로 챙겨야 한다.

```bash
DMG=release/ICEFiction-<버전>.dmg
xcrun notarytool submit "$DMG" --key "$APPLE_API_KEY" \
  --key-id "$APPLE_API_KEY_ID" --issuer "$APPLE_API_ISSUER" --wait
xcrun stapler staple "$DMG"
```

### 8.5 결과 검증

앱과 dmg **둘 다** 확인한다. 실제 산출 경로는 `release/mac-arm64/`(Apple Silicon)·`release/mac/`(Intel).

```bash
# 앱 — 실행 시점
spctl -a -vvv --type exec "release/mac-arm64/ICEFiction.app"
xcrun stapler validate "release/mac-arm64/ICEFiction.app"

# dmg — 다운로드해서 여는 시점
spctl -a -vvv -t open --context context:primary-signature "release/ICEFiction-<버전>.dmg"
xcrun stapler validate "release/ICEFiction-<버전>.dmg"
```

넷 다 `accepted, source=Notarized Developer ID` / `The validate action worked!` 가 나와야 한다.

> 공증 소요 시간은 들쭉날쭉하다. 2026-07-27 실측: 앱 첫 제출 **44분**, 직후 dmg 제출 **약 5분**.
> 첫 제출이 느린 편이니 `In Progress`가 30분 넘게 이어져도 정상이다 — 재제출하면 큐 뒤로 밀려 손해다.

### 8.6 인증서 갱신은 언제?

- **버전업 때는 아무것도 안 해도 된다** — Secrets가 그대로 재사용된다.
- Developer ID Application 인증서는 유효기간이 길다(약 5년). 만료되면 그때 §8.1의 1·3만 다시 한다.
- Apple Developer Program 멤버십(연 $99)이 끊기면 공증이 거부된다 — 갱신 유지 필요.
