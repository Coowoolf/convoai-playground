import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// 提取密码验证逻辑为独立函数
import { validatePassword, isPasswordConfigured } from '@/utils/password'

describe('Password Validation', () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.resetModules()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('isPasswordConfigured', () => {
    it('should return false when password is not configured', () => {
      delete process.env.NEXT_PUBLIC_VOICE_PASSWORD
      expect(isPasswordConfigured()).toBe(false)
    })

    it('should return true when password is configured', () => {
      process.env.NEXT_PUBLIC_VOICE_PASSWORD = 'test123'
      expect(isPasswordConfigured()).toBe(true)
    })

    it('should return false for empty string password', () => {
      process.env.NEXT_PUBLIC_VOICE_PASSWORD = ''
      expect(isPasswordConfigured()).toBe(false)
    })
  })

  describe('validatePassword', () => {
    it('should return true for correct password', () => {
      process.env.NEXT_PUBLIC_VOICE_PASSWORD = 'secret123'
      expect(validatePassword('secret123')).toBe(true)
    })

    it('should return false for incorrect password', () => {
      process.env.NEXT_PUBLIC_VOICE_PASSWORD = 'secret123'
      expect(validatePassword('wrongpass')).toBe(false)
    })

    it('should return false when password not configured', () => {
      delete process.env.NEXT_PUBLIC_VOICE_PASSWORD
      expect(validatePassword('anypass')).toBe(false)
    })
  })
})
