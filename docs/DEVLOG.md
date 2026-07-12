# ICEFiction 개발 일지

## 2026-07-09 — M0 스캐폴드 + M1 에디터 코어

ICE 제품군 분석 후 스택·디자인·AI 패턴을 계승하기로 확정(청사진 v0.2). 첫 구현 착수.

### 완료 (M0 + M1 핵심)

- **M0 스캐폴드**: ICEPDF 하우스 스택 복제 — Electron 42 + electron-vite 5 + React 19 +
  zustand 5 + TS 5.9 + 손으로 쓴 `global.css`. `src/{main,preload,renderer,shared}` 구조.
- **데이터 모델**: "폴더 = 프로젝트". `icefiction.json` 매니페스트 + `manuscript/characters/
  world/notes/assets/trash/snapshots` 표준 구조. 문서 = 마크다운 + YAML 프론트매터.
- **ProjectService**: 생성/열기, 트리 스캔, 프론트매터 파싱(gray-matter, snake_case↔camelCase
  매핑 + 미지 키 `extra` 보존), 원자적 저장(temp→rename), 경로 탈출 가드.
- **에디터**: CodeMirror 6 — 한글 IME 네이티브. 동기화 루프 방지(syncing 플래그).
  자동 저장 2초 디바운스 + 전환/종료 flush.
- **글자수/원고지**: 공백 포함/제외, 원고지 200자 매수, 세션 증감.
- **자료 반입**: 드래그드롭 → `assets/` 복사(webUtils 경로). `ice-asset://` 커스텀 프로토콜로
  contextIsolation 유지하며 미디어 서빙.
- **UI**: Welcome / Binder / Editor / Inspector / StatusBar. ICEPDF 다크 톤 + ICEFiction 남색 `#312d99`.

### 검증 (증거 기반)

- `npm test` — ProjectService 스모크 **7/7 통과** (생성·왕복·extra 보존·snake_case 기록·
  createDoc·ingest·경로 가드).
- `npm run typecheck` — **0 errors** (node + web).
- `npm run build` — **성공** (main 13.75kB · preload index.mjs · renderer 1.5MB[CM6 포함]).
- out/ 구조 + preload 경로 계약(`../preload/index.mjs`) 확인.
- GUI 실기 실행(`npm run dev`)은 사용자 확인 몫으로 남김(자동 환경에서 창 팝업 지양).

### 다음(미착수)

- M1 잔여: 자료 패널·썸네일·라이트박스·인라인 미디어 프리뷰(현재는 반입까지만).
- 위키링크 `[[ ]]` + 백링크, FTS 검색 (M2).
- AI 어시스턴트 3계열 어댑터 — ICEWriter `core/ai/` 이식 (M3).
- 스냅샷/diff, `.icefic` 번들 입출력 (M5).

## 2026-07-10 — 서재 모델 전환 + 런타임 버그 3건

- **서재(Library) 모델로 재구조화**: "폴더 아무거나 열기"를 폐기하고 ICEWriter 방식으로 전환.
  서재 경로 1개(기본 `~/Documents/ICEFiction`, `%APPDATA%/ICEFiction/config.json` 기록) 안에
  책이 폴더로 쌓인다. 책장(Bookshelf) 화면 + "새 소설"이 서재 안에 폴더 자동 생성. LibraryService
  신설, 스모크 6건 추가.
- **설치 파일**: electron-builder NSIS → `release/ICEFiction-Setup-0.1.0.exe` (98MB).
- **런타임 버그 3건 수정** (모두 컴파일은 통과 → E2E 도입 계기):
  1. Electron 바이너리 미다운로드(`Error: Electron uninstall`) → `install.js` 수동 실행.
  2. `window.prompt()` 미지원(새 소설/이름변경/새 문서 먹통) → 인앱 입력·확인 모달(DialogHost) 도입.
  3. 에디터 입력 불가 → activePath 없을 때 호스트 div를 렌더 안 해 EditorView가 영영 미생성.
     호스트 상시 마운트 + editable 컴파트먼트로 수정.
- **E2E 도입**(playwright-core): 실제 Electron 창에서 새 소설→챕터→한글 입력→자동저장까지 검증
  (`npm run test:e2e`, 5/5). 컴파일만으론 못 잡는 런타임 회귀 방지.

