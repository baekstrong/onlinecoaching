import { describe, it, expect, afterAll } from 'vitest'
import { adminClient, createSignedInMember, deleteUser } from '@/test-helpers/users'
import { createCoachingRequest, listMemberRequests } from './requests'

const created: string[] = []
afterAll(async () => { for (const id of created) await deleteUser(id) })

async function squatTagId(): Promise<string> {
  const admin = adminClient()
  const { data } = await admin.from('classification_tags').select('id').eq('label', '스쿼트').single()
  return data!.id as string
}

describe('createCoachingRequest', () => {
  it('영상키·메모·종목으로 요청을 만들고 분류를 연결한다', async () => {
    const m = await createSignedInMember(`req_a_${Date.now()}@test.local`)
    created.push(m.id)
    const objectKey = `requests/${m.id}/clip.mp4`
    const req = await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: '무릎이 아파요', objectKey,
    })
    expect(req.status).toBe('in_review')
    expect(req.video_object_key).toBe(objectKey)

    const admin = adminClient()
    const { count } = await admin
      .from('request_classifications').select('*', { count: 'exact', head: true }).eq('request_id', req.id)
    expect(count).toBe(1)
  })

  it('다른 사람 prefix의 영상키는 거부한다', async () => {
    const m = await createSignedInMember(`req_b_${Date.now()}@test.local`)
    created.push(m.id)
    await expect(
      createCoachingRequest(m.client, {
        memberId: m.id, tagId: await squatTagId(), note: 'x', objectKey: 'requests/someone-else/clip.mp4',
      }),
    ).rejects.toThrow()
  })
})

describe('listMemberRequests', () => {
  it('본인 요청만 최신순으로 반환한다', async () => {
    const m = await createSignedInMember(`req_c_${Date.now()}@test.local`)
    created.push(m.id)
    await createCoachingRequest(m.client, {
      memberId: m.id, tagId: await squatTagId(), note: '1', objectKey: `requests/${m.id}/a.mp4`,
    })
    const list = await listMemberRequests(m.client, m.id)
    expect(list.length).toBe(1)
    expect(list[0].member_note).toBe('1')
  })
})
