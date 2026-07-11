/**
 * SecretService — API 키를 OS 자격증명 저장소(safeStorage)로 암호화 저장(BLUEPRINT §7.4).
 * 키는 절대 프로젝트 폴더(=동기화 대상)에 두지 않는다. userData/secrets.json에 암호문(base64)으로.
 */
import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { writeFileAtomic } from '../lib/atomic'

async function userData(): Promise<string> {
  const { app } = await import('electron')
  return app.getPath('userData')
}

async function file(): Promise<string> {
  return join(await userData(), 'secrets.json')
}

async function readAll(): Promise<Record<string, string>> {
  try {
    return JSON.parse(await fs.readFile(await file(), 'utf8'))
  } catch {
    return {}
  }
}

export const secretService = {
  async setKey(name: string, value: string): Promise<void> {
    const { safeStorage } = await import('electron')
    const all = await readAll()
    if (value) {
      const enc = safeStorage.isEncryptionAvailable()
        ? safeStorage.encryptString(value).toString('base64')
        : `plain:${Buffer.from(value).toString('base64')}` // 암호화 불가 환경 폴백
      all[name] = enc
    } else {
      delete all[name]
    }
    await writeFileAtomic(await file(), JSON.stringify(all, null, 2))
  },

  async getKey(name: string): Promise<string> {
    const all = await readAll()
    const stored = all[name]
    if (!stored) return ''
    if (stored.startsWith('plain:')) return Buffer.from(stored.slice(6), 'base64').toString('utf8')
    const { safeStorage } = await import('electron')
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'))
    } catch {
      return ''
    }
  },

  async hasKey(name: string): Promise<boolean> {
    return !!(await readAll())[name]
  }
}
