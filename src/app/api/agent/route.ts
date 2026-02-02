import { NextRequest, NextResponse } from 'next/server'

// 日志 - 存储最近 200 条
const logs: Array<{ time: string; type: string; data: unknown }> = []
function log(type: string, data: unknown) {
    logs.push({ time: new Date().toISOString(), type, data })
    if (logs.length > 200) logs.shift()
    console.log(`[${type}]`, JSON.stringify(data, null, 2))
}

// ============================================
// 平台配置
// ============================================

// Agora 国际版
const AGORA_CONFIG = {
    name: 'Agora 国际版',
    apiBase: 'https://api.agora.io/api/conversational-ai-agent/v2/projects',
    getCredentials: () => ({
        appId: process.env.AGORA_APP_ID || '',
        appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    }),
    // LLM 提供商选项
    llmProviders: {
        openai: {
            name: 'OpenAI',
            url: 'https://api.openai.com/v1/chat/completions',
            getApiKey: () => (process.env.OPENAI_API_KEY || '').trim(),
            model: 'gpt-4o-mini',
        },
        openrouter: {
            name: 'OpenRouter',
            url: 'https://openrouter.ai/api/v1/chat/completions',
            getApiKey: () => (process.env.OPENROUTER_API_KEY || '').trim(),
            model: 'openai/gpt-4o-mini',
        },
    },
    tts: {
        options: ['elevenlabs'],
        default: 'elevenlabs',
    },
}

// 声网中国版
const SHENGWANG_CONFIG = {
    name: '声网中国版',
    apiBase: 'https://api.agora.io/cn/api/conversational-ai-agent/v2/projects',
    getCredentials: () => ({
        appId: process.env.SHENGWANG_APP_ID || '',
        appCertificate: process.env.SHENGWANG_APP_CERTIFICATE || '',
        customerId: process.env.SHENGWANG_CUSTOMER_ID || '',
        customerSecret: process.env.SHENGWANG_CUSTOMER_SECRET || '',
    }),
    llm: {
        name: '阿里云通义千问',
        url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        getApiKey: () => (process.env.ALIYUN_API_KEY || '').trim(),
        model: 'qwen-turbo',
    },
    tts: {
        options: ['minimax', 'volcano'],
        default: 'minimax',
    },
}

// ============================================
// TTS 配置
// ============================================

