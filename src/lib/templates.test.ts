import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInCoach, createSignedInMember, deleteUser } from '@/test-helpers/users'
import { listTemplates, createTemplate, updateTemplate, deleteTemplate } from './templates'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

describe('템플릿 CRUD (코치)', () => {
  it('코치는 템플릿을 생성/수정/삭제하고 본인 것만 조회한다', async () => {
    const coach = await createSignedInCoach(`tpl_c_${Date.now()}@test.local`)
    created.push(coach.id)

    const t = await createTemplate(coach.client, coach.id, {
      title: '스쿼트 무릎', category: '스쿼트', text: '무릎이 안쪽으로 모입니다.',
    })
    expect(t.title).toBe('스쿼트 무릎')

    await updateTemplate(coach.client, t.id, { title: '스쿼트 무릎 교정', category: '스쿼트', text: '발끝 방향으로 무릎을 미세요.' })
    const list = await listTemplates(coach.client)
    expect(list.find((x) => x.id === t.id)?.title).toBe('스쿼트 무릎 교정')

    await deleteTemplate(coach.client, t.id)
    const after = await listTemplates(coach.client)
    expect(after.find((x) => x.id === t.id)).toBeUndefined()
  })

  it('회원은 템플릿을 만들 수 없다(RLS 차단)', async () => {
    const m = await createSignedInMember(`tpl_m_${Date.now()}@test.local`)
    created.push(m.id)
    await expect(
      createTemplate(m.client, m.id, { title: 'x', category: null, text: 'x' }),
    ).rejects.toThrow()
  })
})
