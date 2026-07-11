/** AI 어댑터 공통 인터페이스(BLUEPRINT §7.1). API·CLI 계열이 이 계약을 구현한다. */
import type { AIConnStatus, ChatMessage } from '../../shared/types'

export interface TextAI {
  name: string
  /** 완료 텍스트 반환, 진행분은 onDelta로 스트리밍. 실패 시 AIError throw. */
  generate(messages: ChatMessage[], onDelta: (t: string) => void, signal: AbortSignal): Promise<string>
  /** 가벼운 실호출 1회로 연결/키/한도 점검. */
  checkConnection(): Promise<AIConnStatus>
  /** 선택 가능한 모델 목록(드롭다운용). 실패 시 빈 배열 or 알려진 폴백. */
  listModels(): Promise<string[]>
}
