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

## 2026-07-13 — AI 이미지 생성(캐릭터 얼굴 · 책 표지) §7.6

로컬 CLI 에이전트에게 그림을 시킨다. **텍스트 AI와 완전히 별개 설정** — 텍스트는 Ollama·Claude API를
쓰면서 그림은 CLI를 쓸 수 있어야 한다.

- **엔진**(전부 실측 확인): **agy 기본** → codex → gemini 순 폴백. 사용자가 codex 사용량 병목을 겪어
  agy를 우선한다. 성패는 종료코드가 아니라 **결과 파일이 실제로 생겼는지**로 판정한다(에이전트는
  실패해도 0으로 끝나며 변명을 늘어놓는다).
  - agy: `agy -p <한 줄> --add-dir <출력폴더> --dangerously-skip-permissions`
  - codex: `codex exec -s workspace-write --add-dir <폴더> --model gpt-5.5 -` (프롬프트 stdin)
    ⚠️ `*-codex` 모델은 이미지 툴 미지원 → 일반 모델 고정.
- **캐릭터·문서 이미지**: 인스펙터 "🎨 AI로 이미지 생성" → 시트(이름·시놉시스·본문)에서 프롬프트 초안 →
  사용자가 수정 → `assets/images/<이름>.png` 저장 + 프론트매터 `images` 첨부 → **섹션 갤러리 표지가 된다.**
- **책 표지**: 책장 카드 "🎨" → **AI는 글자 없는 그림만 그리고, 제목은 앱이 내장 글꼴로 얹는다.**
  원본 아트(`cover-art.png`)를 보관하므로 **재생성 없이 제목만 다시 조판**할 수 있다. 합성은 렌더러
  캔버스 → `toDataURL` → `cover.png`.
- **스타일 바이블**: 매니페스트 `imageStyle` — 이 책의 모든 그림이 같은 화풍이 된다(장편에서 필수).
- 공용 `ai/proc.ts`로 CLI 스폰(워치독·취소·트리종료)을 텍스트 AI와 공유(중복 제거, 텍스트 AI 8건 무회귀).

### 표지에서 실측으로 알아낸 두 규칙 (프롬프트가 이 모양인 이유)

1. **프롬프트에 "book cover"·"title"을 긍정 서술로 쓰면 모델이 가짜 글자를 그린다.** "NO text"라고
   못박아도 `A NETVEL GON` 같은 엉터리 영문 제목을 렌더했다. **"세로 일러스트"로 표현**하고 강한
   no-writing 제약을 걸면 글자가 완전히 사라진다. (`"NOT a poster"`처럼 **부정**으로 쓰는 건 안전 —
   성공한 프롬프트에 들어 있었다.)
2. **제목은 앱이 얹는다** — 모델의 글자 렌더 능력과 **무관한 이유**로. 그림에 구워진 제목은
   글꼴·크기·위치를 못 고치고, 한 글자만 바꿔도 **그림을 통째로 다시 그려야 한다**(한 장 1분 이상).
   그림과 활자를 분리하면 재생성 없이 즉시 재조판되고, 1번의 엉터리 글자 위험도 원천 차단된다.
   그래서 그림은 **상단 1/3을 비운 구도**로 생성한다.
   ⚠️ 초판 기록에 "모델은 한글을 못 쓴다"고 적었으나 **검증하지 않은 단정이었다**(2026-07-13 정정).
   실제로 관찰한 건 "표지라고 말하면 엉터리 글자를 그린다"뿐이다. 설계 결론은 그대로 유효하다.

두 규칙은 `src/shared/imagePrompt.ts`(순수 함수)에 못박고 **유닛 테스트 7건**으로 지킨다
(`positiveForbiddenWord` 가드 포함). 프롬프트를 누가 손봐도 가짜 글자 회귀가 막힌다.

### 실측으로 잡은 버그 4건 (타입·빌드는 전부 통과했다)

1. **캔버스 오염(tainted)** — 표지 아트를 `<canvas>`에 그려 `toDataURL()`로 내보내는데, `ice-cover`가
   다른 오리진이라 캔버스가 오염돼 저장이 통째로 막힌다. → 프로토콜에 **`corsEnabled: true`** +
   응답에 `Access-Control-Allow-Origin` + `img.crossOrigin='anonymous'`.
