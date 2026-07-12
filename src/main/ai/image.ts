/**
 * 이미지 생성 — 로컬 CLI 에이전트에게 그림을 시킨다(BLUEPRINT §7.6).
 *
 * 텍스트 AI와 **별개 설정**이다. 텍스트는 Ollama·Claude API를 쓰면서, 그림은 CLI를 쓸 수 있어야 한다.
 *
 * 엔진(실측으로 전부 동작 확인):
 *  · agy    `agy -p <한 줄> --add-dir <출력폴더> --dangerously-skip-permissions`   ← 기본
 *  · codex  `codex exec -s workspace-write --add-dir <출력폴더> --model <일반모델> -`  (프롬프트는 stdin)
 *  · gemini `gemini -p <한 줄>`  (best-effort)
 *
 * ⚠️ 프롬프트를 argv로 넘기지 않는다. Windows는 cmd.exe를 거치므로 줄바꿈이 든 인자가 깨지고
 *    8191자 제한에 걸린다. 지시문은 **임시 파일**에 쓰고, CLI에는 "그 파일을 읽고 그대로 하라"는
 *    한 줄만 준다(shared/imagePrompt.ts).
 * ⚠️ codex는 `*-codex` 모델이 이미지 툴을 지원하지 않는다 → 일반 모델(gpt-5.5)을 쓴다.
 *
 * 성패 판정은 CLI의 종료코드가 아니라 **결과 파일이 실제로 생겼는지**로 한다(에이전트는 실패해도
 * 0으로 끝나며 변명을 늘어놓는 일이 잦다).
 */
import { promises as fs } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ImageEngine, ImageEngineInfo } from '../../shared/types'
import { buildInstruction, oneLinePrompt, type InstructionInput } from '../../shared/imagePrompt'
import { AIError } from './errors'
import { probeVersion, runProc } from './proc'

const IDLE_MS = 240_000 // 그림 한 장에 1~2분 — 조용한 구간이 길다
const HARD_MS = 900_000

/** codex는 이미지 툴을 지원하는 일반 모델을 써야 한다(*-codex 모델은 미지원). */
const CODEX_IMAGE_MODEL = 'gpt-5.5'

const ENGINE_LABEL: Record<ImageEngine, string> = {
  agy: 'Antigravity (agy)',
  codex: 'Codex CLI',
  gemini: 'Gemini CLI'
}

/** 시도 순서 — agy 우선(codex는 사용량 병목이 잦다), 그 다음 codex, gemini. */
const AUTO_ORDER: ImageEngine[] = ['agy', 'codex', 'gemini']

export interface GenerateInput extends Omit<InstructionInput, 'destAbsPath'> {
  /** PNG가 저장될 절대경로 */
  destAbsPath: string
  engine: ImageEngine | 'auto'
}

export class ImageService {
  /** 설치된 이미지 엔진 감지(설정 화면·생성 전 사전 점검). */
  async engines(): Promise<ImageEngineInfo[]> {
    const list = await Promise.all(
      AUTO_ORDER.map(async (engine) => {
        const { ok, detail } = await probeVersion(engine)
        return { engine, ok, detail: ok ? detail : `${ENGINE_LABEL[engine]} 없음 — ${detail}` }
      })
    )
    return list
  }

  /**
   * 그림 한 장을 생성해 destAbsPath에 저장한다. 성공 시 사용한 엔진을 돌려준다.
   * auto면 설치된 엔진을 순서대로 시도한다(앞 엔진이 실패해도 다음으로 넘어간다).
   */
  async generate(
    input: GenerateInput,
    onProgress: (text: string) => void,
    signal: AbortSignal
  ): Promise<ImageEngine> {
    await fs.mkdir(dirname(input.destAbsPath), { recursive: true })
    // 이전 결과가 남아 있으면 "새로 생겼는지" 판정이 흐려진다 → 미리 치운다.
    await fs.rm(input.destAbsPath, { force: true })

    // 스텁 모드(테스트)에선 엔진 탐지를 건너뛴다 — CLI 설치 여부와 무관하게 배선을 검증한다.
    const candidates: ImageEngine[] = process.env.ICEFICTION_IMAGE_STUB
      ? [input.engine === 'auto' ? 'agy' : input.engine]
      : input.engine === 'auto'
        ? await this.installedInOrder()
        : [input.engine]
    if (candidates.length === 0) {
      throw new AIError(
        'not_installed',
        '이미지 생성 CLI가 없습니다 — agy 또는 codex를 설치하세요',
        'agy / codex / gemini 모두 감지되지 않음'
      )
    }

    const failures: string[] = []
    for (const engine of candidates) {
      if (signal.aborted) throw new AIError('cancelled', '중지했습니다')
      onProgress(`${ENGINE_LABEL[engine]}로 그리는 중…`)
      try {
        await this.runEngine(engine, input, onProgress, signal)
        return engine // 결과 파일 확인 완료
      } catch (err) {
        if (err instanceof AIError && err.kind === 'cancelled') throw err
        const msg = err instanceof Error ? err.message : String(err)
        failures.push(`${ENGINE_LABEL[engine]}: ${msg}`)
        onProgress(`${ENGINE_LABEL[engine]} 실패 — ${msg}`)
      }
    }
    throw new AIError('other', '이미지 생성에 실패했습니다', failures.join('\n'))
  }

