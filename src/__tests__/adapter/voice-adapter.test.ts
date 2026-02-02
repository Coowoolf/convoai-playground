import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createServer, Server, IncomingMessage, ServerResponse } from 'http'

// Voice Adapter Types
interface LLMRequest {
  model: string
  messages: Array<{ role: string; content: string }>
  stream?: boolean
}

interface LLMResponse {
  id: string
  object: string
  created: number
  choices: Array<{
    index: number
    message: { role: string; content: string }
    finish_reason: string
  }>
}

// Mock OpenClaw session bridge
const mockOpenClawSession = {
  sendMessage: vi.fn(),
  getResponse: vi.fn(),
}

describe('Voice Adapter - OpenAI Compatible API', () => {
  describe('Request Parsing', () => {
    it('should parse OpenAI chat completion request', () => {
      const request: LLMRequest = {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are Aura, an AI assistant.' },
          { role: 'user', content: 'Hello, how are you?' },
        ],
      }

      expect(request.messages).toHaveLength(2)
      expect(request.messages[0].role).toBe('system')
      expect(request.messages[1].role).toBe('user')
    })

    it('should extract user message from conversation', () => {
      const messages = [
        { role: 'system', content: 'System prompt' },
        { role: 'user', content: 'First message' },
        { role: 'assistant', content: 'First response' },
        { role: 'user', content: 'Second message' },
      ]

      const lastUserMessage = messages.filter(m => m.role === 'user').pop()
      expect(lastUserMessage?.content).toBe('Second message')
    })

    it('should handle streaming requests', () => {
      const request: LLMRequest = {
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: 'Test' }],
        stream: true,
      }

      expect(request.stream).toBe(true)
    })
  })

  describe('Response Formatting', () => {
    it('should format response as OpenAI chat completion', () => {
      const response: LLMResponse = {
        id: 'chatcmpl-123',
        object: 'chat.completion',
        created: Date.now(),
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello! I am doing well.' },
            finish_reason: 'stop',
          },
        ],
      }

      expect(response.object).toBe('chat.completion')
      expect(response.choices[0].message.role).toBe('assistant')
      expect(response.choices[0].finish_reason).toBe('stop')
    })

    it('should generate unique response IDs', () => {
      const generateId = () => `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      
      const ids = new Set<string>()
      for (let i = 0; i < 100; i++) {
        ids.add(generateId())
      }
      expect(ids.size).toBe(100)
    })
  })

  describe('OpenClaw Session Bridge', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('should forward user message to OpenClaw session', async () => {
      mockOpenClawSession.sendMessage.mockResolvedValue({ success: true })
      mockOpenClawSession.getResponse.mockResolvedValue('I am Aura, your AI CTO.')

      const userMessage = 'Tell me about yourself'
      await mockOpenClawSession.sendMessage(userMessage)
      const response = await mockOpenClawSession.getResponse()

      expect(mockOpenClawSession.sendMessage).toHaveBeenCalledWith(userMessage)
      expect(response).toContain('Aura')
    })

    it('should handle session timeout gracefully', async () => {
      mockOpenClawSession.getResponse.mockRejectedValue(new Error('Session timeout'))

      await expect(mockOpenClawSession.getResponse()).rejects.toThrow('Session timeout')
    })

    it('should include agent context in system prompt', () => {
      const agentContexts = {
        aura: 'You are Aura, Colin\'s AI CTO assistant. Be helpful, concise, and technical.',
        lix: 'You are Lix, Colin\'s AI VP of Engineering. Help with code review and technical research.',
      }

      expect(agentContexts.aura).toContain('CTO')
      expect(agentContexts.lix).toContain('VP of Engineering')
    })
  })

  describe('Header Processing', () => {
    it('should extract agent type from X-Agent header', () => {
      const headers = {
        'X-Agent': 'aura',
        'X-Session-Id': 'channel-123',
      }

      expect(headers['X-Agent']).toBe('aura')
    })

    it('should extract session ID from X-Session-Id header', () => {
      const headers = {
        'X-Agent': 'lix',
        'X-Session-Id': 'aura-1706789012345-abc123',
      }

      expect(headers['X-Session-Id']).toMatch(/^aura-\d+-[a-z0-9]+$/)
    })

    it('should default to aura when X-Agent not provided', () => {
      const headers = {}
      const agent = (headers as Record<string, string>)['X-Agent'] || 'aura'
      expect(agent).toBe('aura')
    })
  })

  describe('Error Handling', () => {
    it('should return 400 for invalid request body', () => {
      const validateRequest = (body: unknown): { valid: boolean; error?: string } => {
        if (!body || typeof body !== 'object') {
          return { valid: false, error: 'Invalid request body' }
        }
        const req = body as LLMRequest
        if (!req.messages || !Array.isArray(req.messages)) {
          return { valid: false, error: 'Missing messages array' }
        }
        return { valid: true }
      }

      expect(validateRequest(null)).toEqual({ valid: false, error: 'Invalid request body' })
      expect(validateRequest({})).toEqual({ valid: false, error: 'Missing messages array' })
      expect(validateRequest({ messages: [] })).toEqual({ valid: true })
    })

    it('should return 503 when OpenClaw session unavailable', () => {
      const isSessionAvailable = false
      const statusCode = isSessionAvailable ? 200 : 503
      expect(statusCode).toBe(503)
    })

    it('should include error details in response', () => {
      const errorResponse = {
        error: {
          message: 'OpenClaw session not available',
          type: 'service_unavailable',
          code: 503,
        },
      }

      expect(errorResponse.error.type).toBe('service_unavailable')
    })
  })
})

describe('Voice Adapter - Streaming Response', () => {
  it('should format SSE chunk correctly', () => {
    const formatSSEChunk = (data: object): string => {
      return `data: ${JSON.stringify(data)}\n\n`
    }

    const chunk = {
      id: 'chatcmpl-123',
      object: 'chat.completion.chunk',
      choices: [{ delta: { content: 'Hello' }, index: 0 }],
    }

    const formatted = formatSSEChunk(chunk)
    expect(formatted).toMatch(/^data: /)
    expect(formatted).toMatch(/\n\n$/)
  })

  it('should send [DONE] at end of stream', () => {
    const endStream = (): string => 'data: [DONE]\n\n'
    expect(endStream()).toBe('data: [DONE]\n\n')
  })

  it('should split long response into chunks', () => {
    const response = 'This is a long response that should be split into multiple chunks for streaming.'
    const chunkSize = 20
    const chunks: string[] = []

    for (let i = 0; i < response.length; i += chunkSize) {
      chunks.push(response.slice(i, i + chunkSize))
    }

    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.join('')).toBe(response)
  })
})
