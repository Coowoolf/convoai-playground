import { NextRequest, NextResponse } from 'next/server'

// 简化的日志存储
const logs: Array<{ time: string; type: string; data: unknown }> = []
function log(type: string, data: unknown) {
    logs.push({ time: new Date().toISOString(), type, data })
    if (logs.length > 50) logs.shift()
    console.log(`[${type}]`, JSON.stringify(data, null, 2))
}

// 环境变量在函数内部读取以确保 Next.js 运行时已加载
function getAgoraCredentials() {
    return {
        appId: process.env.AGORA_APP_ID || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    }
}

// TTS 配置映射 - 仅使用 Agora 官方支持的 vendors
const getTTSConfig = (vendor: string, language: string) => {
    switch (vendor) {
        case 'elevenlabs':
            return {
                vendor: 'elevenlabs',
                params: {
                    base_url: 'wss://api.elevenlabs.io/v1',
                    key: (process.env.ELEVENLABS_API_KEY || '').trim(),
                    model_id: 'eleven_flash_v2_5',
                    voice_id: '21m00Tcm4TlvDq8ikWAM',
                    sample_rate: 24000,
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }
        case 'microsoft':
        default:
            const voiceName = language === 'en-US' ? 'en-US-JennyNeural' : 'zh-CN-XiaoxiaoNeural'
            return {
                vendor: 'microsoft',
                params: {
                    voice_name: voiceName,
                    sample_rate: 16000,
                },
            }
    }
}

// 语言配置映射
const LANGUAGE_CONFIGS: Record<string, { asrLanguage: string; asrVendor: string }> = {
    'zh-CN': { asrLanguage: 'zh-CN', asrVendor: 'microsoft' },
    'en-US': { asrLanguage: 'en-US', asrVendor: 'microsoft' },
    'ja-JP': { asrLanguage: 'ja-JP', asrVendor: 'microsoft' },
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
            ttsVendor = 'microsoft',  // 默认使用 Microsoft (已验证可用)
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

        // 获取语言配置
        const langConfig = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS['zh-CN']

        // 获取 TTS 配置
        const ttsConfig = getTTSConfig(ttsVendor, language)
        log('TTS_CONFIG', { vendor: ttsVendor, config: ttsConfig })

        // 生成 Basic Auth
        const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64')
        const AGORA_CONVO_AI_API = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`

        // 构建请求体
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
                asr: {
                    language: langConfig.asrLanguage,
                    provider: {
                        vendor: langConfig.asrVendor,
                        params: {
                            sample_rate: 16000,
                        },
                    },
                },
                llm: {
                    url: (llmUrl || process.env.LLM_URL || 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions').trim(),
                    api_key: (llmApiKey || process.env.LLM_API_KEY || '').trim(),
                    model: (llmModel || process.env.LLM_MODEL || 'qwen-turbo').trim(),
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
                tts: {
                    provider: ttsConfig,
                },
            },
        }

        log('AGORA_REQUEST', { url: AGORA_CONVO_AI_API, body: requestBody })

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
        log('DELETE_URL', stopUrl)

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

// 获取日志端点
export async function GET() {
    return NextResponse.json({ logs, count: logs.length })
}
