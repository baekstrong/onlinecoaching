import { describe, it, expect, beforeEach } from 'vitest'
import { sendFeedbackPublishedEmail } from './email'

describe('sendFeedbackPublishedEmail', () => {
  beforeEach(() => { delete process.env.RESEND_API_KEY })

  it('RESEND_API_KEY가 없으면 발송하지 않고 false를 반환한다', async () => {
    const sent = await sendFeedbackPublishedEmail('user@x.com', 'req-1')
    expect(sent).toBe(false)
  })
})
