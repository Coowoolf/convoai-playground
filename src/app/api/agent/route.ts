import { NextRequest, NextResponse } from 'next/server'

// 日志
const logs: Array<{ time: string; type: string; data: unknown }> = []
function log(type: string, data: unknown) {
    logs.push({ time: new Date().toISOString(), type, data })
    if (logs.length > 50) logs.shift()
    console.log(`[${type}]`, JSON.stringify(data, null, 2))
}

// ============================================
// 平台配置
// ============================================

// Agora 国际版配置
const AGORA_CONFIG = {
    name: 'Agora 国际版',
    apiBase: 'https://api.agora.io/api/conversational-ai-agent/v2/projects',
    getCredentials: () => ({
        appId: process.env.AGORA_APP_ID || '',
        appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    }),
    // LLM: OpenAI
    getLLMConfig: () => ({
        url: 'https://api.openai.com/v1/chat/completions',
        apiKey: (process.env.OPENAI_API_KEY || '').trim(),
        model: 'gpt-4o-mini',
    }),
    // TTS 选项: ElevenLabs, MiniMax
    ttsOptions: ['elevenlabs', 'minimax'],
}

// 声网中国版配置
const SHENGWANG_CONFIG = {
    name: '声网中国版',
    apiBase: 'https://api.agora.io/cn/api/conversational-ai-agent/v2/projects',
    getCredentials: () => ({
        appId: process.env.SHENGWANG_APP_ID || '',
        appCertificate: process.env.SHENGWANG_APP_CERTIFICATE || '',
        customerId: process.env.SHENGWANG_CUSTOMER_ID || '',
        customerSecret: process.env.SHENGWANG_CUSTOMER_SECRET || '',
    }),
    // LLM: 阿里云通义千问
    getLLMConfig: () => ({
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        apiKey: (process.env.ALIYUN_API_KEY || '').trim(),
        model: 'qwen-turbo',
    }),
    // TTS 选项: 火山引擎, MiniMax
    ttsOptions: ['volcano', 'minimax'],
}

// ============================================
// TTS 配置
// ============================================

// ElevenLabs TTS (Agora 国际版专用)
function getElevenLabsTTSParams(language: string) {
    const voiceMap: Record<string, string> = {
        'zh-CN': 'pNInz6obpgDQGcFmaJgB', // Adam (multilingual)
        'en-US': '21m00Tcm4TlvDq8ikWAM', // Rachel
        'ja-JP': 'pNInz6obpgDQGcFmaJgB', // Adam
    }
    return {
        vendor: 'elevenlabs',
        params: {
            base_url: 'wss://api.elevenlabs.io/v1',
            key: (process.env.ELEVENLABS_API_KEY || '').trim(),
            model_id: 'eleven_flash_v2_5',
            voice_id: voiceMap[language] || voiceMap['zh-CN'],
            sample_rate: 24000,
        },
    }
}

// MiniMax TTS (国际版和国内版通用)
function getMiniMaxTTSParams() {
    return {
        vendor: 'minimax',
        params: {
            api_key: (process.env.MINIMAX_API_KEY || '').trim(),
            group_id: (process.env.MINIMAX_GROUP_ID || '').trim(),
            model: 'speech-02-turbo',
            voice_setting: {
                voice_id: 'Chinese_calm_female1',
            },
            url: 'wss://api-uw.minimax.io/ws/v1/t2a_v2',
        },
    }
}

// 火山引擎 TTS (声网中国版专用)
function getVolcanoTTSParams() {
    return {
        vendor: 'volcano',
        params: {
            access_token: (process.env.VOLCANO_ACCESS_TOKEN || '').trim(),
            app_id: (process.env.VOLCANO_APP_ID || '').trim(),
            cluster: 'volcano_tts',
            voice_type: 'zh_female_cancan',
            speed_ratio: 1.0,
        },
    }
}

// ============================================
// 语言相关配置
// ============================================
const LANG_CONFIG: Record<string, {
    greeting: string
    failure: string
    systemPrompt: string
}> = {
    'zh-CN': {
        greeting: '你好！有什么可以帮助你的吗？',
        failure: '请稍等一下。',
        systemPrompt: '你是一个友好的AI语音助手。请用简洁自然的中文回答问题。',
    },
    'en-US': {
        greeting: 'Hello! How can I help you today?',
        failure: 'Please hold on a moment.',
        systemPrompt: 'You are a friendly AI voice assistant. Please respond in natural, conversational English.',
    },
    'ja-JP': {
        greeting: 'こんにちは！何かお手伝いできることはありますか？',
        failure: '少々お待ちください。',
        systemPrompt: 'あなたはフレンドリーなAI音声アシスタントです。自然な日本語で簡潔に答えてください。',
    },
}

// ============================================
// API 处理
// ============================================
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
            platform = 'agora', // 'agora' | 'shengwang'
            ttsVendor, // 由平台决定可选项
        } = body

        if (!channelName || !agentUid || !userUid) {
            return NextResponse.json(
                { error: 'Missing required parameters' },
                { status: 400 }
            )
        }

        // 根据平台选择配置
        const isShengwang = platform === 'shengwang'
        const config = isShengwang ? SHENGWANG_CONFIG : AGORA_CONFIG
        const credentials = config.getCredentials()
        const llmConfig = config.getLLMConfig()

        log('PLATFORM', {
            platform,
            name: config.name,
            appIdLen: credentials.appId.length,
            llmModel: llmConfig.model,
        })

        // 验证 TTS 选项
        const validTtsVendor = config.ttsOptions.includes(ttsVendor)
            ? ttsVendor
            : config.ttsOptions[0] // 默认使用第一个

        // 获取 TTS 配置
        let ttsConfig
        switch (validTtsVendor) {
            case 'elevenlabs':
                ttsConfig = getElevenLabsTTSParams(language)
                break
            case 'volcano':
                ttsConfig = getVolcanoTTSParams()
                break
            case 'minimax':
            default:
                ttsConfig = getMiniMaxTTSParams()
        }

        log('CONFIG', {
            llm: { model: llmConfig.model, urlLen: llmConfig.url.length },
            tts: { vendor: validTtsVendor },
        })

        // 获取语言相关配置
        const langConfig = LANG_CONFIG[language] || LANG_CONFIG['zh-CN']

        // 构建 API URL
        const authBase64 = Buffer.from(`${credentials.customerId}:${credentials.customerSecret}`).toString('base64')
        const apiUrl = `${config.apiBase}/${credentials.appId}/join`

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
                // ASR (凤鸣/ARES)
                asr: {
                    language: language,
                },
                // LLM (根据平台选择)
                llm: {
                    vendor: 'custom',
                    style: 'openai',
                    url: llmConfig.url,
                    api_key: llmConfig.apiKey,
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
                        model: llmConfig.model,
                        temperature: Number(temperature),
                        max_tokens: Number(maxTokens),
                    },
                },
                // TTS (根据平台和选择)
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
            platform,
            llmModel: llmConfig.model,
            ttsVendor: validTtsVendor,
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

        const config = platform === 'shengwang' ? SHENGWANG_CONFIG : AGORA_CONFIG
        const credentials = config.getCredentials()
        const authBase64 = Buffer.from(`${credentials.customerId}:${credentials.customerSecret}`).toString('base64')
        const stopUrl = `${config.apiBase}/${credentials.appId}/agents/${agentId}/leave`

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
