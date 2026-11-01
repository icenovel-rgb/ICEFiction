/**
 * codex가 쓸 모델 고르기 — 이미지 생성용 **모델 이름을 앱에 박아 두지 않는다.**
 *
 * 2026-11-01 사건: image.ts에 `--model gpt-5.5`를 고정해 두었는데, 계정의 모델 목록에서 gpt-5.5가
 * 사라지자 매번 "The 'gpt-5.5' model is not supported when using Codex with a ChatGPT account"로
 * 죽었다(세션 기록 실측). 모델 이름은 OpenAI 쪽 사정으로 바뀌고 앱은 그걸 미리 알 수 없다.
 *
 * 원칙:
 *  1. **사용자의 codex 기본 모델**(~/.codex/config.toml의 최상위 `model`)이 이미지 툴을 지원하면
 *     `--model`을 아예 넘기지 않는다 — codex가 알아서 그 모델을 쓴다. 계정이 지원하는 모델임이
 *     보장되는 유일한 값이다.
 *  2. 기본 모델이 `*-codex` 계열(이미지 툴 미지원)이거나 설정이 없으면, codex가 서버에서 받아 둔
 *     모델 캐시(~/.codex/models_cache.json)에서 **목록에 보이는 일반 모델** 하나를 집는다.
 *  3. 둘 다 없으면 역시 `--model` 없이 — codex 자체 기본에 맡긴다.
 *
 * 파일을 읽는 부분과 고르는 부분을 나눠 둔다. 고르는 부분은 순수 함수라 그대로 단위 테스트한다.
 */
import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/** `*-codex` 모델은 코딩 전용이라 이미지 생성 툴이 없다(실측). */
export function supportsImageTool(slug: string): boolean {
  return !/-codex$/i.test(slug.trim())
}

/**
 * config.toml의 **최상위** `model = "…"`. `[profiles.x]` 같은 섹션 안의 model은 기본값이 아니므로
 * 첫 섹션 머리글(`[`)이 나오기 전까지만 본다. 진짜 TOML 파서는 들이지 않는다 — 이 한 줄이면 족하다.
 */
export function defaultModelFromConfig(toml: string): string | null {
  for (const raw of toml.split('\n')) {
    const line = raw.trim()
    if (line.startsWith('[')) break
    const m = /^model\s*=\s*"([^"]+)"/.exec(line)
    if (m) return m[1].trim()
  }
  return null
}

/** models_cache.json에서 모델 슬러그 목록 — `visibility: "list"`인 것 우선, 중복 제거, 순서 유지. */
export function listedModelsFromCache(json: string): string[] {
  try {
    const parsed = JSON.parse(json) as { models?: { slug?: string; visibility?: string }[] }
    const all = parsed.models ?? []
    const listed = all.filter((m) => m.visibility === 'list')
    const pick = listed.length > 0 ? listed : all
    return [...new Set(pick.map((m) => m.slug).filter((s): s is string => !!s))]
  } catch {
    return []
  }
}

export interface CodexFiles {
  /** ~/.codex/config.toml 내용(없으면 null) */
  configToml: string | null
  /** ~/.codex/models_cache.json 내용(없으면 null) */
  cacheJson: string | null
}

/**
 * 이미지 생성에 `--model`로 넘길 슬러그. **null이면 플래그를 넘기지 않는다**(codex 기본 모델 사용).
 */
export function pickCodexImageModel(files: CodexFiles): string | null {
  const def = files.configToml ? defaultModelFromConfig(files.configToml) : null
  if (def && supportsImageTool(def)) return null
  const listed = files.cacheJson ? listedModelsFromCache(files.cacheJson) : []
  return listed.find(supportsImageTool) ?? null
}

async function readOrNull(path: string): Promise<string | null> {
  try {
    return await fsp.readFile(path, 'utf8')
  } catch {
    return null
  }
}

export async function readCodexFiles(): Promise<CodexFiles> {
  const dir = join(homedir(), '.codex')
  const [configToml, cacheJson] = await Promise.all([
    readOrNull(join(dir, 'config.toml')),
    readOrNull(join(dir, 'models_cache.json'))
  ])
  return { configToml, cacheJson }
}

/** image.ts용 — `codex exec`에 붙일 모델 인자(없으면 빈 배열). */
export async function codexImageModelArgs(): Promise<string[]> {
  const slug = pickCodexImageModel(await readCodexFiles())
  return slug ? ['--model', slug] : []
}

/** cli.ts용 — 설정 화면 모델 드롭다운 채우기. */
export async function codexModelsFromCache(): Promise<string[]> {
  const { cacheJson } = await readCodexFiles()
  return cacheJson ? listedModelsFromCache(cacheJson) : []
}
