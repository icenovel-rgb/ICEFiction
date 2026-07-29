/**
 * AI 어댑터 검증 — 에러 분류 + OpenAI 호환 스트리밍(로컬 가짜 서버로 왕복).
 * electron 불필요(어댑터는 fetch/SSE만 사용). 실행: npm run test:ai
 */
import assert from 'node:assert/strict'
import { createServer, type Server } from 'node:http'
import { AddressInfo } from 'node:net'
import { classifyError } from '../src/main/ai/errors'
import { OpenAICompatAI } from '../src/main/ai/openai'
import { CliAI } from '../src/main/ai/cli'
import { attachmentsToText, toAnthropicContent, toOpenAIContent } from '../src/main/ai/attachments'
import type { ChatMessage } from '../src/shared/types'

let pass = 0
const ok = (l: string): void => {
  pass += 1
  console.log(`  ✓ ${l}`)
}

const captured: { lastBody: unknown } = { lastBody: null }

function fakeServer(): Promise<{ base: string; close: () => void }> {
  return new Promise((resolve) => {
    const server: Server = createServer((req, res) => {
      if (req.method === 'GET' && req.url === '/v1/models') {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ data: [{ id: 'test' }] }))
        return
      }
      if (req.method === 'POST' && req.url === '/v1/chat/completions') {
        let body = ''
        req.on('data', (c) => (body += c))
        req.on('end', () => {
          const parsed = (() => {
            try {
              return JSON.parse(body)
            } catch {
              return {}
            }
          })()
          captured.lastBody = parsed
          const model = parsed.model ?? ''
          if (model === 'unauthorized') {
            res.writeHead(401, { 'content-type': 'application/json' })
            res.end(JSON.stringify({ error: { message: 'invalid api key' } }))
            return
          }
          res.writeHead(200, { 'content-type': 'text/event-stream' })
          for (const piece of ['비가 ', '쏟아지기 ', '시작했다.']) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`)
          }
          res.write('data: [DONE]\n\n')
          res.end()
        })
        return
      }
      res.writeHead(404).end()
    })
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as AddressInfo).port
      resolve({ base: `http://127.0.0.1:${port}/v1`, close: () => server.close() })
    })
  })
}

