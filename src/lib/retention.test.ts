import { describe, it, expect, afterAll } from 'vitest'
import { createSignedInMember, deleteUser, adminClient } from '@/test-helpers/users'
import { createCoachingRequest } from './requests'
import { expireOldRequestVideos } from './retention'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const { data } = await adminClient().from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}

describe('expireOldRequestVideos', () => {
  it('90일 지난 영상은 키를 비우고, 최근 영상은 유지한다', async () => {
    const m = await createSignedInMember(`ret_${Date.now()}@test.local`)
    created.push(m.id)
    const admin = adminClient()

    const oldReq = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: 'old', objectKey: `requests/${m.id}/old.mp4`,
    })
    const newReq = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: 'new', objectKey: `requests/${m.id}/new.mp4`,
    })
    const past = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000).toISOString()
    await admin.from('coaching_requests').update({ video_uploaded_at: past }).eq('id', oldReq.id)

    const deleted: string[] = []
    const count = await expireOldRequestVideos(admin, async (key) => { deleted.push(key) }, new Date())

    expect(count).toBe(1)
    expect(deleted).toContain(`requests/${m.id}/old.mp4`)

    const { data: oldAfter } = await admin.from('coaching_requests').select('video_object_key').eq('id', oldReq.id).single()
    const { data: newAfter } = await admin.from('coaching_requests').select('video_object_key').eq('id', newReq.id).single()
    expect(oldAfter!.video_object_key).toBeNull()
    expect(newAfter!.video_object_key).toBe(`requests/${m.id}/new.mp4`)
  })
})