2. **CORS를 켰더니 이미지 로드가 아예 깨짐** — 커스텀 스킴은 기본적으로 CORS 대상 스킴이 아니라
   `crossOrigin`을 붙이는 순간 `Cross origin requests are only supported for protocol schemes: http,
   https, data…`로 실패한다. `corsEnabled` 권한이 **없으면** 헤더만 줘도 소용없다(위 1과 한 쌍).
3. **모달 상태 재사용** — 캐릭터로 한 번 쓰고 표지로 다시 열면 **직전 artUrl이 남아** ice-asset 이미지에
   표지용 `crossOrigin`이 걸려 CORS로 깨졌다. → 스튜디오를 **대상별 key로 리마운트**.
4. **매니페스트 쓰기 경합(EPERM)** — "그리기"를 누르면 *스타일 저장*과 *표지 아트 기록*이 동시에 같은
   `icefiction.json`을 원자적 rename하려다 Windows에서 `EPERM`으로 터졌다(조용한 데이터 유실도 가능).
   → `patchManifest`를 **책 폴더별 큐로 직렬화**. E2E 3회 반복으로 확인.

### 검증 (증거 기반)

- 타입 0. 유닛 **57** (mdEmbed 7 · 정렬 13 · **이미지 프롬프트 7(신규)** · Project 21 · Library 9) +
  AI 어댑터 8(리팩터링 무회귀).
- **이미지 E2E 8건(신규 `test:image:e2e`)** — 엔진만 `ICEFICTION_IMAGE_STUB`으로 갈음하고 **배선은 전부
  진짜로** 돌린다: IPC → 저장 → 프론트매터 첨부 → 갤러리 표지 → 표지 아트 → **캔버스 오염 검사** →
  제목 합성 → `cover.png` 저장 → 책장 렌더. 실제 그림을 매번 뽑으면 몇 분·사용량이 든다.
- **실기 확인**: 앱에서 agy로 표지 생성 **77초**, 나눔명조 한글 제목 합성까지 정상.

## 2026-07-16 — macOS 마감: 네이티브 메뉴 · dmg CI (v0.7.1)

코드는 이미 크로스플랫폼(경로·수명주기·CLI PATH 보강)이라 확인만 하면 되는 줄 알았으나, Mac에서만
드러나는 두 구멍을 실제로 메웠다.

- **네이티브 앱 메뉴**(`src/main/menu.ts`, darwin 전용): 메뉴를 안 주면 Electron이 개발자용 기본
  메뉴를 그대로 노출한다 — 완성된 Mac 앱답지 않다. App·편집(한글 IME 실행취소/다시실행)·보기·창·
  도움말을 합성 role로 구성. **Windows/Linux는 손대지 않는다**(이 함수는 darwin이 아니면 즉시 반환).
  - **이중 줌 버그 차단**: 기본 메뉴 View의 줌 role(Cmd+= · Cmd+- · Cmd+0)이 렌더러의 자체 줌
    (`window.api.zoomBy`)과 **둘 다 발동**해 한 번에 20%씩 튀었다. 커스텀 메뉴에서 줌 role을 빼
    렌더러만 줌을 다루게 했다. 보기 메뉴에는 전체화면(Ctrl+Cmd+F)만 남긴다(충돌 없음).
- **dmg CI**(`.github/workflows/build-mac.yml`): mac 타깃(dmg·hdiutil·icns)은 macOS 전용이라
  Windows에서 못 만든다. GitHub **macOS 러너**에서 `npm ci → typecheck → test → electron-builder
  --mac`을 arm64·x64 매트릭스로 돌려 **물리 Mac 없이도** 무서명 dmg를 아티팩트로 뽑는다.
  `v*` 태그 push 또는 Actions 수동 실행. `CSC_IDENTITY_AUTO_DISCOVERY=false`로 서명 시도 차단.

### 검증 (증거 기반)

