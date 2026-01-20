import { NextResponse } from 'next/server'

// 测试端点：使用 Minimax TTS
export async function GET() {
    const appId = process.env.AGORA_APP_ID || ''
    const customerId = process.env.AGORA_CUSTOMER_ID || ''
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET || ''
    const llmUrl = (process.env.LLM_URL || '').trim()
    const llmApiKey = (process.env.LLM_API_KEY || '').trim()
    const llmModel = (process.env.LLM_MODEL || 'qwen-turbo').trim()
    const minimaxApiKey = (process.env.MINIMAX_API_KEY || '').trim()
    const minimaxGroupId = (process.env.MINIMAX_GROUP_ID || '').trim()

    const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64')
    const authHeader = `Basic ${credentials}`
    const apiUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`

    // 构建完整请求体 - 使用 Minimax TTS (按 Agora 文档格式)
    const requestBody = {
        name: `test-mmax-${Date.now()}`,
        properties: {
            channel: `test-ch-mmax-${Date.now()}`,
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
                provider: {
                    vendor: 'microsoft',
                    params: {
                        sample_rate: 16000,
                    },
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
                provider: {
                    vendor: 'minimax',
                    params: {
                        key: minimaxApiKey,
                        model: 'speech-01-turbo',
                        voice_id: 'female-tianmei',
                        sample_rate: 16000,
                        group_id: minimaxGroupId,
                    },
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
            tts_vendor: 'minimax',
            envCheck: {
                AGORA_APP_ID: mask(appId),
                LLM_URL: mask(llmUrl),
                LLM_API_KEY: mask(llmApiKey),
                LLM_MODEL: llmModel,
                MINIMAX_API_KEY: mask(minimaxApiKey),
                MINIMAX_GROUP_ID: mask(minimaxGroupId),
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
