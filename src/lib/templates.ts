import type { SupabaseClient } from '@supabase/supabase-js'

export type FeedbackTemplate = {
  id: string
  coach_id: string
  title: string
  category: string | null
  text: string
}

type TemplateInput = { title: string; category: string | null; text: string }

function toRow(t: { id: string; coach_id: string; title: string; category: string | null; body_rich: { text?: string } | null }): FeedbackTemplate {
  return { id: t.id, coach_id: t.coach_id, title: t.title, category: t.category, text: t.body_rich?.text ?? '' }
}

/** (코치) 본인 템플릿 목록(최신순). RLS가 본인 것만 노출. */
export async function listTemplates(supabase: SupabaseClient): Promise<FeedbackTemplate[]> {
  const { data, error } = await supabase
    .from('feedback_templates')
    .select('id, coach_id, title, category, body_rich')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(toRow)
}

/** (코치) 템플릿 생성. coach_id는 호출자(코치)의 id. */
export async function createTemplate(
  supabase: SupabaseClient,
  coachId: string,
  input: TemplateInput,
): Promise<FeedbackTemplate> {
  const { data, error } = await supabase
    .from('feedback_templates')
    .insert({ coach_id: coachId, title: input.title, category: input.category, body_rich: { text: input.text } })
    .select('id, coach_id, title, category, body_rich')
    .single()
  if (error || !data) throw new Error(error?.message ?? '템플릿 생성 실패')
  return toRow(data)
}

/** (코치) 템플릿 수정. */
export async function updateTemplate(
  supabase: SupabaseClient,
  templateId: string,
  input: TemplateInput,
): Promise<void> {
  const { error } = await supabase
    .from('feedback_templates')
    .update({ title: input.title, category: input.category, body_rich: { text: input.text } })
    .eq('id', templateId)
  if (error) throw new Error(error.message)
}

/** (코치) 템플릿 삭제. */
export async function deleteTemplate(supabase: SupabaseClient, templateId: string): Promise<void> {
  const { error } = await supabase.from('feedback_templates').delete().eq('id', templateId)
  if (error) throw new Error(error.message)
}