- 타입 **0**. 유닛 **57 전부 통과**(mdEmbed 7 · 정렬 13 · 이미지 프롬프트 7 · Project 21 · Library 9).
- `npm run build` 성공 — 메뉴 추가로 main 번들 80.85kB → 81.93kB, 폰트 8개 정상 번들.
- ⚠️ dmg 실빌드는 macOS 러너/본체 몫(이 저장소 CI에서 확인) — 리눅스 개발 환경에서는 mac 타깃을
  만들 수 없다. 코드·설정·파이프라인까지 완료했고, dmg 산출은 Actions 실행으로 검증한다.

## 2026-07-16 (추가) — mac 서명·공증 조건부 배선

애플 개발자 계정 보유 확정 → 배포용 서명·공증을 **미리 배선**한다. 핵심 방침: **최초 1회 인증서
준비 뒤엔 버전업마다 절차를 다시 밟지 않는다** — Secrets가 그대로 재사용돼 태그만 밀면 자동 서명·공증.

- `build/entitlements.mac.plist`(신규): Hardened Runtime 권한(JIT·unsigned-exec-memory 등) — 공증 전제.
  Electron V8 JIT 때문에 이 권한이 없으면 서명·공증한 앱이 실행 즉시 죽는다. 무서명 빌드엔 미사용.
- `electron-builder.yml`: `identity: null` 제거 → **조건부 서명**(인증서 있으면 서명, 없으면 자동 생략).
  `hardenedRuntime`·`entitlements`·`gatekeeperAssess:false` 추가. 공증은 yml에서 켜지 않고
  릴리스 경로의 `-c.mac.notarize=true`로만 켠다(자격증명 없이 무조건 공증하면 실패하므로).
- `package.json`: `dist:mac:release`(신규) = 서명+공증. 기존 `dist:mac`은 서명만/무서명(공증 없음).
- `.github/workflows/build-mac.yml`: **조건부** — PR·검증은 항상 무서명, 태그/수동 실행은 Secrets
  (`MAC_CSC_LINK` 등)가 있으면 서명+공증. API 키(.p8)는 base64 Secret에서 러너 임시경로로 복원.
- `.gitignore`: `*.p12 *.p8 *.cer` 등 서명 비밀 커밋 차단.
- `docs/BUILD-MAC.md` §8 신설: 최초 1회 준비(인증서·API 키·Secrets) → 이후 버전업은 태그만.

### 검증

- 타입 **0**, 유닛 **57 전부 통과**, `npm run build` 성공(코드 변경 없음 — 빌드 설정·CI·문서만).
- ⚠️ 서명·공증 실빌드는 인증서가 든 macOS 러너/본체 몫 — 이 환경에선 불가. 배선·설정·문서까지 완료.

## 2026-07-17 — 찾기·바꾸기 + 책 전체 검색 (v0.8.0, §6.9)

MVP 이후 첫 M2 잔여 해소. 지금까지 에디터에 Ctrl+F조차 없었다(@codemirror/search 미장착).
계획은 `prompt_plan.md`(설계 결정 D1·D2 포함) — /plan으로 확정 후 진행.

- **에디터 찾기·바꾸기(Ctrl+F)**: `@codemirror/search` 장착 + `EditorState.phrases`로 패널 전체
  한국어화(15개 phrase 키 — 누락 시 영어 잔존) + `global.css`에서 앱 크롬 토큰으로 스타일링
  (CM 주입 baseTheme보다 특이도를 높여야 함 → `.editor-wrap` 접두). 매치 하이라이트는 세 종이
  테마(세피아/다크/화이트) 모두에서 보이는 반투명 호박색.
  - ⚠️ **키 충돌(실측)**: searchKeymap의 `Mod-Shift-l`(selectSelectionMatches)이 정렬 단축키
    Ctrl+Shift+L과 겹침 → 그 바인딩만 걸러서 장착. E2E로 정렬 무회귀 확인.
- **책 전체 검색(Ctrl+Shift+F)**: 오른쪽 패널 '검색' 탭. `ProjectService.searchAll` —
  4개 섹션 .md를 **매번 스캔**(FTS5 인덱스 안 씀 — 결정 D1, BLUEPRINT §5). 제목+본문 부분일치
  (프론트매터 제외), 상한 파일당 50·전체 500, 이스케이프한 정규식으로 탐색(toLowerCase 비교는
  일부 유니코드에서 길이가 변해 오프셋이 어긋날 수 있다 — 오프셋은 에디터 selection에 직결).
