import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, createSignedInCoach, deleteUser } from '@/test-helpers/users'
import { getCurrentRole, isCurrentUserCoach } from './coach'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

describe('getCurrentRole / isCurrentUserCoach', () => {
  it('코치 계정은 coach로 판정된다', async () => {
    const c = await createSignedInCoach(`coach_${Date.now()}@test.local`)
    created.push(c.id)
    expect(await getCurrentRole(c.client)).toBe('coach')
    expect(await isCurrentUserCoach(c.client)).toBe(true)
  })

  it('회원 계정은 coach가 아니다', async () => {
    const m = await createSignedInMember(`mem_${Date.now()}@test.local`)
    created.push(m.id)
    expect(await getCurrentRole(m.client)).toBe('member')
    expect(await isCurrentUserCoach(m.client)).toBe(false)
  })
})
