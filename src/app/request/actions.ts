'use server'

import { createClient } from '@/lib/supabase/server'
import { buildVideoObjectKey, createPresignedUploadUrl } from '@/lib/storage/r2'
import { createCoachingRequest } from '@/lib/requests'

/** 로그인한 회원에게 본인 prefix의 presigned 업로드 URL과 object key를 발급한다. */
export async function requestUploadUrl(
  filename: string,
  contentType: string,
): Promise<{ uploadUrl: string; objectKey: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  // 서버측 방어: 영상 MIME만 허용(클라이언트 검증 우회 방지)
  if (!contentType.startsWith('video/')) {
    throw new Error('영상 파일만 업로드할 수 있습니다.')
  }

  const objectKey = buildVideoObjectKey(user.id, filename)
  const uploadUrl = await createPresignedUploadUrl(objectKey, contentType)
  return { uploadUrl, objectKey }
}

/** 업로드된 영상 key로 코칭 요청을 생성한다. */
export async function submitCoachingRequest(input: {
  tagId: string
  note: string
  objectKey: string
}): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('로그인이 필요합니다.')

  const req = await createCoachingRequest(supabase, {
    memberId: user.id,
    tagId: input.tagId,
    note: input.note,
    objectKey: input.objectKey,
  })
  return { id: req.id }
}