- **점프의 타이밍 규칙**: 결과 클릭 → `store.jumpTo` — 문서 본문이 store에 실린 **뒤에만**
  `pendingJump`를 세우고, Editor는 본문 교체 effect **다음에 선언된** effect에서 소비한다
  (React는 같은 커밋에서 선언 순서대로 effect 실행). 먼저 세우면 옛 문서에 선택이 찍힌다.
  범위는 문서 길이로 클램프(검색 후 파일이 바뀌었을 수 있음).
- **전체 바꾸기는 뺐다(결정 D2)**: 스냅샷/diff(M5) 전에 다중 파일 일괄 치환을 넣으면 실수 한 번이
  원고 전체를 조용히 훼손한다. 바꾸기는 현재 문서 안(Ctrl+F)에서만.

### E2E에서 실측으로 알아낸 것 1건

- **CM 검색 패널 입력은 keyup/change로만 커밋된다.** Playwright `fill()`은 키 이벤트를 안 내고,
  **한글은 `keyboard.type()`도 insertText 경로라 키 이벤트가 없다** → 테스트에서 타이핑 뒤
  무해한 키(End)를 눌러 keyup을 일으켜야 검색어가 커밋된다.

### 검증 (증거 기반)

- 타입 0. 유닛 **67** (mdEmbed 7 · 정렬 13 · 이미지 프롬프트 7 · Project 21 · Library 9 ·
  **searchAll 10(신규)** — 오프셋=body.slice 재검증·프론트매터 제외·숨김 파일 제외·정규식 리터럴·
  상한·대소문자) + AI 어댑터 8.
- **검색 E2E 9건(신규 `test:search:e2e`)** — 한국어 패널·매치 하이라이트·모두 바꾸기→저장 파일
  반영·Esc·**Ctrl+Shift+L 정렬 무회귀**·전체 검색 2문서 3건·결과 클릭→다른 섹션 문서 열림+선택.
  `ICEFICTION_E2E_EXE`로 패키지 실행파일 스모크 지원.
- 기존 E2E 전부 무회귀: 에디터 32 · 책장 5 · 이미지 8 · AI 8 (AI E2E 1회 타임아웃은 연속 실행
  플레이크 — 재실행 통과).
- **패키지 스모크**: `release/win-unpacked` 실행파일로 검색 E2E 9건 재통과.
- 설치파일 `release/ICEFiction-Setup-0.8.0.exe` (115MB).

## 2026-07-26 — AI가 폴더를 본다: 문체 방·전체 목차·열람 프로토콜·슬래시 명령·삽화 비율

"AI가 폴더 안을 제대로 못 본다"에서 출발. 원인은 하나가 아니라 다섯이었고, 다섯 다 고쳤다.

### 왜 못 봤나 (착수 전 진단)

`buildAiContext`가 추린 4덩이(챕터 줄거리 · 현재 장면 6,000자 · 이름이 언급된 인물 시트 ·
`assets/` 목록+문서 8,000자)만 텍스트로 갔다. `notes/` 전체, 다른 챕터 본문, 이름이 안 나온
시트, hwp/docx, 이미지 내용이 통째로 빠졌다. CLI 모드는 `cwd=tmp`라 스스로 읽을 수도 없었다.

### 1. 문체 방 `style/` — 하네스 (§7.2a)

- 새 섹션 `style/`(지침 + `samples/`). `SECTIONS`에 추가 → 바인더 **문체** 자동 노출.
  `ensureStyleRoom()`을 `create()`·`open()` 양쪽에서 불러 **옛 책도 열면 생긴다**.
- 지침은 맥락 **맨 앞**(①보다 먼저) + 요청문 **끝**에 재확인 한 줄(샌드위치). 긴 맥락에서
  모델이 앞부분을 흘리는 것을 실무적으로 막는 방법.
- 씨앗의 `<!-- 안내 -->`와 `예)` 줄은 걸러서 보낸다 — **안 고친 예시가 진짜 규칙처럼 굳는 사고**를
  원천 차단(테스트로 고정).
- `samples/`에서 지침 초안을 뽑는 **문체 분석** 버튼. 이때는 맥락을 일부러 안 싣는다(옛 지침을
  베껴 오기 때문). 저장은 확인 다이얼로그 후 `style/문체지침.md`.

