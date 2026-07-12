/**
 * CLI 어댑터 — 로컬 CLI 에이전트를 AI 프로바이더로(BLUEPRINT §7.1a).
 *  · claude:  `claude -p --output-format stream-json` (stdin 프롬프트, JSONL 스트림)
 *  · codex:   `codex exec --json -o <파일>` (stdin 프롬프트, 최종 메시지는 -o 파일이 정본)
 *  · 그 외:   `<cmd> -p` (stdin 프롬프트, stdout 텍스트)
 *
 * ICEWriter cli_text.py 노하우: 프롬프트는 argv가 아니라 stdin(Windows 8191자 제한·특수문자 회피),
 * 유휴/하드 타임아웃, 취소 시 프로세스 트리 종료, Windows 콘솔창 숨김, macOS GUI PATH 보강.
 */
import { homedir, tmpdir } from 'node:os'
import { promises as fsp } from 'node:fs'
import { join } from 'node:path'
import type { AIConnStatus, ChatMessage } from '../../shared/types'
import type { TextAI } from './adapter'
import { attachmentsToText } from './attachments'
import { AIError, classifyError } from './errors'
import { probeVersion, runProc } from './proc'

const IDLE_MS = 300_000
const HARD_MS = 1_800_000

type Flavor = 'claude' | 'codex' | 'generic'
function flavorOf(command: string): Flavor {
  const b = command.toLowerCase()
  if (b.includes('codex')) return 'codex'
  if (b.includes('claude')) return 'claude'
  return 'generic'
}

function flattenPrompt(messages: ChatMessage[]): string {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const convo = messages
    .filter((m) => m.role !== 'system')
    .map((m) => `${m.role === 'user' ? '사용자' : 'assistant'}: ${attachmentsToText(m)}`)
    .join('\n\n')
  return system ? `${system}\n\n${convo}` : convo
}

/** codex 모델 목록을 로컬 캐시(~/.codex/models_cache.json)에서 읽는다 — 드롭다운 자동 채움. */
async function codexModels(): Promise<string[]> {
  try {
    const raw = await fsp.readFile(join(homedir(), '.codex', 'models_cache.json'), 'utf8')
    const json = JSON.parse(raw) as { models?: { slug?: string; visibility?: string }[] }
    const all = json.models ?? []
    const listed = all.filter((m) => m.visibility === 'list')
    const pick = listed.length > 0 ? listed : all
    return [...new Set(pick.map((m) => m.slug).filter((s): s is string => !!s))]
  } catch {
    return []
  }
}

/** codex --json 이벤트에서 assistant 텍스트를 폭넓게 추출(버전별 스키마 차이 방어). */
function extractCodexText(evt: unknown): string {
  if (!evt || typeof evt !== 'object') return ''
  const e = evt as Record<string, unknown>
  const type = String(e.type ?? '')
  const item = (e.item ?? e.msg ?? e) as Record<string, unknown>
  const itype = String(item.type ?? item.role ?? '')
  const looksAssistant = /assistant|agent.?message/i.test(itype) || /assistant|agent.?message/i.test(type)
  if (!looksAssistant) return ''
  if (typeof item.text === 'string') return item.text
  if (typeof item.message === 'string') return item.message
  if (typeof e.text === 'string') return e.text
  if (typeof e.delta === 'string') return e.delta
  const delta = e.delta as Record<string, unknown> | undefined
  if (delta && typeof delta.text === 'string') return delta.text
  return ''
}

export class CliAI implements TextAI {
  name: string
  private flavor: Flavor
  constructor(
    private command = 'claude',
    private model = ''
  ) {
    this.flavor = flavorOf(command)
    this.name =
      this.flavor === 'codex'
        ? 'Codex CLI (codex exec)'
        : this.flavor === 'claude'
          ? 'Claude Code (claude -p)'
          : `${command} CLI`
  }

  /** 공통 실행 — proc.ts의 공용 실행기(워치독·취소·트리종료)를 쓴다. 이미지 생성도 같은 걸 쓴다. */
  private runCli(
    args: string[],
    stdin: string,
    onLine: (line: string) => void,
    signal: AbortSignal
  ): Promise<{ code: number | null; tail: string[] }> {
    return runProc(this.name, this.command, args, signal, {
      idleMs: IDLE_MS,
      hardMs: HARD_MS,
      stdin,
      onLine
    })
  }

