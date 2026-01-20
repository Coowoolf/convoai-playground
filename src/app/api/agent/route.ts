import { NextRequest, NextResponse } from 'next/server'

// 环境变量在函数内部读取以确保 Next.js 运行时已加载
function getAgoraCredentials() {
    return {
        appId: process.env.AGORA_APP_ID || '',
        customerId: process.env.AGORA_CUSTOMER_ID || '',
        customerSecret: process.env.AGORA_CUSTOMER_SECRET || '',
    }
}

// TTS 配置映射 - Microsoft TTS 是 Agora 内置支持的，无需额外 API Key
const TTS_CONFIGS: Record<string, { vendor: string; defaultParams: Record<string, unknown> }> = {
    // Microsoft Azure TTS - 内置支持，推荐使用
    microsoft: {
        vendor: 'microsoft',
        defaultParams: {
            voice_name: 'zh-CN-XiaoxiaoNeural',
            sample_rate: 16000,
        },
    },
    // 以下需要额外 API Key 配置
    minimax: {
        vendor: 'minimax',
        defaultParams: {
            model: 'speech-01',
            voice_id: 'female-tianmei',
            sample_rate: 16000,
            group_id: process.env.MINIMAX_GROUP_ID || '',
        },
    },
    elevenlabs: {
        vendor: 'elevenlabs',
        defaultParams: {
            voice_id: '21m00Tcm4TlvDq8ikWAM',
            model_id: 'eleven_multilingual_v2',
            sample_rate: 16000,
        },
    },
    volcengine: {
        vendor: 'volcengine',
        defaultParams: {
            voice_type: 'zh_female_tianmei_moon_bigtts',
            sample_rate: 16000,
            app_id: process.env.VOLCENGINE_APP_ID || '',
            access_token: process.env.VOLCENGINE_ACCESS_TOKEN || '',
        },
    },
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
            userUid,  // 用户的 RTC UID
            userToken,
            language = 'zh-CN',
            ttsVendor = 'minimax',
            ttsApiKey,
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
        const ttsConfig = TTS_CONFIGS[ttsVendor] || TTS_CONFIGS['minimax']

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
                remote_rtc_uids: [String(userUid)],  // 用户 UID 不能为空
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
                    url: llmUrl || process.env.LLM_URL || 'https://api.openai.com/v1/chat/completions',
                    api_key: llmApiKey || process.env.LLM_API_KEY || '',
                    model: llmModel,
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
                    provider: {
                        vendor: ttsConfig.vendor,
                        params: {
                            ...ttsConfig.defaultParams,
                            api_key: ttsApiKey || process.env[`${ttsVendor.toUpperCase()}_API_KEY`] || '',
                        },
                    },
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
