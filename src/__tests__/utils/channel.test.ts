import { describe, it, expect } from 'vitest'

describe('Channel Name Generation', () => {
  function generateChannelName(prefix: string = 'aura'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }

  it('should generate unique channel names', () => {
    const names = new Set<string>()
    for (let i = 0; i < 100; i++) {
      names.add(generateChannelName())
    }
    expect(names.size).toBe(100)
  })

  it('should start with prefix', () => {
    const name = generateChannelName('test')
    expect(name.startsWith('test-')).toBe(true)
  })

  it('should contain timestamp', () => {
    const before = Date.now()
    const name = generateChannelName()
    const after = Date.now()
    
    const parts = name.split('-')
    const timestamp = parseInt(parts[1])
    
    expect(timestamp).toBeGreaterThanOrEqual(before)
    expect(timestamp).toBeLessThanOrEqual(after)
  })

  it('should have random suffix', () => {
    const name = generateChannelName()
    const parts = name.split('-')
    expect(parts[2]).toMatch(/^[a-z0-9]{6}$/)
  })
})
