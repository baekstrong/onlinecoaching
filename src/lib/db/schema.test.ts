import { describe, it, expect, beforeAll } from 'vitest'
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

describe('DB 스키마', () => {
  let admin: ReturnType<typeof createClient>
  beforeAll(() => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false } })
  })

  it('핵심 테이블이 존재하고 select 가능하다', async () => {
    for (const table of [
      'profiles', 'classification_axes', 'classification_tags',
      'coaching_requests', 'request_classifications',
      'feedbacks', 'feedback_assets', 'feedback_templates', 'payments',
    ]) {
      const { error } = await admin.from(table).select('*').limit(1)
      expect(error, `${table} select 오류`).toBeNull()
    }
  })
})