// ElevenLabs (Agora 国际版专用)
function getElevenLabsTTS(language: string) {
    const voiceMap: Record<string, string> = {
        'zh-CN': 'pNInz6obpgDQGcFmaJgB',
        'en-US': '21m00Tcm4TlvDq8ikWAM',
        'ja-JP': 'pNInz6obpgDQGcFmaJgB',
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

// MiniMax 国内版 (声网中国版专用)
function getMiniMaxTTS(voiceId: string = 'femalegirl03') {
    return {
        vendor: 'minimax',
        params: {
            key: (process.env.MINIMAX_API_KEY || '').trim(),
            group_id: (process.env.MINIMAX_GROUP_ID || '').trim(),
            model: 'speech-02-turbo',
            voice_setting: {
                voice_id: voiceId,
                speed: 1.0,
                vol: 1.0,
                pitch: 0,
            },
            url: 'wss://api.minimaxi.com/ws/v1/t2a_v2',
        },
    }
}

// 火山引擎 (声网中国版专用)
function getVolcanoTTS() {
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
// 语言配置
// ============================================
const LANG_CONFIG: Record<string, { greeting: string; failure: string; systemPrompt: string }> = {
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
            token,  // 前端发送 token
            userToken,  // 兼容旧字段名
            language = 'zh-CN',
            systemPrompt,
            temperature = 0.7,
            maxTokens = 500,
            platform = 'agora',
            llmProvider = 'openai',  // LLM 提供商 (仅 Agora 国际版有效)
            ttsVendor,
            minimaxVoice = 'femalegirl03',  // MiniMax 音色
        } = body
        
        // 兼容 token 和 userToken 两种字段名
        const agentToken = token || userToken

        if (!channelName || !agentUid || !userUid) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
        }

        // 选择平台配置
        const isShengwang = platform === 'shengwang'
        const config = isShengwang ? SHENGWANG_CONFIG : AGORA_CONFIG
        const credentials = config.getCredentials()

        // 选择 LLM 配置
        let llmConfig
        let useCustomLlm = false
        const customLlmUrl = body.customLlmUrl || process.env.NEXT_PUBLIC_VOICE_ADAPTER_URL
        
        if (customLlmUrl) {
            // 使用自定义 LLM URL (Voice Adapter)
            useCustomLlm = true
            llmConfig = {
                name: 'OpenClaw Voice Adapter',
                url: customLlmUrl,
                getApiKey: () => 'not-required',
                model: 'openclaw',
            }
        } else if (isShengwang) {
            llmConfig = SHENGWANG_CONFIG.llm
        } else {
            // Agora 国际版: 根据 llmProvider 选择 OpenAI 或 OpenRouter
            llmConfig = AGORA_CONFIG.llmProviders[llmProvider as 'openai' | 'openrouter'] || AGORA_CONFIG.llmProviders.openai
        }

        log('PLATFORM', {
            platform,
            name: config.name,
            llm: llmConfig.name,
            llmProvider: useCustomLlm ? 'custom-voice-adapter' : (isShengwang ? 'aliyun' : llmProvider),
            customLlmUrl: useCustomLlm ? customLlmUrl : undefined,
            appIdLen: credentials.appId.length,
        })

        // 获取 TTS 配置
        let ttsConfig
        if (isShengwang) {
            // 声网: MiniMax 或 火山
            ttsConfig = ttsVendor === 'volcano' ? getVolcanoTTS() : getMiniMaxTTS(minimaxVoice)
        } else {
            // Agora: 只有 ElevenLabs
            ttsConfig = getElevenLabsTTS(language)
        }

        log('TTS_CONFIG', { vendor: ttsConfig.vendor })

        // 获取语言配置
        const langConfig = LANG_CONFIG[language] || LANG_CONFIG['zh-CN']

        // 构建 API URL
        const authBase64 = Buffer.from(`${credentials.customerId}:${credentials.customerSecret}`).toString('base64')
        const apiUrl = `${config.apiBase}/${credentials.appId}/join`

        // 构建请求体
        const requestBody = {
            name: `convoai-${Date.now()}`,
            properties: {
                channel: channelName,
                token: agentToken,
                agent_rtc_uid: String(agentUid),
                remote_rtc_uids: [String(userUid)],
                idle_timeout: 120,
                advanced_features: { enable_aivad: true },
                asr: isShengwang
                    ? { vendor: 'fengming', language }  // 声网中国版用凤鸣
                    : { vendor: 'ares', language },     // Agora 国际版用 ARES
                llm: {
                    vendor: 'custom',
                    style: 'openai',
                    url: llmConfig.url,
                    api_key: llmConfig.getApiKey(),
                    system_messages: [{ role: 'system', content: systemPrompt || langConfig.systemPrompt }],
                    max_history: 32,
                    greeting_message: langConfig.greeting,
                    failure_message: langConfig.failure,
                    params: {
                        model: llmConfig.model,
                        temperature: Number(temperature),
                        max_tokens: Number(maxTokens),
                    },
                },
                tts: ttsConfig,
            },
        }

        // 记录完整请求体（隐藏敏感信息）
        log('AGORA_REQUEST_FULL', {
            url: apiUrl,
            body: {
                ...requestBody,
                properties: {
                    ...requestBody.properties,
                    token: requestBody.properties.token?.substring(0, 20) + '...',
                    llm: {
                        ...requestBody.properties.llm,
                        api_key: requestBody.properties.llm.api_key?.substring(0, 10) + '...',
                    },
                    tts: {
                        ...requestBody.properties.tts,
                        params: {
                            ...requestBody.properties.tts.params,
                            key: (requestBody.properties.tts.params as Record<string, unknown>)?.key ? String((requestBody.properties.tts.params as Record<string, unknown>).key).substring(0, 10) + '...' : undefined,
                        }
                    }
                }
            }
        })

        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${authBase64}` },
            body: JSON.stringify(requestBody),
        })

        const responseText = await response.text()
        let data
        try { data = JSON.parse(responseText) } catch { data = { rawText: responseText } }

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
            llm: llmConfig.name,
            tts: ttsConfig.vendor,
            ...data,
        })
    } catch (error) {
        log('EXCEPTION', { error: String(error) })
        return NextResponse.json({ error: 'Failed to start agent', details: String(error) }, { status: 500 })
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { agentId, platform = 'agora' } = await request.json()
        if (!agentId) return NextResponse.json({ error: 'Missing agentId' }, { status: 400 })

        const config = platform === 'shengwang' ? SHENGWANG_CONFIG : AGORA_CONFIG
        const credentials = config.getCredentials()
        const authBase64 = Buffer.from(`${credentials.customerId}:${credentials.customerSecret}`).toString('base64')
        const stopUrl = `${config.apiBase}/${credentials.appId}/agents/${agentId}/leave`

        const response = await fetch(stopUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Basic ${authBase64}` },
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
