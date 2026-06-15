import { describe, it, expect } from 'vitest'
import { greet } from './smoke'

describe('smoke', () => {
  it('테스트 러너가 동작한다', () => {
    expect(greet('coach')).toBe('Hello, coach')
  })
})
