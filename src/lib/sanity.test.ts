import { describe, it, expect } from 'vitest'
import { greet } from './sanity'

describe('sanity', () => {
  it('테스트 러너가 동작한다', () => {
    expect(greet('coach')).toBe('Hello, coach')
  })
})
