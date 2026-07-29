# ICEFiction

소설 집필 데스크톱 프로그램 — 원고·설정·자료를 한 폴더에 모으고 AI 조수와 함께 쓴다.
Windows 우선 개발 → macOS 이식. ICE 제품군(ICEPDF·ICEWriter)의 스택·디자인을 계승한다.

- 청사진: [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md)
- 개발 일지: [`docs/DEVLOG.md`](docs/DEVLOG.md)

## 핵심 설계

- **폴더 = 프로젝트**: 프로젝트는 평범한 마크다운 폴더. 통째로 복사하거나 클라우드(MYBOX 등)에 두면
  다른 컴퓨터에서 그대로 열린다. 전용 DB에 가두지 않는다.
- **AI는 조수**: (예정) 항상 제안 → diff → 승인, 적용 직전 자동 스냅샷.
- **두 겹 화면**: 앱 크롬은 어두운 도구 톤(+남색 강조), 원고 본문은 눈이 편한 종이.

## 기능 (M1 현재)

- 프로젝트 생성/열기 (표준 폴더 구조 자동 생성)
- 바인더 트리 (원고/캐릭터/세계관/노트) + 문서 생성·상태 배지
- CodeMirror 6 본문 에디터 (한글 IME 네이티브, 마크다운, 줄바꿈)
- 자동 저장 (2초 디바운스) + 문서 전환/종료 직전 flush
- 글자수(공백 포함/제외)·원고지 매수·세션 증감·목표 % 실시간
- 인스펙터: 제목·상태·POV·시놉시스·목표 글자수 (프론트매터 편집)
- 자료 드래그드롭 반입 (`assets/`로 복사) + `ice-asset://` 미디어 프로토콜
- 이미지 임베드는 표준 마크다운 `![](문서기준 상대경로)` — 다른 프로그램에서도 열림 (옛 `![[..]]` 일괄 변환 도구 포함)
- AI 조수: 3계열(OpenAI 호환·Anthropic·CLI) 스트리밍 + "항상 원고를 봄" 컨텍스트(별칭 감지·시놉시스 흐름)
  + "AI에게 보낸 내용 보기"(투명성) + 이미지·PDF 자료 첨부(vision·텍스트 추출)
- 프로젝트 폴더 열기 / 우클릭 탐색기에서 보기

## 개발

```bash
npm install
npm run dev        # 개발 모드 (창 실행)
npm test           # ProjectService 스모크 (tsx, electron 불필요)
npm run typecheck  # tsc 타입체크 (node + web)
npm run build      # 프로덕션 빌드 → out/
npm run dist       # (Windows) NSIS 설치파일 → release/  (설치 시 바탕화면 바로가기 선택)
npm run dist:mac   # (macOS에서 실행) dmg → release/  (무서명, 배포 시 서명·공증 필요)
```

> macOS 이식: 코드는 크로스플랫폼(경로 POSIX·`process.platform` 분기·CLI PATH 보강·mac 앱 수명주기).
> Mac에서 `npm install && npm run dist:mac` 로 dmg 생성. 무서명이라 첫 실행은 우클릭→열기(Gatekeeper).

### 배포 — 태그 하나로 두 플랫폼

`v*` 태그를 밀면 GitHub Actions가 양쪽 설치 파일을 만들어 릴리스에 붙인다. 손으로 빌드해 올릴 필요가 없다.

| 워크플로 | 러너 | 산출물 | 서명 |
|---|---|---|---|
| `build-mac` | `macos-14` (arm64) | `ICEFiction-<버전>.dmg` | Developer ID 서명 + 공증 (Secrets 있을 때) |
| `build-win` | `windows-latest` (x64) | `ICEFiction-Setup-<버전>.exe` | 무서명 — SmartScreen "추가 정보 → 실행" |

```bash
# package.json 의 version 을 올린 뒤
git tag v0.10.2 && git push origin v0.10.2
```

둘 다 `npm ci` → `typecheck` → `npm test` → `build` 를 거치므로, 테스트가 깨지면 설치 파일이 나오지
않는다. main 대상 PR에서도 같은 검증이 돌지만 릴리스 첨부는 태그에서만 한다.
자세한 절차·서명 자격증명은 [docs/BUILD-MAC.md](docs/BUILD-MAC.md).

## 아키텍처

```
Electron
├─ main (Node)
│  ├─ ProjectService   폴더=프로젝트: 스캔·프론트매터 파싱·원자적 저장
│  ├─ ipc              렌더러 window.api ↔ 서비스 배선
│  └─ ice-asset://     프로젝트 내 자료(이미지·동영상) 안전 서빙
├─ preload             contextBridge로 window.api 노출 (webUtils 드래그드롭 경로)
└─ renderer (React + zustand)
   ├─ Binder · Editor(CM6) · Inspector · StatusBar
   └─ 자동 저장 · 글자수/원고지 계산
```

## 스택

Electron 42 · electron-vite 5 · React 19 · zustand 5 · TypeScript 5.9 · CodeMirror 6 ·
gray-matter · unpdf(PDF 텍스트 추출) · 손으로 쓴 `global.css` (ICEPDF 하우스 스타일).
자세한 근거는 청사진 §0·§3 참조.