async function main(): Promise<void> {
  // 1) 에러 분류
  assert.equal(classifyError('401 Unauthorized invalid api key'), 'auth_expired')
  assert.equal(classifyError('429 too many requests'), 'rate_limited')
  assert.equal(classifyError('insufficient_quota: credit balance too low'), 'quota_exhausted')
  assert.equal(classifyError('ECONNREFUSED connection refused'), 'network')
  assert.equal(classifyError('그냥 평범한 텍스트'), 'other')
  ok('에러 분류(auth/rate/quota/network/other)')

  const { base, close } = await fakeServer()
  try {
    // 2) 연결 확인
    const ai = new OpenAICompatAI(base, 'test', '')
    const conn = await ai.checkConnection()
    assert.equal(conn.ok, true)
    ok('checkConnection → ok (/models 200)')

    // 3) 스트리밍 생성 — 델타 누적 + 최종 텍스트
    const deltas: string[] = []
    const full = await ai.generate(
      [{ role: 'user', content: '한 문장 써줘' }],
      (d) => deltas.push(d),
      new AbortController().signal
    )
    assert.equal(full, '비가 쏟아지기 시작했다.')
    assert.equal(deltas.length, 3)
    assert.equal(deltas.join(''), full)
    ok('generate 스트리밍 → 델타 3개 + 최종 텍스트 일치')

    // 4) 401 → auth_expired AIError
    const badAi = new OpenAICompatAI(base, 'unauthorized', '')
    await assert.rejects(
      () => badAi.generate([{ role: 'user', content: 'x' }], () => {}, new AbortController().signal),
      (e: Error & { kind?: string }) => e.kind === 'auth_expired'
    )
    ok('generate 401 → AIError(auth_expired)')

    // 5) 취소 — abort된 신호로 시작하면 cancelled
    const ctrl = new AbortController()
    ctrl.abort()
    await assert.rejects(
      () => ai.generate([{ role: 'user', content: 'x' }], () => {}, ctrl.signal),
      (e: Error & { kind?: string }) => e.kind === 'cancelled'
    )
    ok('사전 abort → AIError(cancelled)')

    // 6) 이미지 첨부 → OpenAI 호환 payload가 image_url(data URL) 파트를 포함(vision, §7.5)
    const imgMsg: ChatMessage = {
      role: 'user',
      content: '이 그림 설명해줘',
      attachments: [{ kind: 'image', name: 'face.png', path: 'assets/images/face.png', mediaType: 'image/png', dataBase64: 'QUJD' }]
    }
    await ai.generate([imgMsg], () => {}, new AbortController().signal)
    const sent = captured.lastBody as { messages: { content: unknown }[] }
    const parts = sent.messages[sent.messages.length - 1].content as Array<Record<string, any>>
    assert(Array.isArray(parts), 'content가 파트 배열이 아님')
    const imgPart = parts.find((p) => p.type === 'image_url')
    assert(imgPart, 'image_url 파트 없음')
    assert.equal(imgPart!.image_url.url, 'data:image/png;base64,QUJD')
    assert(parts.some((p) => p.type === 'text' && p.text === '이 그림 설명해줘'), '텍스트 파트 없음')
    ok('generate: 이미지 첨부 → image_url(data URL) 전송')
  } finally {
    close()
  }

  // 7) 첨부 확장 순수 함수 — OpenAI/Anthropic/CLI 계열별 변환
  const textMsg: ChatMessage = {
    role: 'user',
    content: '요약해줘',
    attachments: [{ kind: 'text', name: 'research.pdf', path: 'assets/refs/research.pdf', text: '핵심 내용' }]
  }
  const oa = toOpenAIContent(textMsg) as Array<Record<string, any>>
  assert(oa.some((p) => p.type === 'text' && p.text.includes('핵심 내용')), 'OpenAI 텍스트 첨부 누락')
  const an = toAnthropicContent(textMsg) as Array<Record<string, any>>
  assert(an.some((b) => b.type === 'text' && b.text.includes('research.pdf')), 'Anthropic 텍스트 첨부 누락')
  // 첨부 없으면 문자열 그대로(하위호환)
  assert.equal(toOpenAIContent({ role: 'user', content: '그냥' }), '그냥')
  // CLI 계열(agy·codex·claude)은 이미지를 프롬프트로 못 받지만 **파일은 직접 열 수 있다** —
  // 그래서 "못 본다"가 아니라 경로를 주고 열어 보라고 시킨다. 텍스트 첨부는 그대로 인라인.
  const cliImg = attachmentsToText({
    role: 'user',
    content: '봐줘',
    attachments: [{ kind: 'image', name: 'a.png', path: 'assets/images/a.png' }]
  })
  assert(cliImg.includes('a.png'), 'CLI 이미지 안내에 파일 이름 없음')
  assert(cliImg.includes('assets/images/a.png'), 'CLI 이미지 안내에 경로 없음 — 열어볼 수가 없다')
  assert(cliImg.includes('열어'), `CLI 이미지 안내가 파일을 열라고 하지 않음: ${cliImg}`)
  // 절대경로가 있으면 그걸 준다(실제 운영 경로 — CLI의 작업 폴더가 프로젝트 밖일 수 있다)
  const cliImgAbs = attachmentsToText({
    role: 'user',
    content: '봐줘',
    attachments: [
      { kind: 'image', name: 'a.png', path: 'assets/images/a.png', absPath: '/tmp/book/a.png' }
    ]
  })
  assert(cliImgAbs.includes('/tmp/book/a.png'), 'absPath가 있으면 절대경로를 줘야 한다')
  const cliTxt = attachmentsToText(textMsg)
  assert(cliTxt.includes('핵심 내용'), 'CLI 텍스트 첨부 인라인 누락')
  ok('첨부 변환: OpenAI(image_url·text) · Anthropic(image·text) · CLI(경로 안내·텍스트 인라인)')

  // 8) CLI flavor 감지 — 명령어로 claude/codex/generic 구분(실제 실행 없이 이름·모델목록만)
  assert(new CliAI('claude').name.toLowerCase().includes('claude'), 'claude flavor 이름')
  assert(new CliAI('codex').name.includes('Codex'), 'codex flavor 이름')
  assert(new CliAI('mycli').name.includes('mycli'), 'generic flavor 이름')
  assert.deepEqual(await new CliAI('claude').listModels(), ['sonnet', 'opus', 'fable'])
  const codexList = await new CliAI('codex').listModels() // 로컬 ~/.codex/models_cache.json에서 읽음
  assert(Array.isArray(codexList), 'codex 모델 목록은 배열(캐시 없으면 빈 배열)')
  assert.deepEqual(await new CliAI('mycli').listModels(), []) // generic은 기본 모델 사용
  ok('CLI 어댑터: flavor 감지(claude·codex·generic) + 모델 목록')

  console.log(`\n✅ AI 어댑터: ${pass}개 검증 통과`)
}

main().catch((err) => {
  console.error('❌ 실패:', err)
  process.exit(1)
})
