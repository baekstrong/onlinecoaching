import { describe, it, expect } from 'vitest'
import { buildVideoObjectKey, createPresignedUploadUrl, createPresignedDownloadUrl, buildFeedbackImageKey } from './r2'

describe('buildVideoObjectKey', () => {
  it('회원 prefix 아래 확장자를 보존한 고유 키를 만든다', () => {
    const key = buildVideoObjectKey('user-123', 'squat.MP4')
    expect(key.startsWith('requests/user-123/')).toBe(true)
    expect(key.endsWith('.mp4')).toBe(true)
  })

  it('확장자가 없으면 mp4로 기본 처리한다', () => {
    const key = buildVideoObjectKey('u1', 'clip')
    expect(key.endsWith('.mp4')).toBe(true)
  })

  it('호출마다 다른 키를 만든다', () => {
    const a = buildVideoObjectKey('u1', 'a.mp4')
    const b = buildVideoObjectKey('u1', 'a.mp4')
    expect(a).not.toBe(b)
  })
})

describe('createPresignedUploadUrl', () => {
  it('버킷·키·서명이 포함된 PUT용 서명 URL을 반환한다', async () => {
    const key = 'requests/u1/abc.mp4'
    const url = await createPresignedUploadUrl(key, 'video/mp4')
    expect(url).toContain('coaching-videos')
    expect(url).toContain('requests/u1/abc.mp4')
    expect(url).toContain('X-Amz-Signature')
  })
})

describe('createPresignedDownloadUrl', () => {
  it('버킷·키·서명이 포함된 GET용 서명 URL을 반환한다', async () => {
    const url = await createPresignedDownloadUrl('requests/u1/abc.mp4')
    expect(url).toContain('coaching-videos')
    expect(url).toContain('requests/u1/abc.mp4')
    expect(url).toContain('X-Amz-Signature')
  })
})

describe('buildFeedbackImageKey', () => {
  it('feedback prefix 아래 요청별 확장자 보존 고유 키를 만든다', () => {
    const key = buildFeedbackImageKey('req-1', 'diagram.PNG')
    expect(key.startsWith('feedback/req-1/')).toBe(true)
    expect(key.endsWith('.png')).toBe(true)
  })
  it('호출마다 다른 키', () => {
    expect(buildFeedbackImageKey('r', 'a.png')).not.toBe(buildFeedbackImageKey('r', 'a.png'))
  })
})