## 2026-07-10 — M2 착수: 보기·테마 + 자료/캐릭터 이미지

- **보기·집필 테마**(우측 '보기' 탭): 줄번호 토글, 세피아/다크/화이트 프리셋, 글꼴·글자크기·줄간격,
  글자색·배경색 직접 지정. useSettings(localStorage persist) → CSS 변수(--paper-*, --gutter-display).
- **자료 갤러리**(우측 '자료' 탭): assets/ 스캔(ProjectService.listAssets) → 썸네일 그리드 → 라이트박스
  (이미지 확대·동영상 재생·이전/다음, HEVC 등은 시스템 열기 폴백).
- **캐릭터·문서 이미지**: 프론트매터 `images[]`. 인스펙터에 썸네일 섹션(추가=자료 픽커, 제거, 클릭=라이트박스).
- **E2E 확장** 11/11: 입력·저장 + 줄번호 토글·테마 변경 + 자료 갤러리·라이트박스 + 캐릭터 이미지 첨부→저장.
  테스트를 `--user-data-dir`로 격리(설정 localStorage까지) — 실제 앱 취향 오염·비결정성 제거.

## 2026-07-10 — 프로그램 내 이미지 추가 + M3 AI 어시스턴트

- **프로그램 내 이미지 추가**: assets:import(dialog 파일선택, 이미지·동영상 필터). 자료 패널 '+ 파일 추가',
  픽커 '+ 파일에서 추가'(넣은 즉시 캐릭터에 첨부).
- **M3 AI 어시스턴트 (ICEWriter core/ai 이식)**:
  - 3계열 어댑터 — OpenAI 호환(Ollama·LM Studio·API, fetch+SSE) / Anthropic API / CLI(claude -p,
    stdin·stream-json·유휴타임아웃·taskkill·PATH보강).
  - 에러 분류(PAUSE_KINDS: auth/rate/quota) + 취소(AbortController) + 연결확인.
  - SecretService(safeStorage로 API 키 암호화 — 프로젝트 폴더에 저장 안 함).
  - 스트리밍 IPC(ai:delta/done/error 이벤트) + AIService.
  - AI 패널: 프로바이더 설정+연결 점(헤더), 채팅(스트리밍), 컨텍스트 칩(현재 문서), 빠른 액션
    (이어쓰기/선택 퇴고), '본문에 넣기'로만 원고 반영(§7.4 직접수정 금지). editorBridge로 선택/삽입.
- **검증**: AI 어댑터 유닛+가짜서버 스트리밍 5/5, AI E2E(설정→연결→스트림→본문삽입) 4/4.
  전체 스위트 33개 통과(core 13 · ai 5 · editor/assets e2e 11 · ai e2e 4).

## 2026-07-10 — AI 컨텍스트 빌더(§7.2): "항상 원고를 봄"

- 기존엔 열린 문서 1개의 스냅샷만 봤음. 이제 매 요청마다 자동 조립:
  ① 시놉시스 체인(모든 원고 챕터 요약) ② 현재 장면(실시간 본문) ③ 등장 캐릭터·세계관 자동 감지
  (현재 장면에 이름이 나오는 시트를 통째로 포함). ProjectService.buildAiContext + TreeNode.synopsis.
- AI 패널: 무엇을 보는지 칩으로 표시(현재 장면/캐릭터/세계관/시놉시스) + 토큰 추정, 원고 편집 시 라이브 갱신.
- 검증: buildAiContext 유닛 2건(캐릭터 자동감지·시놉시스·미등장 제외), AI E2E에 컨텍스트 칩 확인 추가.
  전체 36개 통과(core 9 · library 6 · ai 5 · editor/assets e2e 11 · ai e2e 5).

## 2026-07-10 — 모델 드롭다운 + 세계관 카테고리 사용자화 + 아이콘 적용

- **AI 모델 드롭다운**: 어댑터 listModels()(OpenAI/Ollama /models, Anthropic /v1/models+폴백, CLI 별칭).
  ai:listModels IPC(초안 설정으로도 조회). AiPanel 모델 = 드롭다운 + ⟳불러오기 + 직접입력 전환.