### 2. 전체 목차 + 열람 프로토콜 (§7.5)

- 맥락 끝에 **폴더 안 모든 파일의 경로**(✓ = 이미 실린 것). 앱이 못 읽는 .hwp/.docx도 목록엔 넣는다
  — 목록에 없으면 AI에겐 없는 파일이다.
- AI가 `[[열람: 경로]]`를 내면 앱이 읽어 `[열람 결과]`로 붙여 **자동 재요청**(최대 3왕복).
  파서는 shared에 둬 main(읽는 쪽)과 렌더러(뽑는 쪽)가 같은 상한(5개)을 본다.
- 못 읽는 형식·없는 파일은 조용히 빼지 않고 사실대로 돌려준다.
- CLI 모드는 `--add-dir <원고폴더>`로 **진짜 폴더 접근**까지(읽기 전용). `spawnCli`에 cwd 옵션 추가.

### 3. 이미지 읽기

- 열람 요청이 이미지면 vision 첨부로 간다(base64는 생성 직전 main이 채움 — 이중 IPC 회피).
- CLI 계열은 base64 대신 **절대경로**를 넘겨 "직접 열어 보라"고 한다(`AIAttachment.absPath`).
  CLI에 base64를 만들지도 않는다(수 MB 낭비 제거).

### 4. 삽화 비율 7종 + 자동 크롭 (§7.6)

- `ImageSize`(3종 고정) → `AspectRatio` 7종 + `ASPECTS` 표(요청 크기 / 최종 크기 분리).
- 엔진이 못 맞추면 Electron `nativeImage`로 **중앙 크롭**(새 의존성 0). 오차 2%는 그대로 둔다.
- `/삽화`용 `ImageTarget.inline` 추가 — `assets/images/<문서>-N.png`로 저장 후 커서 자리에
  표준 `![](상대경로)` 삽입.

### 5. 본문 슬래시 명령 + 고스트 텍스트 (§6.1a·§6.1b)

- `/이어쓰기 /다듬기 /묘사 /대사 /줄거리 /삽화`. 결과는 채팅이 아니라 커서 자리로.
- 고스트 = 위젯 데코레이션 1개. **문서를 건드리지 않는다.** `Tab` 채택 / `Esc` 버리기,
  제안이 없으면 `false`를 돌려 기존 Tab(전각 들여쓰기)으로 넘어간다.
- `/`를 치는 순간 선택이 지워지므로, 갈아끼우는 명령의 대상은 **커서가 놓인 문단**으로 잡는다
  (선택 필요 조건은 애초에 성립하지 않는다 — 설계 중 실측으로 발견).

### 검증 (증거 기반)

- 타입 0 errors · 빌드 성공.
- 유닛 **103** — 기존 67 + 비율/크롭 7 + 문체 방 7 + 열람 파서 8 + 목차·열람 7 + 슬래시 7
  (+ ProjectService에 목차 검증 2건 추가).
- E2E: 에디터 32(무회귀 — Tab 들여쓰기 살아 있음) · 이미지 **9**(본문 삽화 + 16:9 크롭
  1024x1536 → 1024x576 실측) · AI 8 · **AI 폴더·문체·슬래시 7(신규)** —
  문체 지침이 프롬프트 맨 앞인지 오프셋으로 확인, 열람 왕복 2회 요청 본문 검사,
  `/` 메뉴 → 고스트가 원고에 없음 → `Tab` 확정 → `Esc` 폐기까지.

### 실측으로 알아낸 것

- **고스트 위젯은 `.cm-content` 안에 그려진다** — E2E에서 `textContent`로 원고를 읽으면 제안이
  섞여 들어온다. `.cm-ghost`를 걷어내고 비교해야 "원고에 안 들어갔음"을 검증할 수 있다.
- 바인더 섹션 이름은 `.binder-section-label`(폴더 행 `.binder-dir`와 다름).

## 2026-07-26(2차) — 슬래시 메뉴 다듬기 + "Tab 확정 · Esc 취소"를 눈에 보이게 (§6.1a·§6.1b)

