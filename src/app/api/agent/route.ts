import { NextRequest, NextResponse } from 'next/server'

// 日志
const logs: Array<{ time: string; type: string; data: unknown }> = []
function log(type: string, data: unknown) {
    logs.push({ time: new Date().toISOString(), type, data })
    if (logs.length > 50) logs.shift()
    console.log(`[${type}]`, JSON.stringify(data, null, 2))
}

// 环境变量
function getAgoraCredentials() {
    return {
        appId: process.env.AGORA_APP_ID || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    }
}

// ElevenLabs TTS 配置 (官方文档格式)
function getElevenLabsTTSParams() {
    return {
        base_url: 'wss://api.elevenlabs.io/v1',
        key: (process.env.ELEVENLABS_API_KEY || '').trim(),
        model_id: 'eleven_flash_v2_5',
        voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam - 官方示例中的 voice_id
        sample_rate: 24000,
    }
}

// Minimax TTS 配置 (官方文档格式)
function getMinimaxTTSParams() {
    return {
        api_key: (process.env.MINIMAX_API_KEY || '').trim(),
        group_id: (process.env.MINIMAX_GROUP_ID || '').trim(),
        model: 'speech-02-turbo',
        voice_setting: {
            voice_id: 'Chinese_calm_female1', // 中文女声
        },
        url: 'wss://api.minimax.chat/ws/v1/t2a_v2', // 中国区 URL
    }
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        log('REQUEST_BODY', body)

        const {
            channelName,
            agentUid,
            userUid,
            userToken,
            language = 'zh-CN',
            ttsVendor = 'elevenlabs',
            systemPrompt,
            temperature = 0.7,
            maxTokens = 500,
        } = body

        if (!channelName || !agentUid || !userUid) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            )
        }

        const { appId, customerId, customerSecret } = getAgoraCredentials()
        log('CREDENTIALS', { appIdLen: appId.length, customerIdLen: customerId.length })

        const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64')
        const apiUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`

        // LLM 配置 (官方文档格式：model 放在 params 里)
        const llmUrl = (process.env.LLM_URL || '').trim()
        const llmApiKey = (process.env.LLM_API_KEY || '').trim()
        const llmModel = (process.env.LLM_MODEL || 'qwen-turbo').trim()

        log('LLM_CONFIG', { urlLen: llmUrl.length, keyLen: llmApiKey.length, model: llmModel })

        // TTS 配置
        let ttsParams
        if (ttsVendor === 'minimax') {
            ttsParams = getMinimaxTTSParams()
        } else {
            ttsParams = getElevenLabsTTSParams()
        }
        log('TTS_CONFIG', { vendor: ttsVendor, params: ttsParams })

        // 构建请求体 (完全按照官方文档格式)
        const requestBody = {
            name: `convoai-${Date.now()}`,
            properties: {
                channel: channelName,
                token: userToken,
                agent_rtc_uid: String(agentUid),
                remote_rtc_uids: [String(userUid)],
                idle_timeout: 120,
                advanced_features: {
                    enable_aivad: true,
                },
                // ASR (官方文档：默认 vendor 是 ares)
                asr: {
                    language: language,
                },
                // LLM (官方文档格式：model 放在 params 里)
                llm: {
                    url: llmUrl,
                    api_key: llmApiKey,
                    system_messages: [
                        {
                            role: 'system',
                            content: systemPrompt || '你是一个友好的AI语音助手。请用简洁自然的语言回答问题。',
                        },
                    ],
                    max_history: 32,
                    greeting_message: '你好！有什么可以帮助你的吗？',
                    failure_message: '请稍等一下。',
                    params: {
                        model: llmModel,
                        temperature: Number(temperature),
                        max_tokens: Number(maxTokens),
                    },
                },
                // TTS (官方文档格式)
                tts: {
                    vendor: ttsVendor === 'minimax' ? 'minimax' : 'elevenlabs',
                    params: ttsParams,
                },
            },
        }

        log('AGORA_REQUEST', { url: apiUrl, body: requestBody })

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${credentials}`,
            },
            body: JSON.stringify(requestBody),
        })

        const responseText = await response.text()
        let data
        try {
            data = JSON.parse(responseText)
        } catch {
            data = { rawText: responseText }
        }

        log('AGORA_RESPONSE', { status: response.status, data })

        if (!response.ok) {
            return NextResponse.json(
                { error: data.message || data.detail || 'Failed to start agent', details: data },
                { status: response.status }
            )
        }

        return NextResponse.json({
            agentId: data.agent_id || data.id,
            status: 'started',
            ...data,
        })
    } catch (error) {
        log('EXCEPTION', { error: String(error) })
        return NextResponse.json(
            { error: 'Failed to start agent', details: String(error) },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { agentId } = await request.json()
        if (!agentId) {
            return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
        }

        const { appId, customerId, customerSecret } = getAgoraCredentials()
        const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64')
        const stopUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/agents/${agentId}/leave`

        const response = await fetch(stopUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${credentials}`,
            },
        })

        const data = await response.json()
        return NextResponse.json({ status: 'stopped', ...data })
    } catch (error) {
        return NextResponse.json({ error: 'Failed to stop agent' }, { status: 500 })
    }
}

export async function GET() {
    return NextResponse.json({ logs, count: logs.length })
}
