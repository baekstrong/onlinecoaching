import { describe, it, expect } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
)

describe('분류 체계 시드', () => {
  it('축 4개가 존재한다', async () => {
    const { data } = await admin.from('classification_axes').select('name')
    expect(data?.map((a) => a.name).sort()).toEqual(
      ['문제 유형', '신체 부위', '운동 종목', '회원 수준'].sort(),
    )
  })

  it('운동 종목 축만 회원 노출이다', async () => {
    const { data } = await admin
      .from('classification_axes')
      .select('name, is_member_facing')
      .eq('is_member_facing', true)
    expect(data).toHaveLength(1)
    expect(data?.[0].name).toBe('운동 종목')
  })

  it('태그가 모든 축에 연결되어 있다', async () => {
    const { count } = await admin
      .from('classification_tags')
      .select('*', { count: 'exact', head: true })
    expect(count).toBe(19)
  })
})
