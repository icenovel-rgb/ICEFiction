# 구현 계획: 찾기·바꾸기 + 책 전체 검색 (v0.8.0)

> 확정: 2026-07-17. 이 파일은 `/plan`으로 확정된 계획의 기록이다. 다음 세션에서 `/sync`로 이어서 작업.

## 요구사항

1. **에디터 안 찾기·바꾸기** — 현재 문서에서 Ctrl+F/바꾸기. 지금은 `@codemirror/search` 자체가 없어 Ctrl+F도 안 됨.
2. **책 전체 검색** — 책 안 모든 문서(원고·캐릭터·세계관·노트)에서 텍스트를 찾고, 결과를 누르면 그 문서의 그 위치로 이동.

## 핵심 설계 결정 (승인됨)

**D1. SQLite FTS5를 쓰지 않고, 메인 프로세스 실시간 스캔으로 간다.**
- FTS5 unicode61 토크나이저는 한국어 부분일치가 안 됨(trigram 별도 처리 필요)
- better-sqlite3 네이티브 모듈은 Win/mac Electron 리빌드 부담
- 책 한 권(수백 파일·수 MB)은 매 검색 스캔으로 충분히 빠름
- "진실은 항상 .md" 원칙에 인덱스 없는 쪽이 부합. FTS5는 링크 그래프·통계 필요 시점으로 연기.
- BLUEPRINT §5/§6.9에 결정 기록할 것.

**D2. "전체 바꾸기(다중 파일 일괄 치환)"는 이번 범위에서 제외.**
- 스냅샷/diff 안전망(M5)이 없어 실수 한 번이 원고 전체를 조용히 훼손 가능.
- 바꾸기는 에디터(현재 문서) 안에서만. 전체 바꾸기는 스냅샷과 한 세트로.

## 단계별 계획

### 1단계 — 에디터 찾기·바꾸기 (`@codemirror/search`)
- 의존성 추가, `Editor.tsx`에 `search({top:true})` + `searchKeymap` + `highlightSelectionMatches()` 장착.
- **한국어화**: CM6 `EditorState.phrases`로 패널 문구 전부 교체.
- **패널 스타일**: `global.css`에 `.cm-panel.cm-search` 스타일링(앱 다크 톤·매치 하이라이트 색).
- ⚠️ **키 충돌 실측 확인됨**: `searchKeymap`의 `Mod-Shift-l`(selectSelectionMatches)이 기존 정렬 단축키 Ctrl+Shift+L과 충돌 → searchKeymap에서 그 바인딩만 걸러내고 장착.
- 수용 기준: Ctrl+F 한국어 패널, 바꾸기 후 저장 파일에 반영, F3/Shift+F3 탐색, Esc 닫기, 기존 정렬·탭·인용 단축키 무회귀.

### 2단계 — 전체 검색 백엔드 (`ProjectService.searchAll`)
- 트리 스캔 재사용해 4개 섹션의 .md를 읽고 **제목+본문**(프론트매터 제외) 부분일치 검색. 대소문자 토글.
- 결과: `{path, section, title, line, preview, from/to}[]`, 상한(파일당 50·전체 500).
- IPC `search:all` + preload 노출. 유닛 테스트(기존 project.test.mts 패턴).

### 3단계 — 검색 패널 UI + 점프
- 오른쪽 패널 **'검색' 탭**(기존 탭 인프라 재사용), **Ctrl+Shift+F**로 열기+포커스. 디바운스, 문서별 그룹핑, 매치 하이라이트 미리보기.
- 결과 클릭 → 문서 열기 → 해당 위치 선택+스크롤. ⚠️ 본문 교체는 Editor의 activePath effect에서 일어나므로 클릭 직후 dispatch하면 옛 문서에 선택이 찍힘 → `pendingJump`를 store에 두고 Editor 전환 effect 말미에서 소비.
- 수용 기준: 다른 섹션 문서로도 정확히 점프, 매치가 화면 중앙에 선택된 채 표시.

### 4단계 — 검증 + 문서화
- E2E 추가(Ctrl+F 패널·바꾸기·파일 반영 / 전체 검색→점프). `npm test`·`typecheck`·`build`·패키지 스모크.
- DEVLOG 기록 + BLUEPRINT §5/§6.9에 D1 반영. v0.8.0.

## 리스크

| 리스크 | 수준 | 대응 |
|---|---|---|
| `Mod-Shift-l` 키 충돌 | 확실 | searchKeymap에서 제외 (1단계) |
| 점프 타이밍(본문 교체 전 dispatch) | 중 | pendingJump 패턴 (3단계) |
| CM6 phrases 키 누락으로 영어 잔존 | 하 | E2E에서 패널 텍스트 검사 |
| 대용량 책 스캔 지연 | 하 | 상한+디바운스; 실측 후 필요 시에만 인덱스 재론 |
