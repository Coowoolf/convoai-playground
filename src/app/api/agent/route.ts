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

// 语言相关配置 (ARES + OpenAI + ElevenLabs)
const LANG_CONFIG: Record<string, {
    greeting: string
    failure: string
    systemPrompt: string
    elevenLabsVoice: string
}> = {
    'zh-CN': {
        greeting: '你好！有什么可以帮助你的吗？',
        failure: '请稍等一下。',
        systemPrompt: '你是一个友好的AI语音助手。请用简洁自然的中文回答问题。',
        elevenLabsVoice: 'pNInz6obpgDQGcFmaJgB', // Adam (multilingual)
    },
    'en-US': {
        greeting: 'Hello! How can I help you today?',
        failure: 'Please hold on a moment.',
        systemPrompt: 'You are a friendly AI voice assistant. Please respond in natural, conversational English.',
        elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM', // Rachel (English)
    },
    'ja-JP': {
        greeting: 'こんにちは！何かお手伝いできることはありますか？',
        failure: '少々お待ちください。',
        systemPrompt: 'あなたはフレンドリーなAI音声アシスタントです。自然な日本語で簡潔に答えてください。',
        elevenLabsVoice: 'pNInz6obpgDQGcFmaJgB', // Adam (multilingual)
    },
}

// ElevenLabs TTS 配置 (根据语言选择 voice)
function getElevenLabsTTSParams(language: string) {
    const langConfig = LANG_CONFIG[language] || LANG_CONFIG['zh-CN']
    return {
        base_url: 'wss://api.elevenlabs.io/v1',
        key: (process.env.ELEVENLABS_API_KEY || '').trim(),
        model_id: 'eleven_flash_v2_5',
        voice_id: langConfig.elevenLabsVoice,
        sample_rate: 24000,
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

        // LLM 配置 (OpenAI)
        const llmUrl = (process.env.LLM_URL || '').trim()
        const llmApiKey = (process.env.LLM_API_KEY || '').trim()
        const llmModel = (process.env.LLM_MODEL || 'gpt-4o-mini').trim()

        log('LLM_CONFIG', { urlLen: llmUrl.length, keyLen: llmApiKey.length, model: llmModel })

        // 获取语言相关配置
        const langConfig = LANG_CONFIG[language] || LANG_CONFIG['zh-CN']

        // TTS 配置 (ElevenLabs)
        const ttsParams = getElevenLabsTTSParams(language)

        log('TTS_CONFIG', { vendor: 'elevenlabs', language, params: ttsParams })

        // 构建请求体 (ARES + OpenAI + ElevenLabs)
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
                // ASR (ARES - 无需 Key)
                asr: {
                    language: language,
                },
                // LLM (OpenAI)
                llm: {
                    vendor: 'custom',
                    style: 'openai',
                    url: llmUrl,
                    api_key: llmApiKey,
                    system_messages: [
                        {
                            role: 'system',
                            content: systemPrompt || langConfig.systemPrompt,
                        },
                    ],
                    max_history: 32,
                    greeting_message: langConfig.greeting,
                    failure_message: langConfig.failure,
                    params: {
                        model: llmModel,
                        temperature: Number(temperature),
                        max_tokens: Number(maxTokens),
                    },
                },
                // TTS (ElevenLabs)
                tts: {
                    vendor: 'elevenlabs',
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
