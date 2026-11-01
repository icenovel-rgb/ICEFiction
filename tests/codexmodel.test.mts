/**
 * codex 이미지 모델 고르기(§7.6) — 모델 이름을 앱에 박아 두지 않는다.
 * 2026-11-01: `--model gpt-5.5` 고정값이 계정 목록에서 빠지자 그림이 한 장도 안 나왔다. 그 회귀 방지.
 * 실행: npx tsx tests/codexmodel.test.mts
 */
import assert from 'node:assert/strict'
import {
  defaultModelFromConfig,
  listedModelsFromCache,
  pickCodexImageModel,
  supportsImageTool
} from '../src/main/ai/codexModel'
import { cliHint } from '../src/main/ai/image'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

const CACHE = JSON.stringify({
  models: [
    { slug: 'gpt-6.1-sol', visibility: 'list' },
    { slug: 'gpt-6-astra', visibility: 'list' },
    { slug: 'gpt-reserve', visibility: 'hide' },
    { slug: 'gpt-6.1-sol', visibility: 'list' }
  ]
})

// 1) ★사건 그대로 — 사용자의 기본 모델이 멀쩡하면 --model을 넘기지 않는다(계정이 지원하는 유일한 보장값)
{
  const toml = 'model = "gpt-6.1-sol"\nmodel_reasoning_effort = "high"\n\n[projects."/x"]\ntrust_level = "trusted"\n'
  assert.equal(pickCodexImageModel({ configToml: toml, cacheJson: CACHE }), null)
  ok('기본 모델이 일반 모델 → --model 없이(codex 기본에 맡김)')
}

// 2) 기본 모델이 *-codex(이미지 툴 없음) → 캐시에서 목록에 보이는 일반 모델을 집는다
{
  const toml = 'model = "gpt-5.5-codex"\n'
  assert.equal(pickCodexImageModel({ configToml: toml, cacheJson: CACHE }), 'gpt-6.1-sol')
  ok('기본이 *-codex → 캐시의 첫 일반 모델')
}

// 3) 설정 파일이 없거나 model 줄이 없으면 캐시, 캐시도 없으면 null — 어느 경우에도 고정값은 안 나온다
{
  assert.equal(pickCodexImageModel({ configToml: null, cacheJson: CACHE }), 'gpt-6.1-sol')
  assert.equal(pickCodexImageModel({ configToml: 'approvals_reviewer = "user"\n', cacheJson: null }), null)
  assert.equal(pickCodexImageModel({ configToml: null, cacheJson: '{broken' }), null)
  const codexOnly = JSON.stringify({ models: [{ slug: 'gpt-5.5-codex', visibility: 'list' }] })
  assert.equal(pickCodexImageModel({ configToml: null, cacheJson: codexOnly }), null)
  ok('설정·캐시가 없거나 깨져도 터지지 않고 고정값도 없다')
}

// 4) 섹션 안의 model은 기본값이 아니다 — [profiles.x] 아래 줄에 속지 않는다
{
  const toml = '[profiles.fast]\nmodel = "gpt-5.5-codex"\n'
  assert.equal(defaultModelFromConfig(toml), null)
  assert.equal(defaultModelFromConfig('  model = "gpt-6-astra"  \n[tui]\nmodel = "other"\n'), 'gpt-6-astra')
  ok('최상위 model만 기본값으로 본다(섹션 안은 무시)')
}

// 5) 캐시 파싱 — list 우선·중복 제거·순서 유지, 전부 hide면 전부
{
  assert.deepEqual(listedModelsFromCache(CACHE), ['gpt-6.1-sol', 'gpt-6-astra'])
  const allHidden = JSON.stringify({ models: [{ slug: 'a', visibility: 'hide' }, { slug: 'b' }] })
  assert.deepEqual(listedModelsFromCache(allHidden), ['a', 'b'])
  assert.deepEqual(listedModelsFromCache('nope'), [])
  assert.equal(supportsImageTool('gpt-6.1-sol'), true)
  assert.equal(supportsImageTool('gpt-5.5-codex'), false)
  ok('모델 캐시 파싱(list 우선·중복 제거) + *-codex 판별')
}

// 6) 파일이 안 생겼을 때 사용자에게 보여 줄 한 줄 — codex가 stderr에 남긴 진짜 이유(실측 로그)
{
  const tail = [
    'OpenAI Codex v0.165.0\n--------\nworkdir: /tmp\nmodel: gpt-5.5',
    'hook: SessionStart\nhook: SessionStart Completed',
    "ERROR: The 'gpt-5.5' model is not supported when using Codex with a ChatGPT account.",
    ''
  ]
  const hint = cliHint({ code: 1, tail })
  assert.ok(hint.includes("'gpt-5.5' model is not supported"), `오류 줄이 빠졌다: ${hint}`)
  assert.ok(hint.endsWith('(code 1)'), `종료코드가 빠졌다: ${hint}`)
  assert.equal(cliHint({ code: 0, tail: ['hook: Stop', 'done'] }), 'done')
  assert.equal(cliHint({ code: 2, tail: [] }), 'code 2')
  assert.equal(cliHint({ code: 0, tail: [] }), '')
  assert.equal(cliHint(undefined), '')
  ok('cliHint: stderr의 오류 줄 + 종료코드, 없으면 마지막 줄/코드/빈 문자열')
}

console.log(`codexmodel: ${pass} passed`)
