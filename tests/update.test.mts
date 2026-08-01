/**
 * 업데이트 확인 캐시(§9.1) — **왜 이 테스트가 있나.**
 *
 * 2026-08-01, 맥에서 v0.11.0·v0.12.0이 나왔는데도 앱이 끝내 조용했다. 알림 코드는 멀쩡했다.
 * 원인은 만료 없는 캐시였다 — 7/29에 "지금이 최신입니다"를 한 번 받아 두고, 창을 닫아도
 * 죽지 않는 맥 앱이 사흘간 같은 답만 되풀이했다. 그래서 여기서 시계를 손에 쥐고 확인한다.
 *
 * 네트워크를 타지 않는다(가짜 fetch). 실행: npx tsx tests/update.test.mts
 */
import assert from 'node:assert/strict'
import { UpdateService, type HttpFetch } from '../src/main/services/update'

let pass = 0
function ok(label: string): void {
  pass += 1
  console.log(`  ✓ ${label}`)
}

const HOUR = 60 * 60 * 1000

/** 태그 하나짜리 가짜 릴리스 — 호출 횟수를 세어 캐시가 도는지 본다. */
function fakeGithub(tag: string): { fetchImpl: HttpFetch; calls: () => number; setTag: (t: string) => void } {
  let current = tag
  let n = 0
  return {
    fetchImpl: async () => {
      n += 1
      return {
        ok: true,
        status: 200,
        json: async () => ({
          tag_name: current,
          published_at: '2026-08-01T05:16:15Z',
          body: '새 버전입니다',
          assets: [
            {
              name: `ICEFiction-${current.replace(/^v/, '')}.dmg`,
              browser_download_url: `https://example.test/${current}.dmg`,
              size: 1024
            }
          ]
        })
      }
    },
    calls: () => n,
    setTag: (t: string) => {
      current = t
    }
  }
}

// 1) 캐시가 도는지 — 만료 전에는 GitHub를 다시 두드리지 않는다
{
  const gh = fakeGithub('v0.12.0')
  let clock = 0
  const svc = new UpdateService({ fetchImpl: gh.fetchImpl, now: () => clock, ttlMs: 6 * HOUR })

  await svc.check('0.12.0', 'darwin')
  clock += 5 * HOUR
  const again = await svc.check('0.12.0', 'darwin')

  assert.equal(gh.calls(), 1, '만료 전에는 한 번만 물어야 한다')
  assert.equal(again.latest, '0.12.0')
  ok('만료 전 — 캐시된 답을 준다(GitHub 1회)')
}

// 2) ★회귀 방지 — 만료 뒤에는 다시 묻고, 그사이 나온 새 버전을 알아본다
{
  const gh = fakeGithub('v0.10.2')
  let clock = 0
  const svc = new UpdateService({ fetchImpl: gh.fetchImpl, now: () => clock, ttlMs: 6 * HOUR })

  const first = await svc.check('0.10.2', 'darwin')
  assert.equal(first.hasUpdate, false, '7/29 — 지금이 최신이다')

  gh.setTag('v0.12.0') // 그사이 릴리스가 나갔다
  clock += 7 * HOUR // 앱은 그대로 켜져 있다

  const second = await svc.check('0.10.2', 'darwin')
  assert.equal(gh.calls(), 2, '만료 뒤에는 다시 물어야 한다')
  assert.equal(second.hasUpdate, true, '새 버전을 알아채야 한다')
  assert.equal(second.latest, '0.12.0')
  assert.equal(second.url, 'https://example.test/v0.12.0.dmg', 'mac은 dmg로 보낸다')
  ok('만료 뒤 — 켜 둔 앱도 새 버전을 알아챈다(무기한 캐시 회귀 방지)')
}

// 3) 실패는 캐시하지 않는다 — 잠깐 끊겼다고 몇 시간을 조용히 있으면 안 된다
{
  let fail = true
  let n = 0
  const fetchImpl: HttpFetch = async () => {
    n += 1
    if (fail) throw new Error('네트워크 없음')
    return {
      ok: true,
      status: 200,
      json: async () => ({ tag_name: 'v0.12.0', assets: [] })
    }
  }
  let clock = 0
  const svc = new UpdateService({ fetchImpl, now: () => clock, ttlMs: 6 * HOUR })

  const offline = await svc.check('0.10.2', 'darwin')
  assert.equal(offline.checked, false, '실패는 checked:false — 아무것도 띄우지 않는다')
  assert.equal(offline.hasUpdate, false)

  fail = false
  clock += 60 * 1000 // 1분 뒤 인터넷이 돌아왔다
  const back = await svc.check('0.10.2', 'darwin')
  assert.equal(n, 2, '실패한 답을 붙들고 있으면 안 된다')
  assert.equal(back.hasUpdate, true)
  assert.equal(back.url, 'https://github.com/icenovel-rgb/ICEFiction/releases/latest', '받을 파일이 없으면 릴리스 페이지로')
  ok('실패는 캐시하지 않는다 — 돌아오면 바로 다시 묻는다')
}

// 4) GitHub가 200이 아닌 답을 줘도 조용히 넘어간다(집필을 막지 않는다)
{
  const fetchImpl: HttpFetch = async () => ({ ok: false, status: 403, json: async () => ({}) })
  const svc = new UpdateService({ fetchImpl, now: () => 0 })
  const res = await svc.check('0.10.2', 'darwin')
  assert.equal(res.checked, false)
  assert.equal(res.current, '0.10.2')
  ok('403(호출 제한)에도 예외 없이 조용히 넘어간다')
}

// 5) 플랫폼별로 받을 파일이 다르다 — 윈도우는 exe
{
  const gh = fakeGithub('v0.12.0')
  const svc = new UpdateService({ fetchImpl: gh.fetchImpl, now: () => 0 })
  const res = await svc.check('0.10.2', 'win32')
  assert.equal(res.url, 'https://github.com/icenovel-rgb/ICEFiction/releases/latest', 'exe가 없으면 릴리스 페이지')
  ok('윈도우 — dmg만 있는 릴리스면 페이지로 보낸다')
}

console.log(`\n업데이트 확인 테스트 ${pass}개 통과`)