- **세계관 카테고리 사용자화**: factions/locations/rules 기본 생성 제거 — world는 빈 폴더로 시작.
  바인더에 카테고리(폴더) 만들기 🗀 + 폴더 안 문서 추가(+). createFolder IPC. buildAiContext는
  타입기반→경로기반(characters/·world/) 감지로 바꿔 사용자 카테고리도 자동 인식. DocType 'world' 추가.
- **제공 아이콘 실사용**: icon.png → BrowserWindow 아이콘 + 책장 로고(❄ 이모지 대체) + electron-builder
  files 포함. 렌더러 assets 번들(vite-env.d.ts).
- 검증: 전체 통과 — core(world/createFolder 포함) · library 6 · ai 5 · editor e2e 11 · ai e2e 5.

## 2026-07-10 — 사용자 피드백 5건 수정

1. **CLI(-p) 404**: 원인 = 잘못된 모델 별칭 강제(haiku 등). claude 도움말 유효 별칭은 fable/opus/sonnet.
   CLI는 모델 미지정 시 로그인 계정 기본값 사용(작동 확인)으로 두고 강제 선택 제거. cwd=tmp. 404 안내 개선.
2. **마크다운 적용**: CM6 HighlightStyle(제목·굵게·기울임·인용·코드·링크) + ![[..]]/![](..) 인라인
   이미지 위젯(커서 위 소스 노출). markdownView.ts.
3+4. **바인더 삭제·이름변경**: 문서·카테고리(폴더) → trash 이동, 이름 변경(.md는 프론트매터 title 동기).
   최상위 섹션 보호. ProjectService trashEntry/renameEntry, 바인더 호버 ✎/🗑.
5. **이미지 드롭 → 편집기 삽입**: 에디터에 이미지 드롭 시 assets 반입 + 드롭 지점에 ![[경로]] 삽입 →
   인라인 렌더. (App 자료-반입 드롭과 분리)
- 검증 41개 통과: core 13 · library 6 · ai 5 · editor e2e 12(인라인 이미지 포함) · ai e2e 5.

## 2026-07-10 — 마크다운 라이브프리뷰 + 이미지 드롭 실수정(재보고)

- 지난 구현이 부족했음: (a) 기호가 그대로 노출(스타일만·숨김 없음), (b) 이미지 드롭 시 CM6가 먼저
  가로채 파일 경로를 텍스트로 삽입 → "주소만 들어옴".
