import { describe, it, expect } from 'vitest'
import { adminClient } from '@/test-helpers/users'
import { getMemberFacingAxisWithTags } from './classification'

describe('getMemberFacingAxisWithTags', () => {
  it('운동 종목 축과 6개 태그를 정렬해 반환한다', async () => {
    const result = await getMemberFacingAxisWithTags(adminClient())
    expect(result?.axis.name).toBe('운동 종목')
    expect(result?.tags.map((t) => t.label)).toEqual([
      '스쿼트', '데드리프트', '벤치프레스', '푸시업', '런지', '플랭크',
    ])
  })
})
