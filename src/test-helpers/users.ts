import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const service = process.env.SUPABASE_SERVICE_ROLE_KEY!

export function adminClient(): SupabaseClient {
  return createClient(url, service, { auth: { persistSession: false } })
}

/** 확인된 회원 계정을 만들고, 그 회원으로 로그인된 클라이언트를 돌려준다. */
export async function createSignedInMember(
  email: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Passw0rd!123',
    email_confirm: true,
  })
  if (error) throw error
  const id = data.user.id
  await admin.from('profiles').upsert({ id, email, role: 'member' }, { onConflict: 'id' })
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: 'Passw0rd!123',
  })
  if (signInError) throw signInError
  return { id, client }
}

/** 테스트 회원 정리 */
export async function deleteUser(id: string): Promise<void> {
  const admin = adminClient()
  await admin.from('coaching_requests').delete().eq('member_id', id)
  await admin.auth.admin.deleteUser(id)
}

/** 확인된 코치 계정을 만들고, 그 코치로 로그인된 클라이언트를 돌려준다. */
export async function createSignedInCoach(
  email: string,
): Promise<{ id: string; client: SupabaseClient }> {
  const admin = adminClient()
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: 'Passw0rd!123',
    email_confirm: true,
  })
  if (error) throw error
  const id = data.user.id
  await admin.from('profiles').upsert({ id, email, role: 'coach' }, { onConflict: 'id' })
  const client = createClient(url, anon, { auth: { persistSession: false } })
  const { error: signInError } = await client.auth.signInWithPassword({
    email,
    password: 'Passw0rd!123',
  })
  if (signInError) throw signInError
  return { id, client }
}
