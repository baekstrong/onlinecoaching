import { requireCoachPage } from '../guard'
import { listTemplates } from '@/lib/templates'
import { TemplateManager } from './template-manager'

export default async function CoachTemplatesPage() {
  const supabase = await requireCoachPage()
  const templates = await listTemplates(supabase)
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-bold">피드백 템플릿</h1>
      <TemplateManager initialTemplates={templates} />
    </main>
  )
}