  /** 설치된 엔진만 AUTO_ORDER 순서로. */
  private async installedInOrder(): Promise<ImageEngine[]> {
    const infos = await this.engines()
    return AUTO_ORDER.filter((e) => infos.find((i) => i.engine === e)?.ok)
  }

  private async runEngine(
    engine: ImageEngine,
    input: GenerateInput,
    onProgress: (text: string) => void,
    signal: AbortSignal
  ): Promise<void> {
    const instruction = buildInstruction(input)
    const startedAt = Date.now()

    // 테스트 이음매 — ICEFICTION_IMAGE_STUB에 PNG 경로를 주면 CLI 대신 그 파일을 복사한다.
    // E2E에서 매번 진짜 그림을 뽑으면 몇 분·비용이 들므로, 배선(IPC·저장·첨부·표지 합성)만 검증한다.
    const stub = process.env.ICEFICTION_IMAGE_STUB
    if (stub) {
      onProgress(`[stub] ${engine}`)
      await fs.copyFile(stub, input.destAbsPath)
      // Windows의 copyFile은 **원본 수정시각까지 복사**한다 → assertFresh의 "새로 생겼나" 검사에
      // 걸린다. 실제 엔진은 파일을 새로 만드니 문제없지만, 스텁은 시각을 지금으로 되돌려 준다.
      const now = new Date()
      await fs.utimes(input.destAbsPath, now, now)
      await this.assertFresh(input.destAbsPath, startedAt)
      return
    }

    // 지시문은 파일로 — argv로 넘기면 Windows cmd.exe에서 줄바꿈·따옴표가 깨진다.
    const instrPath = join(tmpdir(), `icefic-img-${startedAt}-${process.pid}.txt`)
    await fs.writeFile(instrPath, instruction, 'utf8')

    try {
      const line = (t: string): void => {
        const s = t.trim()
        if (s) onProgress(s.slice(0, 200))
      }
      if (engine === 'codex') {
        // codex는 stdin으로 프롬프트를 받는다('-') → 지시문을 통째로 넣는다.
        const outDir = dirname(input.destAbsPath)
        await runProc(
          ENGINE_LABEL[engine],
          'codex',
          [
            'exec',
            '-s',
            'workspace-write',
            '--add-dir',
            outDir,
            '--skip-git-repo-check',
            '--color',
            'never',
            '--model',
            CODEX_IMAGE_MODEL,
            '-'
          ],
          signal,
          { idleMs: IDLE_MS, hardMs: HARD_MS, stdin: instruction, onLine: line }
        )
      } else if (engine === 'agy') {
        await runProc(
          ENGINE_LABEL[engine],
          'agy',
          [
            '-p',
            oneLinePrompt(instrPath),
            '--add-dir',
            dirname(input.destAbsPath),
            '--dangerously-skip-permissions'
          ],
          signal,
          { idleMs: IDLE_MS, hardMs: HARD_MS, onLine: line }
        )
      } else {
        await runProc(
          ENGINE_LABEL[engine],
          'gemini',
          ['-p', oneLinePrompt(instrPath)],
          signal,
          { idleMs: IDLE_MS, hardMs: HARD_MS, onLine: line }
        )
      }

      // 성패는 종료코드가 아니라 **파일**로 판정한다 — 에이전트는 실패해도 0으로 끝나곤 한다.
      await this.assertFresh(input.destAbsPath, startedAt)
    } finally {
      void fs.rm(instrPath, { force: true }).catch(() => {})
    }
  }

  /** 결과 PNG가 실제로 새로 생겼는지(존재 + 이번 실행 이후 수정 + 내용 있음). */
  private async assertFresh(dest: string, startedAt: number): Promise<void> {
    let st
    try {
      st = await fs.stat(dest)
    } catch {
      throw new Error('이미지 파일을 만들지 못했습니다')
    }
    if (st.size < 1000) throw new Error('생성된 이미지가 비어 있습니다')
    if (st.mtimeMs < startedAt - 5000) throw new Error('이전 이미지가 그대로입니다(새로 생성 안 됨)')
  }
}

export const imageService = new ImageService()
