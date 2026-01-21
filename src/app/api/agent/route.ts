import { NextRequest, NextResponse } from 'next/server'

// 日志
const logs: Array<{ time: string; type: string; data: unknown }> = []
function log(type: string, data: unknown) {
    logs.push({ time: new Date().toISOString(), type, data })
    if (logs.length > 50) logs.shift()
    console.log(`[${type}]`, JSON.stringify(data, null, 2))
}

// 平台配置
const PLATFORM_CONFIG = {
    agora: {
        name: 'Agora 国际版',
        apiBase: 'https://api.agora.io/api/conversational-ai-agent/v2/projects',
    },
    shengwang: {
        name: '声网中国版',
        apiBase: 'https://api.agora.io/cn/api/conversational-ai-agent/v2/projects',
    },
}

// 获取指定平台的凭证
function getCredentials(platform: 'agora' | 'shengwang') {
    if (platform === 'shengwang') {
        return {
            appId: process.env.SHENGWANG_APP_ID || process.env.AGORA_APP_ID || '',
            customerId: process.env.SHENGWANG_CUSTOMER_ID || process.env.AGORA_CUSTOMER_ID || '',
            customerSecret: process.env.SHENGWANG_CUSTOMER_SECRET || process.env.AGORA_CUSTOMER_SECRET || '',
            appCertificate: process.env.SHENGWANG_APP_CERTIFICATE || process.env.AGORA_APP_CERTIFICATE || '',
        }
    }
    return {
        appId: process.env.AGORA_APP_ID || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
        appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
    }
}

// 语言相关配置
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
        elevenLabsVoice: 'pNInz6obpgDQGcFmaJgB',
    },
    'en-US': {
        greeting: 'Hello! How can I help you today?',
        failure: 'Please hold on a moment.',
        systemPrompt: 'You are a friendly AI voice assistant. Please respond in natural, conversational English.',
        elevenLabsVoice: '21m00Tcm4TlvDq8ikWAM',
    },
    'ja-JP': {
        greeting: 'こんにちは！何かお手伝いできることはありますか？',
        failure: '少々お待ちください。',
        systemPrompt: 'あなたはフレンドリーなAI音声アシスタントです。自然な日本語で簡潔に答えてください。',
        elevenLabsVoice: 'pNInz6obpgDQGcFmaJgB',
    },
}

// ElevenLabs TTS 配置 (Agora 国际版)
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

// 火山引擎 TTS 配置 (声网中国版)
function getVolcanoTTSParams() {
    return {
        access_token: (process.env.VOLCANO_ACCESS_TOKEN || '').trim(),
        app_id: (process.env.VOLCANO_APP_ID || '').trim(),
        cluster: 'volcano_tts',
        voice_type: 'zh_female_cancan', // 中文女声
        speed_ratio: 1.0,
    }
}

// MiniMax TTS 配置
function getMiniMaxTTSParams() {
    return {
        api_key: (process.env.MINIMAX_API_KEY || '').trim(),
        group_id: (process.env.MINIMAX_GROUP_ID || '').trim(),
        model: 'speech-02-turbo',
        voice_setting: {
            voice_id: 'Chinese_calm_female1',
        },
        url: 'wss://api-uw.minimax.io/ws/v1/t2a_v2',
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
            platform = 'agora', // 新增：平台选择 'agora' | 'shengwang'
            ttsVendor = 'elevenlabs', // TTS 供应商
        } = body

        if (!channelName || !agentUid || !userUid) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            )
        }

        // 获取平台配置
        const platformConfig = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG] || PLATFORM_CONFIG.agora
        const credentials = getCredentials(platform as 'agora' | 'shengwang')

        log('PLATFORM', { platform, platformName: platformConfig.name, appIdLen: credentials.appId.length })

        const authBase64 = Buffer.from(`${credentials.customerId}:${credentials.customerSecret}`).toString('base64')
        const apiUrl = `${platformConfig.apiBase}/${credentials.appId}/join`

        // LLM 配置
        const llmUrl = (process.env.LLM_URL || '').trim()
        const llmApiKey = (process.env.LLM_API_KEY || '').trim()
        const llmModel = (process.env.LLM_MODEL || 'qwen-turbo').trim()

        log('LLM_CONFIG', { urlLen: llmUrl.length, keyLen: llmApiKey.length, model: llmModel })

        // 获取语言相关配置
        const langConfig = LANG_CONFIG[language] || LANG_CONFIG['zh-CN']

        // TTS 配置 (根据平台和 vendor 选择)
        let ttsConfig
        if (ttsVendor === 'volcano') {
            ttsConfig = {
                vendor: 'volcano',
                params: getVolcanoTTSParams(),
            }
        } else if (ttsVendor === 'minimax') {
            ttsConfig = {
                vendor: 'minimax',
                params: getMiniMaxTTSParams(),
            }
        } else {
            // 默认 ElevenLabs
            ttsConfig = {
                vendor: 'elevenlabs',
                params: getElevenLabsTTSParams(language),
            }
        }

        log('TTS_CONFIG', ttsConfig)

        // 构建请求体
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
                // ASR (凤鸣/ARES - 无需额外配置)
                asr: {
                    language: language,
                },
                // LLM
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
                // TTS
                tts: ttsConfig,
            },
        }

        log('AGORA_REQUEST', { url: apiUrl, body: requestBody })

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${authBase64}`,
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
            platform: platform,
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
        const { agentId, platform = 'agora' } = await request.json()
        if (!agentId) {
            return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })
        }

        const platformConfig = PLATFORM_CONFIG[platform as keyof typeof PLATFORM_CONFIG] || PLATFORM_CONFIG.agora
        const credentials = getCredentials(platform as 'agora' | 'shengwang')
        const authBase64 = Buffer.from(`${credentials.customerId}:${credentials.customerSecret}`).toString('base64')
        const stopUrl = `${platformConfig.apiBase}/${credentials.appId}/agents/${agentId}/leave`

        const response = await fetch(stopUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${authBase64}`,
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