- **라이브 프리뷰**: 커서 없는 줄의 마크다운 기호(#, **, `, ~~) 숨김 + atomicRanges. syntaxTree 기반.
- **드롭 실수정**: EditorView.domEventHandlers({drop})로 CM 레벨에서 가로채 반입+![[..]] 삽입(CM 기본 방지).
- **검증 강화**: E2E가 이미지 요소 존재가 아니라 실제 로드(naturalWidth>0) + 제목 기호(#) 숨김을 확인.
  전체 42개 통과: core 13 · library 6 · ai 5 · editor e2e 13 · ai e2e 5.

## 2026-07-10 — 인앱 이미지 드래그 드롭 처리(재보고)

- 사용자가 OS가 아니라 **앱 자료 갤러리/썸네일에서** 이미지를 드래그 → dataTransfer가 파일이 아니라
  ice-asset:// URL 텍스트라 CM이 URL을 그대로 삽입("주소로 들어감").
- CM 드롭 핸들러가 (1) OS 파일 (2) 인앱 ice-asset URL/커스텀타입 둘 다 처리 → ![[상대경로]] 삽입.
  갤러리 이미지는 dragstart에 application/x-ice-asset + text/plain=![[..]] 실어보냄.
- E2E: ice-asset URL 드롭을 합성 DragEvent로 재현 → 저장 파일에 URL 없고 ![[..]] 임베드로 들어가는지 확인.
  전체 43개 통과(editor e2e 14).

## 2026-07-10 — UI 줌 + 은은한 스크롤바

- **UI 줌**: webFrame 프레임 줌(본문 포함 전체 확대/축소). Ctrl+= / Ctrl+- / Ctrl+0 + Ctrl+휠.
  preload zoomBy/zoomReset(0.6~2.5 클램프), 줌 % 잠깐 표시(zoom-pill).
- **스크롤바**: 얇게(9px)·반투명 회색(라이트/다크 양쪽 은은)·호버 시 진하게, 트랙 투명.
- E2E: zoomBy/Reset 반환값 + Ctrl+= 표시 확인. editor e2e 15개.

### 메모

- 렌더러 번들 1.5MB 경고는 CodeMirror + React 정상 크기. 데스크톱 앱이라 무시.
- 다른 컴퓨터 이식성: 모든 내부 참조를 상대·POSIX로 강제(project.ts `toRel`/`toAbs`)하는 규율을
  M1부터 지킴 — 나중에 안 깨지게.

## 2026-07-11 — 호환성(마크다운 표준화) + AI 신뢰(투명성·별칭·자료 첨부)

사용자 피드백 3건("마크다운이 다른 데서 안 열림", "AI가 내 작품을 제대로 보는지 의문", "PDF·사진을
AI에게 읽히고 싶다")을 3단계 계획으로 처리. 전 단계 증거 기반 검증(유닛 40 · E2E 23 = **63개 통과**).

### Phase 1 — 마크다운 이미지 임베드 표준화(호환성)

- **원인**: 이미지 임베드를 옵시디언 방언 `![[루트경로]]`로, 그것도 루트 기준으로 기록 → VS Code·
  GitHub·Typora 등 표준 뷰어에서 안 열림. 문서가 `manuscript/` 안이라 경로 기준도 틀림.
- **해결**: 순수 경로 유틸 `shared/mdEmbed.ts`(node/electron 비의존) — 삽입은 표준 `![](문서기준
  상대경로)`(공백·괄호·# 만 %-인코딩, 한글·슬래시 보존), 렌더는 위키링크(레거시)·표준 둘 다 루트
  기준으로 정규화. Editor 드롭·AssetsPanel 드래그·markdownView 렌더 전부 전환.
- **일괄 변환 도구**: `ProjectService.convertLegacyEmbeds()` — 기존 `![[..]]`를 표준으로 일괄 변환
  (변환 전 원본을 `snapshots/embed-migration-<시각>/`에 백업). 자료 탭 ⇄ 버튼 + 확인 모달.

### Phase 2 — AI 투명성 + 마크다운 인지

- **"보낸 내용 보기"(🔍)**: 마지막 전송 프롬프트 전문(시스템·맥락·대화·첨부)을 그대로 모달로 표시.
  아직 안 보냈으면 다음 전송에 들어갈 맥락을 미리 보여줌 → "정말 내 작품을 보고 있나" 의문 해소.
- **컨텍스트 빌더 개선(§7.2)**: (a) 시놉시스 없는 챕터도 전체 흐름에 포함(`(줄거리 미작성)` 표기)해
  스켈레톤 완성, (b) 캐릭터 `aliases`(별칭·호칭) 프론트매터 신설 → "그/성만/애칭"도 자동 감지(인스펙터
  입력 필드), (c) 현재 장면 6000자 초과 시 잘림을 칩·본문에 명시.
- **마크다운 규약**: 시스템 프롬프트에 표준 문법 안내 + "![[..]] 쓰지 말 것" 추가.

### Phase 3 — 자료(PDF·이미지)를 AI에게 첨부(§7.5)

- **첨부 파이프라인**: `ChatMessage.attachments`(참조=경로만) → main이 생성 직전 데이터 채움
  (이미지=base64, PDF=`unpdf` 텍스트 추출[지연 로드·mtime 캐시·스캔본 폴백], txt/md=UTF-8). 큰
  데이터의 이중 IPC 전송 방지.
- **계열별 vision**: OpenAI 호환=`image_url`(data URL), Anthropic=`image`(base64) 블록, CLI=이미지
  미지원 안내 + 텍스트 첨부만 인라인. `ai/attachments.ts` 순수 변환 함수.
- **UI**: AI 패널 📎 자료 첨부(픽커 `attach` 모드=이미지·PDF) + 첨부 칩(상태·제거) + 보낸 내용에 첨부
  표시. 새 의존성 `unpdf` 1.6.2(externalize → 설치본 자동 포함).

### 검증(증거)

- `npm test` mdEmbed 7 · ProjectService 20 · Library 6 = 33, `npm run test:ai` 7(첨부 vision 포함).
- `npm run test:e2e` 15(표준 임베드 실제 로드·삽입), `npm run test:ai:e2e` 8(보낸 내용·첨부 전송).
- `npm run typecheck` 0 errors, `npm run build` 성공(main 55.63kB).

### 후속 — 자료 폴더 "자동 읽기"(사용자 피드백)

📎 수동 첨부만으론 부족 — "AI가 자료 폴더 안에 있는 걸 스스로 찾아서 읽어야 한다"는 지적.

- **자동 읽기(§7.5)**: `buildAiContext`에 `includeAssets`(기본 켜짐) 추가 — 매 요청마다 (a) 자료 폴더
  **목록**을 넣어 무엇이 있는지 알리고(찾기), (b) 문서(PDF·txt·md·csv 등)는 내용을 **예산 8000자
  한도**로 자동 추출·포함(읽기, 넘으면 잘라 표기). 이미지는 목록만(무거워서 실제로 보려면 📎 vision).
- **UI**: AI 패널 "📂 자료 읽는 중" 토글 + `ctx-asset` 칩(읽는 문서 표시). 시스템 프롬프트에 "자료
  폴더 내용을 근거로 활용" 지시.
- **자료 범위 확장**: 텍스트 문서(txt·md·csv·json·log)도 자료 갤러리·픽커·반입 대화상자에 노출
  (`assetKind`에 `DOC_EXT` 추가). 전엔 이미지·PDF만 보였음.
- 검증: `buildAiContext` 자동 읽기 유닛 추가(ProjectService 21), 전체 유닛 41 + E2E 23 통과.

### 후속2 — UI 버그·마크다운 표시·라이트 모드(사용자 피드백)

- **드롭 오버레이 눌어붙음 버그**: "여기에 놓아 자료로 반입"이 창을 덮고 안 사라짐. 원인 = (a) 앱 내부
  드래그에도 오버레이가 뜸, (b) 드롭이 편집기에 먹히면 리셋 누락. 해결 = **OS 파일 드래그만** 오버레이
  표시(`types.includes('Files')`) + 드래그 깊이 카운터 + 창 전역 캡처 리셋(`drop`/`dragend`). 편집기
  드롭은 `stopPropagation`으로 중복 반입 차단, 인라인 이미지 `draggable=false`. E2E 회귀 추가.
- **마크다운 표시**: (a) 구분선 `---`이 실제 가로선으로 렌더 안 됨 → `HorizontalRule` 위젯 추가,
  (b) 색이 앱 크롬용(`--accent-hi`/`--muted`)이라 종이 배경에서 안 보임 → **종이색 기준 `--md-*`**
  (링크·인용·코드)로 교체 + 인라인 코드 배경 상자. E2E에 구분선 렌더 확인.
- **통합 라이트/다크 모드**: 두 겹 설계(도구창 고정)가 혼란 → 사용자가 "앱 전체 라이트/다크" 선택.
  `settings.appMode`(`html[data-app-mode]`) 신설, **다크 규칙은 그대로 두고 라이트 오버라이드만** 추가
  (팔레트 + 하드코딩 표면·글자·컨텍스트 칩색). 보기 탭 상단 ☀라이트/☾다크 토글. 원고 종이 테마는 별개.
  집필 테마 라벨도 "원고 종이 배경(도구창은 항상 어두운 톤)"으로 명확화 → 라이트 모드로 해소.
- 검증: 편집기 E2E 18(앱모드·구분선·드롭오버레이 포함), AI E2E 8, 유닛 41. 타입 0, 빌드 성공.

## 2026-07-12 — codex CLI · 앱 내 PDF 뷰어 · 집중 모드(패널 접기)

- **codex(GPT) CLI 연결**: CLI 어댑터를 flavor(claude/codex/generic)로 일반화(`CliAI`). codex는
  `codex exec --json --color never -o <파일> -m <모델> -`(프롬프트 stdin) — 진행은 JSONL 스트리밍
  best-effort, **최종 메시지는 `-o` 파일이 정본**(스키마 버전차 방어). 로그인 안내(codex login).
  AI 설정 프로바이더 = "CLI 에이전트 (claude · codex)". **CLI 선택·모델 모두 드롭다운** — CLI는
  claude/codex 드롭다운, 모델은 claude=별칭·codex=`~/.codex/models_cache.json`에서 자동 로드
  (gpt-5.6-sol 등). CLI 변경 시 모델 목록 자동 갱신, 목록에 없는 값은 기본으로 리셋.
- **앱 내 PDF 보기**: `ice-asset` 프로토콜이 .pdf에 `content-type: application/pdf` 강제(다운로드
  방지) → 라이트박스에서 Chromium 내장 뷰어를 `<iframe>`로 렌더. '시스템 뷰어로 열기' 폴백 유지.
- **집중 모드(패널 접기)**: `settings.binderOpen/rightOpen`(persist). 상단바 ◧/◨ 개별 토글 +
  "⛶ 집중"(양쪽 접기) + **Ctrl+\\** 단축키. 접으면 원고(에디터)만 전체 폭.
- 검증: AI 유닛 8(CLI flavor 감지 추가), 편집기 E2E 22(집중 모드·PDF 뷰어 창 추가), AI E2E 8,
  mdEmbed 7 · ProjectService 21 · Library 6. 타입 0, 빌드 성공.
- **PDF 뷰어**: 커스텀 스킴 `<iframe>`은 Chromium PDF 뷰어가 안 잡혀 실패 → `pdf:open` IPC로 **별도
  BrowserWindow(`file://`) 네이티브 뷰어**로 전환. 자료 갤러리 PDF 클릭 시 바로 열림. `ice-asset`은
  .pdf에 content-type 부여(부수적).

### 후속 — 바탕화면 바로가기 선택 · macOS 준비 · git 초기화

- **설치 시 바탕화면 바로가기 물어보기**: `build/installer.nsh`(자동 포함)에 nsDialogs 체크박스 페이지
  추가(설치 폴더 선택 뒤). `nsis.createDesktopShortcut: false`로 자동생성 끄고 사용자 선택으로 생성,
  제거 시 정리.
- **macOS 이식 준비**: electron-builder `mac.identity: null`(무서명, 윈도우 방침과 동일) +
  `dist:mac` 스크립트. 코드는 이미 크로스플랫폼(POSIX 경로·platform 분기·mac 앱 수명주기·CLI PATH
  보강). Mac에서 `npm run dist:mac`로 dmg 생성(아이콘 512² → icns 자동).
- **git**: 저장소 초기화 + GitHub(icenovel-rgb/ICEFiction, private) 첫 푸시. release/·node_modules
  등은 .gitignore 제외, `.env` 추가(시크릿 안전). 버전 0.4.0.

### 다음(미착수)

- codex 이미지 첨부(`codex exec -i <file>`로 실제 vision) — 지금은 텍스트 첨부만.
- PDF 뷰어가 커스텀 스킴에서 렌더 안 되는 환경 대비(사용자 실기 확인 필요).
- 자료 자동 읽기 심화 옵션: 관련도 기반 선별(현재는 최근순 예산), 폴더별 on/off, 임베드된 자료 우선.
- 윈도우 코드 서명: 지금은 무서명 유지(본인 사용). 외부 배포 시 Certum 개인 인증서 or MS Store.
- 스캔본 PDF OCR, 위키링크 `[[문서]]` + 백링크, FTS 검색(M2 잔여), 스냅샷/diff(M5).

## 2026-07-12 — 표지 CRUD · 책장 정렬/검색 · 문단 정렬 · 인용문 수정 · 글꼴 내장

사용자 요청 6건을 한 번에 처리(설계 승인 후 구현).

- **작품 표지 CRUD**: 책 폴더 루트에 `cover.<ext>` + 매니페스트 `cover` 필드(폴더와 함께 이동 = 이식성).
  서재 화면은 열린 책이 없어 `ice-asset://`로 못 띄우므로 **새 특권 스킴 `ice-cover://book/<id>?v=<mtime>`**
  신설(캐시버스트) — `libraryService.coverAbsPath(id)`로 서재에서 표지 파일 스트림. IPC
  `library:setCover`(이미지 대화상자 → 복사·이전 표지 정리)·`library:removeCover`. 카드 hover 도구에
  표지 지정/변경·제거. **CSP `img-src`에 `ice-cover:` 추가**(안 하면 표지 로드 차단 — 실측 후 수정).
- **책장 순서 드래그 재정렬 + 검색/정렬**: 매니페스트 `order` 필드 + `library:reorder`(id 순서대로
  order 재부여, 재스캔에도 영속). `scan()` 정렬 = order → 최근순. 렌더러: HTML5 DnD(수동 정렬 모드+검색
  없음일 때만), 제목 검색창, 정렬 드롭다운(수동/제목/최근/오래된). "날짜 검색"은 최근·오래된 정렬로 갈음.
- **문단 정렬(보기 탭)**: `settings.textAlign`(좌/가운데/우/양쪽) → CSS 변수 `--paper-align` →
  에디터 `.cm-content`. **기본 양쪽(justify)**. ViewSettings에 4버튼 세그먼트.
- **마크다운 인용문 수정**: 원인 = `>`(QuoteMark)가 기호 숨김 대상이 아니고 인용 블록 시각도 없어
  회색 이탤릭만 됐음. 수정 = QuoteMark를 숨김 세트에 추가(커서 없는 줄에서 `>`+공백 숨김) +
  `Blockquote` 줄에 `Decoration.line('cm-blockquote')`(좌측 바+들여쓰기, `.cm-line.cm-blockquote`
  특이도로 `padding:0` 극복). 데코 조립을 `Decoration.set(ranges, true)`로 바꿔 라인/인라인 side 정렬 위임.
- **글꼴 내장(4종×Regular/Bold, ~12MB)**: 나눔명조·나눔고딕(OFL, google/fonts TTF→fonttools woff2 변환),
  KoPubWorld 바탕·돋움(KoPub 라이선스, adrinerDP 배포 woff2). `assets/fonts/*.woff2` + `styles/fonts.css`
  `@font-face`(swap). FONTS 목록에 내장 4종(✓) 노출. Vite가 `out/renderer/assets/`로 번들, `font-src 'self'`.
  라이선스는 `assets/fonts/LICENSES.md`·`KoPubWorld-LICENSE.md` 동봉.
- **표지 라운드 제거**: `.book-card` `border-radius: 0`(각진 표지).

### 검증 (증거 기반)

- 타입 0. 유닛 **mdEmbed 7 · ProjectService 21 · Library 9**(표지 지정/제거·재정렬 영속 추가).
- 편집기 E2E **24**(인용문 블록·> 숨김 + 문단 정렬 기본 양쪽·전환 추가).
- 책장 E2E **5**(신규 `test:lib:e2e`) — 표지 `ice-cover://` 실제 이미지 로드·기본 표지·검색·재정렬 영속.
- 내장 글꼴 4종 × Regular/Bold **8개 모두 런타임 로드 확인**(`document.fonts.load`). 빌드 성공(폰트 번들 확인).

## 2026-07-12 (2) — 선택 문단 정렬 · 탭 들여쓰기 · 인용문 가독성 · 기본 글꼴 · 섹션 갤러리

사용자 요청 5건. 이번엔 **원고 파일에 무엇을 기록할지**가 걸린 결정 2개를 먼저 확정하고 시작했다.

- **선택한 부분만 정렬**: 마크다운엔 정렬 문법이 없다 → **표준 HTML 블록**으로 감싼다.
  `<div align="center">` + 빈 줄 + 본문 + 빈 줄 + `</div>` (빈 줄이 있어야 안쪽이 마크다운으로 파싱된다 —
  CommonMark). 깃허브·옵시디언·VS Code에서도 그대로 정렬돼 보인다(이식성 §6.11). 순수 로직은
  `src/shared/align.ts`(단위 테스트 13건), 명령은 `lib/editorCommands.ts`. 보기 탭의 "선택한 부분만 정렬"
  버튼 + **Ctrl+Shift+{L,E,R,J}**, 해제는 Ctrl+Shift+0. **커서만 찍어도 그 문단 전체**가, 문단 일부만
  드래그해도 문단 경계까지 넓혀서 감싼다.
- **탭 들여쓰기**: Tab = **전각 공백(U+3000) 1칸**, Shift+Tab = 제거. 탭문자·4칸 공백은 마크다운이
  **코드블록으로 오인**하므로 절대 못 쓴다. 전각 공백은 한국 소설 원고의 표준 들여쓰기이기도 하다.
- **인용문 가독성**: `--md-muted`(55%)를 쓰던 인용 글자가 종이 위에서 너무 흐렸다(사용자 지적).
  `--md-quote`(92%) 신설 — 좌측 바가 이미 "인용"을 알리므로 글자는 본문만큼 진하게. 바 대비도 45%로.
- **기본 글꼴 = 내장 나눔고딕**: persist `version: 1` + migrate — 옛 기본값(myeongjo)을 쓰던 사용자만
  옮기고, 직접 다른 글꼴을 고른 사람은 건드리지 않는다.
- **섹션 갤러리(§6.2)**: 바인더의 섹션 이름(원고/캐릭터/세계관/노트)을 누르면 그 안 문서가 **카드로 죽
  펼쳐진다**. 캐릭터는 첨부한 얼굴 이미지가 표지, 카드를 누르면 그 문서가 열린다. 상태 배지·시놉시스·
  제목/줄거리 검색·하위 폴더 이동. `TreeNode.image`(프론트매터 images 첫 장) 추가. 책을 열면 원고
  갤러리부터 보여 빈 에디터 대신 챕터가 한눈에 들어온다. 에디터(CM6 호스트)는 항상 마운트한 채
  **오버레이**로 덮는다(언마운트하면 뷰가 다시 안 만들어짐 — 기존 주석의 함정).

### 실측으로 잡은 버그 2건 (컴파일·타입은 멀쩡했다)

1. **ViewPlugin은 block 데코를 제공할 수 없다.** 정렬 태그 줄을 `Decoration.replace({block:true})`로
   감췄더니 **데코 세트 전체가 무효화**돼 정렬 클래스까지 통째로 사라졌다(CM6 제약: 세로 레이아웃에
   영향을 주는 데코는 플러그인 금지). → 정렬 데코만 **StateField**(`alignField`)로 분리해 제공.
2. **감춤 범위가 다음 줄 시작까지 물면 그 줄의 라인 데코가 먹힌다.** 여는 태그~첫 내용 줄 직전을 한 번에
   감췄더니 **문단의 첫 줄만 정렬이 안 붙었다**(둘째 줄부터는 정상). → 감춤 범위를 **태그 줄 안에서 끝내도록**
   수정. E2E도 한 줄짜리 문단으론 못 잡던 버그라 **두 줄 문단**으로 회귀 테스트를 바꿨다.

### 실측으로 잡은 버그 3건째 — 인용문에서 빠져나올 수 없다 (v0.6.0 빌드 검증 중 발견)

패키지된 앱을 띄워 **저장된 원본 파일**을 확인하다 발견. 화면은 `>`를 숨기니 눈으로는 안 보이고,
파일을 열어야만 드러나는 종류다.

```
> 인용문입니다
>
> 다시 본문        ← 인용문 밖으로 못 나감 → 이후 본문이 통째로 인용에 갇힌다
```

- 원인: `@codemirror/lang-markdown`이 자기 키맵을 **`Prec.high`** 로 넣어 Enter를 선점하고
  (`insertNewlineContinueMarkup`), 그 구현은 **빈 인용 줄이 두 번 연속돼야만** 탈출한다(소스 확인) →
  사용자는 Enter를 **세 번** 눌러야 나온다. 기본 우선순위로는 우리 Enter 바인딩이 아예 실행되지 않았다.
- 수정: `exitQuoteOnEmptyLine` — 빈 인용 줄에서 Enter 한 번이면 마커를 지우고 **줄바꿈을 남겨** 인용과
  다음 문단 사이에 빈 줄을 확보한다(빈 줄이 없으면 마크다운 lazy continuation으로 다시 빨려 들어간다).
  집필 키맵 전체를 **`Prec.highest`** 로 올렸다.
- 인용문이 이번 릴리스에서 처음 제대로 렌더되기 시작했으므로 바로 부딪혔을 문제다.

### 검증 (증거 기반)

- 타입 0. 유닛 **50** (mdEmbed 7 · **정렬 13(신규)** · ProjectService 21 · Library 9).
- 편집기 E2E **32** (기본글꼴=나눔고딕 실제 로드 · **인용문 탈출(저장 원본으로 검증)** · 탭 전각공백
  삽입/제거+파일 기록 · 선택 문단 정렬 `<div align>` 기록 + **문단의 모든 줄** 가운데 + 태그 화면 숨김 ·
  섹션 갤러리 카드/표지/열기).
- 책장 E2E **5**. **패키지 스모크**(release/win-unpacked 실행파일 = 설치파일과 동일 산출물)에서 신규 기능
  전부 재확인 — 개발 빌드만 통과하고 패키지에서 깨지는 경우를 막는다.
- 설치파일 `release/ICEFiction-Setup-0.6.0.exe` (110MB).
