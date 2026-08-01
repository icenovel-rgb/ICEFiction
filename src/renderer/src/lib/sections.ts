/**
 * 섹션 표 — 바인더와 섹션 갤러리가 함께 보는 단일 정본(BLUEPRINT §6.2).
 *
 * 예전엔 라벨·타입·글리프 표가 두 파일에 따로 있었다. 한쪽만 고치면 같은 섹션이 화면마다 다른
 * 이름·아이콘으로 보인다 — 계층을 눈으로 알아보게 하는 것이 목적인데 그 근거가 갈라져 있으면 안 된다.
 */
import type { DocType } from '../../../shared/types'

/** 최상위 섹션 폴더 이름(main의 SECTIONS와 순서·이름이 같다). */
export const SECTION_DIRS = ['manuscript', 'characters', 'world', 'notes', 'style'] as const

export const SECTION_LABEL: Record<string, string> = {
  manuscript: '원고',
  characters: '캐릭터',
  world: '세계관',
  notes: '노트',
  style: '문체'
}

/** 섹션 안에서 새로 만드는 문서의 기본 타입. */
export const SECTION_TYPE: Record<string, DocType> = {
  manuscript: 'chapter',
  characters: 'character',
  world: 'world',
  notes: 'note',
  style: 'style'
}

/** 섹션을 한눈에 구분하는 그림글자 — 바인더 머리와 갤러리 카드가 같은 기호를 쓴다. */
export const SECTION_GLYPH: Record<string, string> = {
  manuscript: '✎',
  characters: '☺',
  world: '🜨',
  notes: '✦',
  style: '✍'
}

/** 문서 타입별 기본 표지 글리프(이미지가 없을 때). */
export const TYPE_GLYPH: Record<string, string> = {
  chapter: '✎',
  character: '☺',
  world: '🜨',
  note: '✦',
  style: '✍',
  part: '❑',
  folder: '❑'
}

/**
 * 섹션 갤러리를 어떻게 펼칠 것인가(§6.2).
 *  · cover 표지형 — 그림이 곧 정보인 문서(챕터 표지·인물 얼굴)
 *  · list  리스트형 — 제목과 줄거리로 훑는 문서(설정·메모·문체)
 */
export type GalleryView = 'cover' | 'list'

/**
 * 섹션별 기본 보기. **표지가 뜻을 갖는 섹션만 표지형**이다 —
 * 세계관·노트·문체는 대부분 그림이 없어 표지형으로 보면 빈 카드가 줄줄이 늘어선다(사용자 지적).
 * 사용자가 바꾸면 그 선택이 섹션별로 기억된다(settings.galleryViews).
 */
export const SECTION_VIEW: Record<string, GalleryView> = {
  manuscript: 'cover',
  characters: 'cover',
  world: 'list',
  notes: 'list',
  style: 'list'
}

/** 경로의 최상위 섹션(문서 타입·라벨 결정용). */
export function sectionOf(path: string): string {
  return path.split('/')[0]
}

/** 이 섹션에서 폴더를 뭐라고 부르는가 — 원고만 '부(Part)', 나머지는 '카테고리'. */
export function folderLabelOf(section: string): string {
  return section === 'manuscript' ? '부' : '카테고리'
}
