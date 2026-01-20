import { NextResponse } from 'next/server'

// 测试端点：使用正确的 TTS JSON 结构
export async function GET() {
    const appId = process.env.AGORA_APP_ID || ''
    const customerId = process.env.AGORA_CUSTOMER_ID || ''
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET || ''
    const llmUrl = (process.env.LLM_URL || '').trim()
    const llmApiKey = (process.env.LLM_API_KEY || '').trim()
    const llmModel = (process.env.LLM_MODEL || 'qwen-turbo').trim()
    const elevenLabsKey = (process.env.ELEVENLABS_API_KEY || '').trim()

    const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64')
    const authHeader = `Basic ${credentials}`
    const apiUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`

    // 正确的 TTS 结构：直接 tts.vendor + tts.params，而非 tts.provider.vendor
    const requestBody = {
        name: `test-11labs-${Date.now()}`,
        properties: {
            channel: `test-ch-11labs-${Date.now()}`,
            agent_rtc_uid: '12345',
            remote_rtc_uids: ['67890'],
            enable_string_uid: false,
            idle_timeout: 120,
            advanced_features: {
                enable_aivad: true,
                enable_bhvs: true,
            },
            asr: {
                language: 'zh-CN',
                vendor: 'microsoft',  // 直接使用 vendor，不是 provider.vendor
                params: {
                    sample_rate: 16000,
                },
            },
            llm: {
                url: llmUrl,
                api_key: llmApiKey,
                model: llmModel,
                system_messages: [
                    {
                        role: 'system',
                        content: '你是一个友好的AI语音助手。',
                    },
                ],
                params: {
                    temperature: 0.7,
                    max_tokens: 500,
                },
            },
            tts: {
                vendor: 'elevenlabs',  // 直接使用 vendor，不是 provider.vendor
                params: {
                    base_url: 'wss://api.elevenlabs.io/v1',
                    key: elevenLabsKey,
                    model_id: 'eleven_flash_v2_5',
                    voice_id: '21m00Tcm4TlvDq8ikWAM',
                    sample_rate: 24000,
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            },
        },
    }

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
            body: JSON.stringify(requestBody),
        })

        const responseText = await response.text()
        let responseData
        try {
            responseData = JSON.parse(responseText)
        } catch {
            responseData = { rawText: responseText }
        }

        // 掩码敏感信息
        const mask = (s: string) => s ? `${s.slice(0, 6)}...(len:${s.length})` : '[EMPTY]'

        return NextResponse.json({
            status: 'test_complete',
            tts_structure: 'tts.vendor + tts.params (NOT tts.provider)',
            envCheck: {
                AGORA_APP_ID: mask(appId),
                LLM_URL: mask(llmUrl),
                LLM_API_KEY: mask(llmApiKey),
                LLM_MODEL: llmModel,
                ELEVENLABS_API_KEY: mask(elevenLabsKey),
            },
            response: {
                status: response.status,
                statusText: response.statusText,
                data: responseData,
            },
        })
    } catch (error) {
        return NextResponse.json({
            status: 'error',
            error: String(error),
        }, { status: 500 })
    }
}