기능은 있는데 **규칙이 어디에도 안 적혀 있었다.** 흐린 글씨가 왜 떴는지, 무엇을 눌러야 원고에
들어가는지 화면이 말해 주지 않으면 그 기능은 아는 사람만 쓰는 기능이다. 같은 약속을 세 겹으로 적었다.

### 1. 슬래시 메뉴 — 고르기 전에 결과를 알려 준다

- 줄 생김새를 `[아이콘] [이름] [설명] [꼬리표]`로. 꼬리표 = 결과가 가는 곳
  (`Tab 확정` / `문서 정보로` / `그림 창 열기`). `SlashCommand.icon`·`outcome` 신설(순수 데이터라
  단위 테스트로 규약을 박았다 — 고스트 명령이면 꼬리표에 반드시 `Tab`).
- 머리말 `AI 명령 — 커서 자리에서 실행` + 발치 `↑↓ 고르기 · Enter/Tab 실행 · Esc 닫기 — 결과는
  흐린 글씨로 먼저 보이고 Tab을 눌러야 원고에 들어갑니다`(`tooltipClass: ice-slash` + CSS 의사요소).
- **정렬 버그**: 자동완성 기본 정렬이 가나다순이라 `/`만 치면 `/다듬기`가 맨 위였다(가장 많이 쓰는
  `/이어쓰기`가 다섯 번째). `boost`로 카탈로그 순서를 되살렸다.
- 메뉴가 떠 있으면 `Tab`으로도 고른다(`acceptCompletion`). 순서는 고스트 Tab → 자동완성 Tab →
  전각 들여쓰기. 각각 제 차례가 아니면 `false`를 돌려 다음으로 넘긴다.
- 테두리가 안 보이던 원인: `var(--line)`은 이 팔레트에 없는 변수였다(무효 선언 → `border: none`).
  `var(--border)`로 교정.

### 2. 고스트 — 꼬리표 + 안내 막대

- 위젯 DOM을 `[제안 글자][꼬리표]`로 나눴다. 꼬리표는 `/이어쓰기 · Tab 확정 · Esc 취소`,
  생성 중이면 `쓰는 중… Esc 중지`(깜빡임). 위젯 안이라 **원고엔 한 글자도 안 남는다**.
- `GhostState`에 `status`(streaming/ready)·`label` 추가. 글자가 오기 전에도 흐린 자리를 띄워
  "불렀는데 아무 반응 없는" 공백을 없앴다.
- 본문 아래 **안내 막대**(`.ghost-bar`) — 같은 말 + 누를 수 있는 `Tab 확정`·`Esc 취소` 단추.
  CM 상태를 `updateListener`에서 React로 끌어온다(제안이 바뀔 때만 리렌더).
- 실패·저장은 말로: `inlineNotice`(6초 자동 소멸) — 명령 실패, `/줄거리`가 문서 정보로 간 사실,
  `/다듬기` 대상 문단 없음. AI 패널이 닫혀 있어도 쓰던 자리에서 보인다.

### 3. `/`의 존재를 알리는 자리

- 빈 문서 placeholder + 새 책 씨앗 문단 + AI 패널 첫 안내 세 곳에 `「/」`와 `Tab/Esc`를 적었다.
  (씨앗이 있는 새 문서에서는 placeholder가 안 보이므로 씨앗 문단에도 적어야 한다 — 실측.)

### 검증 (증거 기반)

- `npm run typecheck` 0 errors · `npm run build` 성공 · `npm test` **104** 통과(슬래시 7→8).
- `npm run test:folder:e2e` **10** 통과(7→10): 메뉴가 `Tab 확정`·조작 안내를 실제로 보여 주는가
  (`::before`/`::after` computed content까지 확인), 꼬리표·막대 문구, **확정 후 원고에 안내 글자가
  섞이지 않는가**, 제안이 사라지면 막대도 사라지는가.
- `npm run test:e2e` 32 통과(무회귀 — Tab 들여쓰기·인용 탈출 그대로).
- 실기 스크린샷으로 눈으로 확인(메뉴 순서·막대 문구 잘림 2건을 여기서 잡았다).

### 실측으로 알아낸 것

- **절대배치 + `left: 50%`면 기본 폭이 '남은 절반'으로 쪼그라든다** — 안내 막대 문구가
  `아직 원고에 없…`으로 잘렸다. `width: max-content`로 교정.
