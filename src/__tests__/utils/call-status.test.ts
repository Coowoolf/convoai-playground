import { describe, it, expect } from 'vitest'

// 测试通话状态流转
describe('Call Status Flow', () => {
  type Status = 'idle' | 'connecting' | 'connected' | 'talking' | 'error'

  // 状态机定义
  const validTransitions: Record<Status, Status[]> = {
    idle: ['connecting'],
    connecting: ['connected', 'error'],
    connected: ['talking', 'idle', 'error'],
    talking: ['connected', 'idle', 'error'],
    error: ['idle', 'connecting'],
  }

  function isValidTransition(from: Status, to: Status): boolean {
    return validTransitions[from]?.includes(to) ?? false
  }

  describe('Status Transitions', () => {
    it('should allow idle -> connecting', () => {
      expect(isValidTransition('idle', 'connecting')).toBe(true)
    })

    it('should not allow idle -> connected directly', () => {
      expect(isValidTransition('idle', 'connected')).toBe(false)
    })

    it('should allow connecting -> connected', () => {
      expect(isValidTransition('connecting', 'connected')).toBe(true)
    })

    it('should allow connecting -> error', () => {
      expect(isValidTransition('connecting', 'error')).toBe(true)
    })

    it('should allow error -> idle for retry', () => {
      expect(isValidTransition('error', 'idle')).toBe(true)
    })

    it('should allow connected -> idle for hang up', () => {
      expect(isValidTransition('connected', 'idle')).toBe(true)
    })
  })
})
