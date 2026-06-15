import { describe, it, expect, afterAll } from 'vitest'
import { adminClient, createSignedInMember, deleteUser } from '@/test-helpers/users'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function memberFacingTagId(): Promise<string> {
  const admin = adminClient()
  const { data: axis } = await admin
    .from('classification_axes').select('id').eq('is_member_facing', true).single()
  const { data: tag } = await admin
    .from('classification_tags').select('id').eq('axis_id', axis!.id).limit(1).single()
  return tag!.id as string
}

async function coachTagId(): Promise<string> {
  const admin = adminClient()
  const { data: axis } = await admin
    .from('classification_axes').select('id').eq('is_member_facing', false).limit(1).single()
  const { data: tag } = await admin
    .from('classification_tags').select('id').eq('axis_id', axis!.id).limit(1).single()
  return tag!.id as string
}

describe('회원 분류 삽입 RLS', () => {
  it('회원은 자기 요청에 회원 노출 태그를 달 수 있다', async () => {
    const m = await createSignedInMember(`rls_a_${Date.now()}@test.local`)
    created.push(m.id)
    const { data: req } = await m.client
      .from('coaching_requests').insert({ member_id: m.id, member_note: 't' }).select().single()
    const { error } = await m.client
      .from('request_classifications').insert({ request_id: req!.id, tag_id: await memberFacingTagId() })
    expect(error).toBeNull()
  })

  it('회원은 코치 전용 축 태그는 달 수 없다', async () => {
    const m = await createSignedInMember(`rls_b_${Date.now()}@test.local`)
    created.push(m.id)
    const { data: req } = await m.client
      .from('coaching_requests').insert({ member_id: m.id, member_note: 't' }).select().single()
    const { error } = await m.client
      .from('request_classifications').insert({ request_id: req!.id, tag_id: await coachTagId() })
    expect(error).not.toBeNull()
  })
})
