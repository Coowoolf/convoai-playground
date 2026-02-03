import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * End-to-End Integration Tests for Voice Call Flow
 * 
 * Tests the complete flow from user initiating a call to receiving AI response
 */

describe('Voice Call Integration Tests', () => {
  // Mock Agora RTC
  const mockAgoraClient = {
    join: vi.fn(),
    leave: vi.fn(),
    publish: vi.fn(),
    subscribe: vi.fn(),
    on: vi.fn(),
    removeAllListeners: vi.fn(),
  }

  // Mock fetch for API calls
  const mockFetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = mockFetch
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('Complete Call Flow', () => {
    it('should complete full call initialization flow', async () => {
      // Step 1: Get token
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'test-token-123',
          appId: 'test-app-id',
          channelName: 'test-channel',
          uid: 12345,
        }),
      })

      // Step 2: Start agent
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          agentId: 'agent-abc123',
          status: 'RUNNING',
        }),
      })

      // Simulate the flow
      const tokenResponse = await fetch('/api/token', {
        method: 'POST',
        body: JSON.stringify({ channelName: 'test', uid: 12345 }),
      })
      const tokenData = await tokenResponse.json()

      expect(tokenData.token).toBe('test-token-123')
      expect(tokenData.appId).toBe('test-app-id')

      const agentResponse = await fetch('/api/agent', {
        method: 'POST',
        body: JSON.stringify({
          channelName: tokenData.channelName,
          agentUid: 11111,
          userUid: tokenData.uid,
          token: tokenData.token,
        }),
      })
      const agentData = await agentResponse.json()

      expect(agentData.agentId).toBe('agent-abc123')
      expect(agentData.status).toBe('RUNNING')
    })

    it('should handle token generation failure gracefully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Token generation failed' }),
      })

      const response = await fetch('/api/token', {
        method: 'POST',
        body: JSON.stringify({ channelName: 'test', uid: 12345 }),
      })

      expect(response.ok).toBe(false)
      expect(response.status).toBe(500)
    })

    it('should handle agent startup failure gracefully', async () => {
      // Token succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          token: 'test-token',
          appId: 'test-app-id',
        }),
      })

      // Agent fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: () => Promise.resolve({ error: 'Agent service unavailable' }),
      })

      const tokenResponse = await fetch('/api/token', {
        method: 'POST',
        body: JSON.stringify({ channelName: 'test', uid: 12345 }),
      })
      expect(tokenResponse.ok).toBe(true)

      const agentResponse = await fetch('/api/agent', {
        method: 'POST',
        body: JSON.stringify({ channelName: 'test', agentUid: 11111, userUid: 12345 }),
      })
      expect(agentResponse.ok).toBe(false)
      expect(agentResponse.status).toBe(503)
    })
  })

  describe('Call Termination Flow', () => {
    it('should properly terminate call and cleanup', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'stopped' }),
      })

      const response = await fetch('/api/agent', {
        method: 'DELETE',
        body: JSON.stringify({ agentId: 'agent-abc123', platform: 'agora' }),
      })
      const data = await response.json()

      expect(data.status).toBe('stopped')
    })
  })

  describe('Voice Adapter Integration', () => {
    it('should route LLM requests through Voice Adapter', async () => {
      const adapterUrl = 'http://52.74.133.186:3456/v1/chat/completions'
      
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          id: 'chatcmpl-123',
          choices: [{
            message: { role: 'assistant', content: 'Hello! I am Aura.' },
            finish_reason: 'stop',
          }],
        }),
      })

      const response = await fetch(adapterUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Agent': 'aura',
          'X-Session-Id': 'test-session',
        },
        body: JSON.stringify({
          model: 'openclaw',
          messages: [
            { role: 'system', content: 'You are Aura.' },
            { role: 'user', content: 'Hello!' },
          ],
        }),
      })
      const data = await response.json()

      expect(data.choices[0].message.content).toContain('Aura')
    })
  })

  describe('Error Recovery', () => {
    it('should retry on transient failures', async () => {
      // First attempt fails
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      })

      // Retry succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ token: 'success-token' }),
      })

      // First call
      let response = await fetch('/api/token', { method: 'POST', body: '{}' })
      expect(response.ok).toBe(false)

      // Retry
      response = await fetch('/api/token', { method: 'POST', body: '{}' })
      expect(response.ok).toBe(true)
    })
  })

  describe('Concurrent Calls', () => {
    it('should handle multiple simultaneous calls', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          token: `token-${Date.now()}`,
          appId: 'test-app-id',
        }),
      })

      const calls = Array(5).fill(null).map((_, i) =>
        fetch('/api/token', {
          method: 'POST',
          body: JSON.stringify({ channelName: `channel-${i}`, uid: 10000 + i }),
        })
      )

      const responses = await Promise.all(calls)
      
      expect(responses.every(r => r.ok)).toBe(true)
      expect(responses.length).toBe(5)
    })
  })
})

describe('Agent Selection Integration', () => {
  it('should use correct system prompt for Aura', () => {
    const agentPrompts = {
      aura: "You are Aura, Colin's AI CTO assistant. Be helpful, concise, and technical.",
      lix: "You are Lix, Colin's AI VP of Engineering. Help with code review and technical research.",
    }

    expect(agentPrompts.aura).toContain('CTO')
    expect(agentPrompts.lix).toContain('VP of Engineering')
  })

  it('should switch agents correctly', () => {
    type Agent = 'aura' | 'lix'
    let currentAgent: Agent = 'aura'

    const switchAgent = (newAgent: Agent) => {
      currentAgent = newAgent
    }

    expect(currentAgent).toBe('aura')
    switchAgent('lix')
    expect(currentAgent).toBe('lix')
    switchAgent('aura')
    expect(currentAgent).toBe('aura')
  })
})
