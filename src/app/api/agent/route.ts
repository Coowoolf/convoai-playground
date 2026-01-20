import { NextRequest, NextResponse } from 'next/server'

// 简化的日志存储
const logs: Array<{ time: string; type: string; data: unknown }> = []
function log(type: string, data: unknown) {
    logs.push({ time: new Date().toISOString(), type, data })
    if (logs.length > 50) logs.shift()
    console.log(`[${type}]`, JSON.stringify(data, null, 2))
}

// 环境变量在函数内部读取
function getAgoraCredentials() {
    return {
        appId: process.env.AGORA_APP_ID || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    }
}

// ElevenLabs TTS 配置
function getElevenLabsTTSConfig() {
    const apiKey = (process.env.ELEVENLABS_API_KEY || '').trim()
    log('ELEVENLABS_KEY_CHECK', { keyLen: apiKey.length, keyStart: apiKey.slice(0, 6) })

    return {
        base_url: 'wss://api.elevenlabs.io/v1',
        key: apiKey,
        model_id: 'eleven_flash_v2_5',
        voice_id: '21m00Tcm4TlvDq8ikWAM', // Rachel - multilingual
        sample_rate: 24000,
        stability: 0.5,
        similarity_boost: 0.75,
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
            systemPrompt,
            temperature = 0.7,
            maxTokens = 500,
            llmUrl,
            llmApiKey,
            llmModel = 'qwen-turbo',
        } = body

        if (!channelName || !agentUid || !userUid) {
            const error = { error: 'Missing required parameters', missing: { channelName: !channelName, agentUid: !agentUid, userUid: !userUid } }
            log('VALIDATION_ERROR', error)
            return NextResponse.json(error, { status: 400 })
        }

        // 获取 Agora 凭证
        const { appId, customerId, customerSecret } = getAgoraCredentials()
        log('CREDENTIALS', { appIdLen: appId.length, customerIdLen: customerId.length, customerSecretLen: customerSecret.length })

        // 获取 ElevenLabs TTS 配置
        const ttsParams = getElevenLabsTTSConfig()
        log('TTS_CONFIG', ttsParams)

        // 生成 Basic Auth
        const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64')
        const AGORA_CONVO_AI_API = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`

        // LLM 配置
        const finalLlmUrl = (llmUrl || process.env.LLM_URL || '').trim()
        const finalLlmKey = (llmApiKey || process.env.LLM_API_KEY || '').trim()
        const finalLlmModel = (llmModel || process.env.LLM_MODEL || 'qwen-turbo').trim()

        log('LLM_CONFIG', { urlLen: finalLlmUrl.length, keyLen: finalLlmKey.length, model: finalLlmModel })

        // 构建请求体 - 正确的 JSON 结构：使用 tts.vendor + tts.params，而非 tts.provider.vendor
        const requestBody = {
            name: `convoai-${Date.now()}`,
            properties: {
                channel: channelName,
                token: userToken,
                agent_rtc_uid: String(agentUid),
                remote_rtc_uids: [String(userUid)],
                enable_string_uid: false,
                idle_timeout: 120,
                advanced_features: {
                    enable_aivad: true,
                    enable_bhvs: true,
                },
                // ASR - 使用 ARES（无需 API Key）
                asr: {
                    language: language === 'en-US' ? 'en-US' : 'zh-CN',
                    vendor: 'ares',
                    params: {
                        sample_rate: 16000,
                    },
                },
                // LLM
                llm: {
                    url: finalLlmUrl,
                    api_key: finalLlmKey,
                    model: finalLlmModel,
                    system_messages: [
                        {
                            role: 'system',
                            content: systemPrompt || '你是一个友好的AI语音助手。请用简洁自然的语言回答问题。',
                        },
                    ],
                    params: {
                        temperature: Number(temperature),
                        max_tokens: Number(maxTokens),
                    },
                },
                // TTS - 直接使用 vendor + params，不是 provider.vendor
                tts: {
                    vendor: 'elevenlabs',
                    params: ttsParams,
                },
            },
        }

        log('AGORA_REQUEST', { url: AGORA_CONVO_AI_API, bodyPreview: JSON.stringify(requestBody).slice(0, 500) })

        const response = await fetch(AGORA_CONVO_AI_API, {
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

        log('AGORA_RESPONSE', { status: response.status, statusText: response.statusText, data })

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
        log('EXCEPTION', { error: String(error), stack: error instanceof Error ? error.stack : undefined })
        return NextResponse.json(
            { error: 'Failed to start agent', details: String(error) },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { agentId } = await request.json()
        log('DELETE_REQUEST', { agentId })

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
        log('DELETE_RESPONSE', { status: response.status, data })

        return NextResponse.json({
            status: 'stopped',
            ...data,
        })
    } catch (error) {
        log('DELETE_EXCEPTION', { error: String(error) })
        return NextResponse.json({ error: 'Failed to stop agent' }, { status: 500 })
    }
}

// 获取日志
export async function GET() {
    return NextResponse.json({ logs, count: logs.length })
}
