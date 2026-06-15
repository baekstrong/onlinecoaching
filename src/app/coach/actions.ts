'use server'

import { createClient } from '@/lib/supabase/server'
import { isCurrentUserCoach } from '@/lib/auth/coach'
import { getRequestDetail } from '@/lib/requests'
import { addRequestClassification, removeRequestClassification } from '@/lib/request-classifications'
import { createPresignedDownloadUrl } from '@/lib/storage/r2'

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

/** (코치) 요청 영상의 재생용 presigned URL */
export async function getRequestVideoUrl(requestId: string): Promise<string | null> {
  const supabase = await assertCoach()
  const req = await getRequestDetail(supabase, requestId)
  if (!req?.video_object_key) return null
  return createPresignedDownloadUrl(req.video_object_key)
}
