import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, createSignedInCoach, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest, listAllRequests, getRequestDetail } from './requests'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}

describe('listAllRequests (코치)', () => {
  it('코치는 여러 회원의 요청을 모두 본다', async () => {
    const coach = await createSignedInCoach(`c_${Date.now()}@test.local`)
    created.push(coach.id)
    const m1 = await createSignedInMember(`m1_${Date.now()}@test.local`)
    created.push(m1.id)
    await createCoachingRequest(m1.client, {
      memberId: m1.id, tagId: await squatTagId(), note: 'm1', objectKey: `requests/${m1.id}/a.mp4`,
    })
    const all = await listAllRequests(coach.client)
    expect(all.some((r) => r.member_id === m1.id)).toBe(true)
  })

  it('상태 필터로 좁힐 수 있다', async () => {
    const coach = await createSignedInCoach(`c2_${Date.now()}@test.local`)
    created.push(coach.id)
    const inReview = await listAllRequests(coach.client, 'in_review')
    expect(inReview.every((r) => r.status === 'in_review')).toBe(true)
  })
})

describe('getRequestDetail (코치)', () => {
  it('코치는 임의 요청의 상세를 조회한다', async () => {
    const coach = await createSignedInCoach(`c3_${Date.now()}@test.local`)
    created.push(coach.id)
    const m = await createSignedInMember(`m3_${Date.now()}@test.local`)
    created.push(m.id)
    const req = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: '상세', objectKey: `requests/${m.id}/b.mp4`,
    })
    const detail = await getRequestDetail(coach.client, req.id)
    expect(detail?.member_note).toBe('상세')
    expect(detail?.video_object_key).toBe(`requests/${m.id}/b.mp4`)
  })
})
