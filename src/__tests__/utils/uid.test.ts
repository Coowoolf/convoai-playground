import { describe, it, expect } from 'vitest'

// 提取 UID 生成逻辑为独立函数
import { generateUids } from '@/utils/uid'

describe('UID Generation', () => {
  it('should generate different UIDs for user and agent', () => {
    // 运行 1000 次确保不会冲突
    for (let i = 0; i < 1000; i++) {
      const { userUid, agentUid } = generateUids()
      expect(userUid).not.toBe(agentUid)
    }
  })

  it('should generate UIDs within valid range', () => {
    const { userUid, agentUid } = generateUids()
    expect(userUid).toBeGreaterThanOrEqual(0)
    expect(userUid).toBeLessThan(100000)
    expect(agentUid).toBeGreaterThanOrEqual(0)
    expect(agentUid).toBeLessThan(100000)
  })
})
