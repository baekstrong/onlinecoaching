/** 피드백 발행 알림 이메일. RESEND_API_KEY 미설정 시 no-op(false). 성공 시 true. */
export async function sendFeedbackPublishedEmail(to: string, requestId: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.warn('RESEND_API_KEY 미설정 — 이메일 알림을 건너뜁니다.')
    return false
  }
  const { Resend } = await import('resend')
  const resend = new Resend(apiKey)
  const base = process.env.APP_URL ?? ''
  const link = `${base}/requests/${requestId}`
  await resend.emails.send({
    from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
    to,
    subject: '코칭 피드백이 도착했습니다',
    html: `<p>요청하신 운동 코칭 피드백이 발행되었습니다.</p><p><a href="${link}">피드백 보러 가기</a></p>`,
  })
  return true
}
