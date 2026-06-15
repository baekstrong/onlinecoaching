'use server'

import { createClient } from '@/lib/supabase/server'
import { isCurrentUserCoach } from '@/lib/auth/coach'
import { addRequestClassification, removeRequestClassification } from '@/lib/request-classifications'
import { saveFeedbackDraft, publishFeedback, getFeedbackForRequest, addFeedbackAsset, removeFeedbackAsset } from '@/lib/feedback'
import { createTemplate, updateTemplate, deleteTemplate } from '@/lib/templates'
import { buildFeedbackImageKey, createPresignedUploadUrl } from '@/lib/storage/r2'

async function assertCoach() {
  const supabase = await createClient()
  if (!(await isCurrentUserCoach(supabase))) throw new Error('코치 권한이 필요합니다.')
  return supabase
}

/** (코치) 요청에 분류 태그 추가 */
export async function tagRequest(requestId: string, tagId: string): Promise<void> {
  const supabase = await assertCoach()
  await addRequestClassification(supabase, requestId, tagId)
}

/** (코치) 요청에서 분류 태그 제거 */
export async function untagRequest(requestId: string, tagId: string): Promise<void> {
  const supabase = await assertCoach()
  await removeRequestClassification(supabase, requestId, tagId)
}

/** (코치) 피드백 본문 저장(draft) */
export async function saveFeedback(requestId: string, text: string): Promise<{ id: string }> {
  const supabase = await assertCoach()
  const fb = await saveFeedbackDraft(supabase, requestId, text)
  return { id: fb.id }
}

/** (코치) 피드백 발행 */
export async function publishFeedbackAction(requestId: string): Promise<void> {
  const supabase = await assertCoach()
  const fb = await getFeedbackForRequest(supabase, requestId)
  if (!fb) throw new Error('저장된 피드백이 없습니다.')
  await publishFeedback(supabase, fb.id)
}

/** (코치) 피드백 이미지 업로드 URL 발급 */
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function requestFeedbackImageUpload(
  requestId: string,
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; objectKey: string }> {
  await assertCoach()
  // 안전한 래스터 이미지만 허용(image/svg+xml 등 스크립트 가능 형식 차단)
  if (!ALLOWED_IMAGE_TYPES.includes(contentType)) {
    throw new Error('JPG·PNG·GIF·WEBP 이미지만 업로드할 수 있습니다.')
  }
  const objectKey = buildFeedbackImageKey(requestId, filename)
  const uploadUrl = await createPresignedUploadUrl(objectKey, contentType)
  return { uploadUrl, objectKey }
}

/** (코치) 업로드된 이미지를 피드백에 첨부 */
export async function attachFeedbackImage(feedbackId: string, objectKey: string): Promise<void> {
  const supabase = await assertCoach()
  await addFeedbackAsset(supabase, feedbackId, objectKey)
}

/** (코치) 피드백 이미지 첨부 제거 */
export async function detachFeedbackImage(feedbackId: string, objectKey: string): Promise<void> {
  const supabase = await assertCoach()
  await removeFeedbackAsset(supabase, feedbackId, objectKey)
}

/** (코치) 템플릿 생성 */
export async function createTemplateAction(input: { title: string; category: string | null; text: string }): Promise<void> {
  const supabase = await assertCoach()
  const { data: { user } } = await supabase.auth.getUser()
  await createTemplate(supabase, user!.id, input)
}
/** (코치) 템플릿 수정 */
export async function updateTemplateAction(id: string, input: { title: string; category: string | null; text: string }): Promise<void> {
  const supabase = await assertCoach()
  await updateTemplate(supabase, id, input)
}
/** (코치) 템플릿 삭제 */
export async function deleteTemplateAction(id: string): Promise<void> {
  const supabase = await assertCoach()
  await deleteTemplate(supabase, id)
}
