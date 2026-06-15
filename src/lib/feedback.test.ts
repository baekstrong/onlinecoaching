import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInCoach, createSignedInMember, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest } from './requests'
import {
  saveFeedbackDraft, getFeedbackForRequest, publishFeedback,
  addFeedbackAsset, listFeedbackAssets, removeFeedbackAsset,
} from './feedback'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}
async function seedRequest() {
  const m = await createSignedInMember(`fb_m_${Date.now()}_${Math.round(performance.now())}@test.local`)
  created.push(m.id)
  return createCoachingRequest(m.client, {
    memberId: m.id, tagId: await squatTagId(), note: 'x', objectKey: `requests/${m.id}/v.mp4`,
  })
}

describe('피드백 도메인 (코치)', () => {
  it('draft 저장(upsert)·조회·발행', async () => {
    const coach = await createSignedInCoach(`fb_c_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()

    const fb = await saveFeedbackDraft(coach.client, req.id, '자세가 좋습니다.')
    expect(fb.text).toBe('자세가 좋습니다.')
    expect(fb.published_at).toBeNull()

    const fb2 = await saveFeedbackDraft(coach.client, req.id, '무릎을 더 벌리세요.')
    expect(fb2.id).toBe(fb.id)
    expect(fb2.text).toBe('무릎을 더 벌리세요.')

    await publishFeedback(coach.client, fb.id)
    const got = await getFeedbackForRequest(coach.client, req.id)
    expect(got?.published_at).not.toBeNull()
  })

  it('이미지 자산 추가/조회/삭제', async () => {
    const coach = await createSignedInCoach(`fb_c2_${Date.now()}@test.local`)
    created.push(coach.id)
    const req = await seedRequest()
    const fb = await saveFeedbackDraft(coach.client, req.id, '본문')

    await addFeedbackAsset(coach.client, fb.id, `feedback/${req.id}/a.png`)
    let assets = await listFeedbackAssets(coach.client, fb.id)
    expect(assets.map((a) => a.object_key)).toContain(`feedback/${req.id}/a.png`)

    await removeFeedbackAsset(coach.client, fb.id, `feedback/${req.id}/a.png`)
    assets = await listFeedbackAssets(coach.client, fb.id)
    expect(assets.length).toBe(0)
  })
})