- 자동완성 옵션은 넣은 순서가 아니라 **점수·가나다순**으로 정렬된다. 순서가 뜻을 가지면 `boost` 필수.

---

## 2026-07-29 — 집필 UX 8건: 챕터 표지 · 문단 모양 · 슬래시 지시 · 자리 기억 · 바인더 계층

v0.9.0을 실제로 쓰며 나온 요청 8건. 성격이 셋으로 갈린다 — **없는 기능**(챕터 표지·문단 모양·슬래시 지시),
**엉뚱하게 도는 기능**(이미지 맥락·재시작 자리·AI 연결), **군더더기**(인스펙터 항목·바인더 계층).
목표는 하나다: **앱을 켜서 마지막 자리로 돌아가 바로 쓰기 시작할 수 있는 상태.**

### 1. 챕터 표지 (§7.6) — 책 표지와 같은 방식

`ImageTarget`에 `docCover`를 더했다. AI는 글자 없는 그림만 그리고 제목은 앱이 내장 글꼴로 얹는 규칙
그대로다. 완성본은 `assets/covers/<문서명>.png`(프론트매터 `cover`), 원본 아트는
`assets/covers/.art/<문서명>.png`(`cover_art`) — **점으로 시작하는 폴더**라 `scanDir`·`listAssets`가
이미 건너뛴다. 조판용 중간 산출물이 자료 갤러리와 AI 전체 목차를 더럽히지 않는다(`.thumbs` 관례 재사용).
갤러리 카드는 `cover ?? image` 순으로 표지를 고른다. 제목 조판 코드는 `lib/coverCompose.ts`로 빼
책 표지와 챕터 표지가 함수 하나를 공유한다.

### 2. 이미지 프롬프트를 커서 자리에서 (§7.6)

`sceneAtCursor(body, cursor)` 신설. 예전엔 늘 문서 앞 600자였다 — 20장짜리 챕터 한가운데서 삽화를 불러도
프롤로그를 그려 주는 셈이라 쓸모가 없었다(사용자 지적). 이제 커서가 놓인 문단이 근거다.

### 3. 문단 간격 · 들여쓰기 · 내어쓰기 (§8.1)

보기 설정이라 원고 파일엔 아무것도 안 들어간다. 마크다운에서 한 문단은 한 줄(`.cm-line`)이라
**줄 아래 여백이 곧 문단 간격**이다. 들여쓰기/내어쓰기는 같은 `text-indent` 축이라 모드 하나 + 크기 하나로 묶었다.

### 4. 슬래시 명령에 한 줄 지시 (§6.1b)

네 제안 명령을 고르면 본문 아래에 작은 입력 막대가 뜬다. **비우고 Enter면 지시 없이 그대로 실행** —
"넣을 수도 있고 넣지 않을 수도 있게"가 요청의 요점이라 입력을 강제하지 않는다. 넣은 말은 요청문 맨 끝에
`[작가 지시]`로 붙는다. 모달이 아니라 막대인 이유는 "패널로 시선을 옮기지 않는다"는 이 기능의 요점을
스스로 깨지 않기 위해서다.

### 5. 인스펙터 정리 — POV · 목표 글자수 삭제

UI에서만 뺐다. **프론트매터 파서·직렬화는 그대로 둔다** — 기존 원고에 적힌 값이 저장 한 번에 사라지면
안 된다(무손실 왕복 §4). 상태바의 "목표 %"도 함께 걷어냈다(설정할 길이 없어졌으므로).

### 6. 쓰던 자리 기억 (§6.1)

`state/session.ts`(localStorage) — 책마다 마지막 문서·커서·스크롤. 책을 고르면 갤러리 대신 그 자리로
간다(책 선택 자체는 사용자 몫으로 남겼다). 원고 폴더가 아니라 기기에 붙인다 — 클라우드로 공유하면
여러 대가 서로의 커서를 덮어쓴다. 복원은 검색 점프와 같은 `pendingJump` 경로를 재사용한다.

### 7. AI 자동 연결 (§7.3)

