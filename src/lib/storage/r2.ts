import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function r2Client(): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  })
}

/** 회원별 prefix 아래에 고유한 영상 object key를 만든다. 예: requests/<userId>/<uuid>.mp4 */
export function buildVideoObjectKey(userId: string, filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/)
  const ext = match ? match[1].toLowerCase() : 'mp4'
  return `requests/${userId}/${randomUUID()}.${ext}`
}

/** R2에 직접 업로드(PUT)할 수 있는 presigned URL을 만든다. */
export async function createPresignedUploadUrl(
  objectKey: string,
  contentType: string,
  expiresIn = 600,
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: objectKey,
    ContentType: contentType,
  })
  return getSignedUrl(r2Client(), command, { expiresIn })
}

/** R2 객체를 재생/다운로드할 수 있는 presigned GET URL을 만든다. */
export async function createPresignedDownloadUrl(
  objectKey: string,
  expiresIn = 3600,
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET!,
    Key: objectKey,
  })
  return getSignedUrl(r2Client(), command, { expiresIn })
}

/** 피드백 첨부 이미지용 R2 object key. 예: feedback/<requestId>/<uuid>.png */
export function buildFeedbackImageKey(requestId: string, filename: string): string {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/)
  const ext = match ? match[1].toLowerCase() : 'png'
  return `feedback/${requestId}/${randomUUID()}.${ext}`
}

/** R2 객체 삭제. */
export async function deleteObject(objectKey: string): Promise<void> {
  await r2Client().send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET!, Key: objectKey }))
}
