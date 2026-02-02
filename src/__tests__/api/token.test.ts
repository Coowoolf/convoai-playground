import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock environment variables
vi.stubEnv('AGORA_APP_ID', 'test-app-id')
vi.stubEnv('AGORA_APP_CERTIFICATE', 'test-app-cert')

// Mock the agora-token module
vi.mock('@/lib/agora-token', () => ({
  generateRtcToken: vi.fn(() => 'mock-token-12345'),
  getAppId: vi.fn((platform: string) => platform === 'agora' ? 'test-app-id' : 'test-shengwang-id'),
}))

// Import after mocking
import { POST } from '@/app/api/token/route'

describe('Token API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('POST /api/token', () => {
    it('should return 400 when channelName is missing', async () => {
      const request = new NextRequest('http://localhost/api/token', {
        method: 'POST',
        body: JSON.stringify({ uid: 12345 }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing channelName or uid')
    })

    it('should return 400 when uid is missing', async () => {
      const request = new NextRequest('http://localhost/api/token', {
        method: 'POST',
        body: JSON.stringify({ channelName: 'test-channel' }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data.error).toBe('Missing channelName or uid')
    })

    it('should generate token successfully for agora platform', async () => {
      const request = new NextRequest('http://localhost/api/token', {
        method: 'POST',
        body: JSON.stringify({
          channelName: 'test-channel',
          uid: 12345,
          platform: 'agora',
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.token).toBe('mock-token-12345')
      expect(data.appId).toBe('test-app-id')
      expect(data.channelName).toBe('test-channel')
      expect(data.uid).toBe(12345)
      expect(data.platform).toBe('agora')
    })

    it('should use default platform when not specified', async () => {
      vi.stubEnv('SHENGWANG_APP_ID', 'sw-app-id')
      vi.stubEnv('SHENGWANG_APP_CERTIFICATE', 'sw-cert')

      const request = new NextRequest('http://localhost/api/token', {
        method: 'POST',
        body: JSON.stringify({
          channelName: 'test-channel',
          uid: 99999,
        }),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.platform).toBe('shengwang')
    })
  })
})