원인은 단순했다. 설정은 전부터 저장되고 있었는데 **아무도 `check()`를 부르지 않았다** → `conn === null` →
패널이 "연결 안 됨"으로 판단해 설정 폼을 강제로 펼쳤다. 앱 껍데기에서 한 번 확인하게 했다.
실패해도 저장된 설정을 말없이 기본값으로 덮어쓰지 않는다 — 사유와 되돌리기 단추를 내주되 누르는 건 사용자다.

### 8. 바인더 계층 (§6.2)

`sortNodes`를 **문서 먼저 → 폴더 나중**으로 뒤집었다(모든 섹션). 그래야 섹션의 알맹이가 맨 위에 온다 —
`문체지침.md`가 [문체] 바로 아래, `samples/`가 그 밑. 섹션 머리는 11px 대문자에서 14px 굵게 + 글리프 +
구분선으로, 폴더는 아이콘 + 자식 안내선으로 구분했다. 중복돼 있던 섹션 표는 `lib/sections.ts`로 단일화.

### 검증 (증거 기반)

- `npm test` **114** 통과(104 → 114: 이미지 프롬프트 7→12 · 슬래시 8→11 · ProjectService 21→24)
- `npm run typecheck` 0 errors · `npm run build` 성공
- E2E 전부 통과 — 에디터 32 · 검색 9 · 책장 5 · 이미지 9 · 폴더/문체/슬래시 **10**(지시 막대 검증 추가)
- 실기 확인 13항목 + 스크린샷(콘솔 오류 0건): 바인더 계층 · 문단 간격 11.9px→20.4px · 들여쓰기/내어쓰기 ·
  커서 문단 프롬프트 · 챕터 표지 생성→조판→저장→카드 · POV 제거 · **재시작 후 커서 20 복원** ·
  AI 자동 연결 성공(설정 폼 접힘·입력 가능) · 슬래시 지시 막대
- 기존 실패 1건은 **이번 작업과 무관**: `npm run test:ai`의 "CLI 이미지 미지원 안내" — 변경 전 트리에서도
  동일하게 실패한다(`npm test` 목록에는 없다).

### 실측으로 알아낸 것

- **`ice-asset`에는 `corsEnabled` 권한이 없다.** 표지 아트를 캔버스에 그려 `toDataURL()` 하려면
  `corsEnabled` + ACAO 헤더가 **한 쌍으로** 필요한데, 권한 없이 `crossOrigin`을 붙이면 이미지 로드 자체가
  깨지고, 안 붙이면 캔버스가 오염돼 저장이 막힌다. 그래서 문서 표지는 **이미 그 조합이 검증된
  `ice-cover` 스킴에 `doc` host를 더해** 서빙한다(ice-asset의 권한은 건드리지 않았다).
- **빈 줄에도 문단 간격이 붙으면 기존 원고가 두 배로 벌어진다** — 마크다운 원고엔 이미 문단마다 빈 줄이
  있다. `.cm-blank-line` 라인 데코로 그 줄만 0으로 되돌렸다(라인 데코라 ViewPlugin에서 안전하다.
  문제되는 건 `block: true` replace 데코뿐 — 2026-07-12 함정과 구분할 것).
- **자동 연결은 상한이 있어야 한다.** E2E가 5초를 기다리다 터졌는데, 원인은 그 테스트가
  `ICEFICTION_AICONFIG`를 안 넘겨 **개발 기계의 진짜 설정**(CLI)으로 확인이 돌았기 때문이다. 실제
  사용자에게도 같은 일이 난다 → 2.5초 뒤에는 확인이 끝나지 않아도 설정 폼을 내준다.
- **인스펙터에 같은 클래스 단추를 하나 더 두면 자동화가 둘을 구분 못 한다.** 표지 단추를
  `.insp-gen-image`로 두었더니 E2E가 첫 번째(표지)를 눌러 엉뚱한 창이 떴다 → `.insp-gen-cover`로 분리.
- **트리 들여쓰기는 한 곳에서만 줘야 한다.** 자식 감싸개에 `margin-left`를 주면서 줄마다
  `depth * 14`를 그대로 두면 이중으로 밀린다.
- 커서 장면은 **커서보다 앞서 나가면 안 된다.** 빈 줄 없이 길게 쓴 원고에서 문단 끝을 따라가면
  커서에서 수천 자 떨어진 대목을 그리게 된다 → 400자 상한.
