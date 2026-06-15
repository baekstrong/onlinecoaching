import { describe, it, expect } from 'vitest'
import { resolveRole } from './roles'

describe('resolveRole', () => {
  it('코치 이메일과 일치하면 coach', () => {
    expect(resolveRole('boss@x.com', 'boss@x.com')).toBe('coach')
  })

  it('대소문자/공백 무시하고 일치 판정', () => {
    expect(resolveRole('  Boss@X.com ', 'boss@x.com')).toBe('coach')
  })

  it('일치하지 않으면 member', () => {
    expect(resolveRole('user@x.com', 'boss@x.com')).toBe('member')
  })

  it('코치 이메일 미설정이면 member', () => {
    expect(resolveRole('user@x.com', undefined)).toBe('member')
  })
})
