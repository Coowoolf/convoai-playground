import { NextRequest, NextResponse } from 'next/server'

// 环境变量在函数内部读取以确保 Next.js 运行时已加载
function getAgoraCredentials() {
    return {
        appId: process.env.AGORA_APP_ID || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    }
}

// TTS 配置映射 - 根据 Agora 文档配置
const getTTSConfig = (vendor: string) => {
    switch (vendor) {
        case 'minimax':
            return {
                vendor: 'minimax',
                params: {
                    key: process.env.MINIMAX_API_KEY || '',
                    model: 'speech-01-turbo',
                    voice_id: 'female-tianmei',
                    sample_rate: 16000,
                    group_id: process.env.MINIMAX_GROUP_ID || '',
                },
            }
        case 'elevenlabs':
            return {
                vendor: 'elevenlabs',
                params: {
                    base_url: 'wss://api.elevenlabs.io/v1',
                    key: process.env.ELEVENLABS_API_KEY || '',
                    model_id: 'eleven_flash_v2_5',
                    voice_id: '21m00Tcm4TlvDq8ikWAM', // Rachel
                    sample_rate: 24000,
                    stability: 0.5,
                    similarity_boost: 0.75,
                },
            }
        case 'microsoft':
        default:
            return {
                vendor: 'microsoft',
                params: {
                    voice_name: 'zh-CN-XiaoxiaoNeural',
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
        const {
            channelName,
            agentUid,
            userUid,
            userToken,
            language = 'zh-CN',
            ttsVendor = 'minimax',
            systemPrompt,
            temperature = 0.7,
            maxTokens = 500,
            llmUrl,
            llmApiKey,
            llmModel = 'qwen-turbo',
        } = await request.json()

        if (!channelName || !agentUid || !userUid) {
            return NextResponse.json(
                { error: 'Missing required parameters: channelName, agentUid, userUid' },
                { status: 400 }
            )
        }

        // 获取 Agora 凭证
        const { appId, customerId, customerSecret } = getAgoraCredentials()

        // 获取语言配置
        const langConfig = LANGUAGE_CONFIGS[language] || LANGUAGE_CONFIGS['zh-CN']

        // 获取 TTS 配置
        const ttsConfig = getTTSConfig(ttsVendor)

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

        console.log('Starting agent with config:', JSON.stringify(requestBody, null, 2))

        const response = await fetch(AGORA_CONVO_AI_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${credentials}`,
            },
            body: JSON.stringify(requestBody),
        })

        const data = await response.json()
        console.log('Agora API response:', response.status, data)

        if (!response.ok) {
            return NextResponse.json(
                { error: data.message || 'Failed to start agent', details: data },
                { status: response.status }
            )
        }

        return NextResponse.json({
            agentId: data.agent_id || data.id,
            status: 'started',
            ...data,
        })
    } catch (error) {
        console.error('Agent start error:', error)
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

        return NextResponse.json({
            status: 'stopped',
            ...data,
        })
    } catch (error) {
        console.error('Agent stop error:', error)
        return NextResponse.json({ error: 'Failed to stop agent' }, { status: 500 })
    }
}