  async generate(
    messages: ChatMessage[],
    onDelta: (t: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    if (this.flavor === 'codex') return this.generateCodex(messages, onDelta, signal)
    if (this.flavor === 'generic') return this.generateGeneric(messages, onDelta, signal)
    return this.generateClaude(messages, onDelta, signal)
  }

  private async generateClaude(
    messages: ChatMessage[],
    onDelta: (t: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const modelArgs = this.model ? ['--model', this.model] : []
    const args = ['-p', '--output-format', 'stream-json', '--verbose', ...modelArgs]
    let result = ''
    const unparsed: string[] = []
    const { code, tail } = await this.runCli(
      args,
      flattenPrompt(messages),
      (line) => {
        const t = line.trim()
        try {
          const evt = JSON.parse(t)
          if (evt.type === 'assistant') {
            for (const block of evt.message?.content ?? []) {
              if (block.type === 'text' && block.text) {
                result += block.text
                onDelta(block.text)
              }
            }
          } else if (evt.type === 'result' && typeof evt.result === 'string') {
            result = evt.result || result
          }
        } catch {
          unparsed.push(t.slice(0, 300))
        }
      },
      signal
    )
    if (code === 0) return result
    const joined = [...unparsed, ...tail].join('\n')
    // 404/모델 오류는 대개 잘못된 모델 이름 — 별칭 안내.
    const msg = /\b404\b|not.?found|model/i.test(joined)
      ? `${this.name}: 모델 이름을 확인하세요 (별칭: sonnet · opus · fable, 또는 비워두면 기본값)`
      : `${this.name} 실행 실패 (code ${code})`
    throw new AIError(classifyError(joined), msg, joined)
  }

  private async generateCodex(
    messages: ChatMessage[],
    onDelta: (t: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const outFile = join(tmpdir(), `icefic-codex-${Date.now()}-${process.pid}.txt`)
    const modelArgs = this.model ? ['-m', this.model] : []
    // --json: 진행 이벤트 스트리밍 / -o: 최종 메시지 파일(정본) / '-': 프롬프트를 stdin에서 읽기
    const args = ['exec', '--json', '--color', 'never', '-o', outFile, ...modelArgs, '-']
    const { code, tail } = await this.runCli(
      args,
      flattenPrompt(messages),
      (line) => {
        try {
          const text = extractCodexText(JSON.parse(line.trim()))
          if (text) onDelta(text) // 진행 표시용(정본은 -o 파일)
        } catch {
          /* 비JSON 로그 라인 무시 */
        }
      },
      signal
    )
    let finalText = ''
    try {
      finalText = (await fsp.readFile(outFile, 'utf8')).trim()
    } catch {
      /* 파일 없음 */
    }
    void fsp.unlink(outFile).catch(() => {})
    if (finalText) return finalText
    const joined = tail.join('\n')
    const msg = /not logged in|unauthor|401|login/i.test(joined)
      ? `${this.name}: 먼저 'codex login'으로 로그인하세요`
      : `${this.name} 응답 없음 (code ${code}) — codex login·모델을 확인하세요`
    throw new AIError(classifyError(joined), msg, joined)
  }

  private async generateGeneric(
    messages: ChatMessage[],
    onDelta: (t: string) => void,
    signal: AbortSignal
  ): Promise<string> {
    const modelArgs = this.model ? ['--model', this.model] : []
    let out = ''
    const { code, tail } = await this.runCli(
      ['-p', ...modelArgs],
      flattenPrompt(messages),
      (line) => {
        out += line + '\n'
        onDelta(line + '\n')
      },
      signal
    )
    if (code === 0 && out.trim()) return out.trim()
    const joined = [out, ...tail].join('\n')
    throw new AIError(classifyError(joined), `${this.command} 실행 실패 (code ${code})`, joined)
  }

  async listModels(): Promise<string[]> {
    // claude: 유효 별칭. codex: 로컬 모델 캐시에서. 기타: 비워두면 CLI 기본 사용.
    if (this.flavor === 'claude') return ['sonnet', 'opus', 'fable']
    if (this.flavor === 'codex') return codexModels()
    return []
  }

  async checkConnection(): Promise<AIConnStatus> {
    const { ok, detail } = await probeVersion(this.command)
    return ok
      ? { ok: true, state: 'ok', detail: `${this.name} 확인 (${detail.slice(0, 40)})` }
      : { ok: false, state: 'missing', detail: `${this.command} CLI를 찾을 수 없습니다 — ${detail}` }
  }
}

export const CLI_SAFE_CWD = tmpdir()
