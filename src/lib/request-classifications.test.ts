import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, createSignedInCoach, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest } from './requests'
import {
  getRequestClassifications,
  addRequestClassification,
  removeRequestClassification,
} from './request-classifications'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}
async function problemTagId(): Promise<string> {
  const admin = adminClient()
  const { data: axis } = await admin.from('classification_axes').select('id').eq('name', '문제 유형').single()
  const { data } = await admin.from('classification_tags').select('id').eq('axis_id', axis!.id).limit(1).single()
  return data!.id as string
}

async function seedRequest() {
  const m = await createSignedInMember(`rc_m_${Date.now()}_${Math.round(performance.now())}@test.local`)
  created.push(m.id)
  const req = await createCoachingRequest(m.client, {
    memberId: m.id, tagId: await squatTagId(), note: 'x', objectKey: `requests/${m.id}/v.mp4`,
  })
  return req
}

describe('요청 분류 CRUD (코치)', () => {
  it('코치는 임의 요청에 코치 전용 축 태그를 추가/삭제한다', async () => {
    const coach = await createSignedInCoach(`rc_c_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()
    const tag = await problemTagId()

    await addRequestClassification(coach.client, req.id, tag)
    let tags = await getRequestClassifications(coach.client, req.id)
    expect(tags.map((t) => t.tag_id)).toContain(tag)

    await removeRequestClassification(coach.client, req.id, tag)
    tags = await getRequestClassifications(coach.client, req.id)
    expect(tags.map((t) => t.tag_id)).not.toContain(tag)
  })

  it('회원이 만든 종목 태그도 코치가 조회한다', async () => {
    const coach = await createSignedInCoach(`rc_c2_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()
    const tags = await getRequestClassifications(coach.client, req.id)
    expect(tags.length).toBeGreaterThanOrEqual(1) // 신청 시 단 종목 태그
  })
})
