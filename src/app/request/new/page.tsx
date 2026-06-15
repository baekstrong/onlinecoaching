import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getMemberFacingAxisWithTags } from '@/lib/classification'
import { RequestForm } from './request-form'

export default async function NewRequestPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const axis = await getMemberFacingAxisWithTags(supabase)

  return (
    <main className="mx-auto flex max-w-lg flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">코칭 신청</h1>
      <RequestForm
        axisName={axis?.axis.name ?? '운동 종목'}
        tags={axis?.tags ?? []}
      />
    </main>
  )
}
