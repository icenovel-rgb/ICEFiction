/**
 * AIService — 설정·어댑터 선택·스트리밍 생성(BLUEPRINT §7). 렌더러에는 요청ID로 델타를 이벤트로 보낸다.
 *
 * 설정은 userData/ai-config.json(기기별), 키는 SecretService(safeStorage). electron은 지연 로드해
 * 테스트에서 env 오버라이드(ICEFICTION_AICONFIG)로 우회 가능하게 한다.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import type { WebContents } from 'electron'
import type { AIAttachment, AIConfig, AIConnStatus, ChatMessage } from '../../shared/types'
import { writeFileAtomic } from '../lib/atomic'
import type { TextAI } from '../ai/adapter'
import { AnthropicAI } from '../ai/anthropic'
import { CliAI } from '../ai/cli'
import { OpenAICompatAI } from '../ai/openai'
import { AIError } from '../ai/errors'
import { projectService } from './project'
import { secretService } from './secrets'

const DEFAULT: AIConfig = {
  kind: 'openai',
  model: 'llama3.1',
  baseUrl: 'http://localhost:11434/v1'
}

async function configPath(): Promise<string> {
  if (process.env.ICEFICTION_AICONFIG) return process.env.ICEFICTION_AICONFIG
  const { app } = await import('electron')
  return join(app.getPath('userData'), 'ai-config.json')
}

function keyName(kind: AIConfig['kind']): string {
  return `ai:${kind}`
}

export class AIService {
  private controllers = new Map<string, AbortController>()

  async getConfig(): Promise<AIConfig> {
    let cfg: AIConfig
    try {
      cfg = { ...DEFAULT, ...(JSON.parse(await fs.readFile(await configPath(), 'utf8')) as AIConfig) }
    } catch {
      cfg = { ...DEFAULT }
    }
    return { ...cfg, hasKey: await secretService.hasKey(keyName(cfg.kind)) }
  }

  async setConfig(cfg: AIConfig, apiKey?: string): Promise<AIConfig> {
    const { hasKey: _omit, ...persist } = cfg
    await writeFileAtomic(await configPath(), JSON.stringify(persist, null, 2))
    if (apiKey !== undefined) await secretService.setKey(keyName(cfg.kind), apiKey)
    return this.getConfig()
  }

  private build(cfg: AIConfig, key: string): TextAI {
    switch (cfg.kind) {
      case 'anthropic':
        return new AnthropicAI(cfg.model, key)
      case 'cli':
        return new CliAI(cfg.cliCommand || 'claude', cfg.model)
      case 'openai':
      default:
        return new OpenAICompatAI(cfg.baseUrl || DEFAULT.baseUrl!, cfg.model, key)
    }
  }

  private async adapter(): Promise<TextAI> {
    const cfg = await this.getConfig()
    return this.build(cfg, await secretService.getKey(keyName(cfg.kind)))
  }

  /** 드롭다운용 모델 목록 — 아직 저장 안 한 초안 설정으로도 조회(키는 저장본 폴백). */
  async listModels(
    draft: Pick<AIConfig, 'kind' | 'baseUrl' | 'cliCommand'>,
    apiKey?: string
  ): Promise<string[]> {
    const key = apiKey || (await secretService.getKey(keyName(draft.kind)))
    try {
      return await this.build({ ...draft, model: '' }, key).listModels()
    } catch {
      return []
    }
  }

  async check(): Promise<AIConnStatus> {
    try {
      return await (await this.adapter()).checkConnection()
    } catch (e) {
      return { ok: false, state: 'error', detail: e instanceof Error ? e.message : String(e) }
    }
  }

  cancel(requestId: string): void {
    this.controllers.get(requestId)?.abort()
  }

  /** 첨부 참조(경로만)를 실제 데이터로 채운다 — 생성 직전 1회. 큰 base64/텍스트의 이중 IPC를 피한다(§7.5). */
  private async resolveAttachments(messages: ChatMessage[]): Promise<ChatMessage[]> {
    return Promise.all(
      messages.map(async (m) => {
        if (!m.attachments || m.attachments.length === 0) return m
        const atts = await Promise.all(
          m.attachments.map(async (a) => {
            if (a.dataBase64 || a.text) return a // 이미 채워졌으면 그대로
            try {
              return await projectService.resolveAttachment(a.path)
            } catch {
              return null // 읽기 실패한 첨부는 조용히 제외(대화는 계속)
            }
          })
        )
        return { ...m, attachments: atts.filter((a): a is AIAttachment => a != null) }
      })
    )
  }

  /** 스트리밍 생성 — 델타/완료/오류를 webContents 이벤트로 보낸다. */
  async generate(requestId: string, messages: ChatMessage[], wc: WebContents): Promise<void> {
    const controller = new AbortController()
    this.controllers.set(requestId, controller)
    try {
      const adapter = await this.adapter()
      const resolved = await this.resolveAttachments(messages)
      const text = await adapter.generate(
        resolved,
        (delta) => {
          if (!wc.isDestroyed()) wc.send('ai:delta', { requestId, text: delta })
        },
        controller.signal
      )
      if (!wc.isDestroyed()) wc.send('ai:done', { requestId, text })
    } catch (e) {
      const kind = e instanceof AIError ? e.kind : 'other'
      const message = e instanceof Error ? e.message : String(e)
      if (!wc.isDestroyed()) wc.send('ai:error', { requestId, kind, message })
    } finally {
      this.controllers.delete(requestId)
    }
  }
}

export const aiService = new AIService()
