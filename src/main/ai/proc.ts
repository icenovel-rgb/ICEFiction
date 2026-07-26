/**
 * CLI 프로세스 공용 실행기 — 텍스트 AI(cli.ts)와 이미지 생성(image.ts)이 함께 쓴다.
 *
 * ICEWriter cli_text.py 노하우: 유휴/하드 타임아웃 워치독, 취소 시 프로세스 **트리** 종료,
 * Windows 콘솔창 숨김, macOS GUI PATH 보강, cwd=tmp(프로젝트 폴더 잠금·컨텍스트 오염 방지).
 */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { AIError, classifyError } from './errors'

export const IS_WIN = process.platform === 'win32'

/** macOS GUI 실행 시 최소 PATH 보강(설치 위치 폴백). Windows는 무영향. */
export function augmentedEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  if (!IS_WIN) {
    const home = homedir()
    const extra = [
      `${home}/.npm-global/bin`,
      '/opt/homebrew/bin',
      '/usr/local/bin',
      `${home}/.local/bin`,
      `${home}/.bun/bin`,
      `${home}/.deno/bin`
    ].filter((p) => existsSync(p))
    const cur = (env.PATH || '').split(':')
    env.PATH = [...cur, ...extra.filter((p) => !cur.includes(p))].join(':')
  }
  return env
}

/** 자식 프로세스 트리를 통째로 죽인다(취소·타임아웃). CLI 에이전트는 손자 프로세스를 남기기 쉽다. */
export function killTree(proc: ChildProcess | null): void {
  if (!proc || proc.exitCode !== null || proc.pid == null) return
  if (IS_WIN) {
    spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { windowsHide: true })
  } else {
    proc.kill('SIGTERM')
  }
}

/**
 * CLI 실행 — Windows는 cmd.exe 경유(npm 셸 스크립트 해석).
 * cwd 기본값은 tmp다(프로젝트 폴더 잠금 방지). 폴더를 읽혀야 할 때만 호출부가 cwd를 넘긴다.
 */
export function spawnCli(command: string, args: string[], cwd = tmpdir()): ChildProcess {
  const opts = { windowsHide: true, env: augmentedEnv(), cwd }
  if (IS_WIN) return spawn('cmd.exe', ['/c', command, ...args], opts)
  return spawn(command, args, opts)
}

export interface RunOptions {
  /** 이 시간 동안 출력이 없으면 중단 */
  idleMs: number
  /** 이 시간이 지나면 무조건 중단 */
  hardMs: number
  /** stdin으로 넘길 내용(없으면 즉시 닫는다) */
  stdin?: string
  /** stdout 한 줄마다 */
  onLine?: (line: string) => void
  /** 작업 디렉터리(기본 tmp) — 원고 폴더를 읽혀야 하는 CLI 텍스트 생성에서만 넘긴다. */
  cwd?: string
}

export interface RunResult {
  code: number | null
  /** stderr 마지막 조각들(오류 메시지 조립용) */
  tail: string[]
}

/**
 * 공용 실행 — stdin 전달, stdout 라인 콜백, 워치독/취소/트리종료. 종료코드·stderr tail 반환.
 * 실패를 던지지 않고 code로 돌려준다(호출부가 결과 파일 유무로 성패를 판정할 수 있게).
 */
export function runProc(
  name: string,
  command: string,
  args: string[],
  signal: AbortSignal,
  opts: RunOptions
): Promise<RunResult> {
  const proc = spawnCli(command, args, opts.cwd)
  const tail: string[] = []
  let lastActivity = Date.now()

  return new Promise((resolve, reject) => {
    const onAbort = (): void => {
      killTree(proc)
      reject(new AIError('cancelled', '중지했습니다'))
    }
    signal.addEventListener('abort', onAbort, { once: true })

    const started = Date.now()
    const watchdog = setInterval(() => {
      const now = Date.now()
      if (now - started > opts.hardMs || now - lastActivity > opts.idleMs) {
        clearInterval(watchdog)
        killTree(proc)
        reject(new AIError('other', `${name}이(가) 응답 없이 멈춰 중단했습니다`, tail.join('\n')))
      }
    }, 2000)
    const cleanup = (): void => {
      clearInterval(watchdog)
      signal.removeEventListener('abort', onAbort)
    }

    if (opts.stdin != null) proc.stdin?.write(opts.stdin)
    proc.stdin?.end()

    let buf = ''
    proc.stdout?.setEncoding('utf8')
    proc.stdout?.on('data', (chunk: string) => {
      lastActivity = Date.now()
      if (!opts.onLine) return
      buf += chunk
      let idx: number
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx)
        buf = buf.slice(idx + 1)
        if (line.trim()) opts.onLine(line)
      }
    })
    proc.stderr?.setEncoding('utf8')
    proc.stderr?.on('data', (c: string) => {
      lastActivity = Date.now()
      tail.push(String(c).trim())
      if (tail.length > 40) tail.shift()
    })
    proc.on('error', (err) => {
      cleanup()
      reject(
        new AIError(classifyError(err.message), `${command} 실행 실패: ${err.message}`, err.message)
      )
    })
    proc.on('close', (code) => {
      cleanup()
      if (signal.aborted) return
      if (buf.trim() && opts.onLine) opts.onLine(buf)
      resolve({ code, tail })
    })
  })
}

/** `<cmd> --version` 이 0으로 끝나는가 — 설치 여부 감지. */
export function probeVersion(command: string): Promise<{ ok: boolean; detail: string }> {
  return new Promise((resolve) => {
    let proc: ChildProcess
    try {
      proc = spawnCli(command, ['--version'])
    } catch {
      resolve({ ok: false, detail: '실행 불가' })
      return
    }
    let out = ''
    proc.stdout?.on('data', (c) => (out += String(c)))
    proc.on('error', () => resolve({ ok: false, detail: '설치되어 있지 않음' }))
    proc.on('close', (code) => {
      const v = out.trim().split('\n')[0]?.trim() ?? ''
      resolve(code === 0 ? { ok: true, detail: v || '확인됨' } : { ok: false, detail: '확인 실패' })
    })
  })
}

export const CLI_SAFE_CWD = tmpdir()
