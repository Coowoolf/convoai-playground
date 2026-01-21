import { NextRequest, NextResponse } from 'next/server'
import { generateRtcToken, getAppId } from '@/lib/agora-token'

export async function POST(request: NextRequest) {
    const logPrefix = '[Token API]'

    try {
        const body = await request.json()
        const { channelName, uid, platform = 'shengwang' } = body

        console.log(`${logPrefix} Request:`, { channelName, uid, platform })

        if (!channelName || uid === undefined) {
            return NextResponse.json(
                { error: 'Missing channelName or uid' },
                { status: 400 }
            )
        }

        // 检查环境变量是否存在
        const envVars = {
            shengwang: {
                appId: process.env.SHENGWANG_APP_ID,
                appCert: process.env.SHENGWANG_APP_CERTIFICATE,
            },
            agora: {
                appId: process.env.AGORA_APP_ID,
                appCert: process.env.AGORA_APP_CERTIFICATE,
            }
        }

        const currentEnv = envVars[platform as keyof typeof envVars]

        console.log(`${logPrefix} Env check for ${platform}:`, {
            appIdExists: !!currentEnv?.appId,
            appIdLen: currentEnv?.appId?.length || 0,
            appCertExists: !!currentEnv?.appCert,
            appCertLen: currentEnv?.appCert?.length || 0,
        })

        if (!currentEnv?.appId || !currentEnv?.appCert) {
            const errorMsg = `Missing ${platform} credentials: appId=${!!currentEnv?.appId}, appCert=${!!currentEnv?.appCert}`
            console.error(`${logPrefix} ${errorMsg}`)
            return NextResponse.json({ error: errorMsg }, { status: 500 })
        }

        // 尝试生成 Token
        console.log(`${logPrefix} Generating token...`)
        let token: string
        try {
            token = generateRtcToken(channelName, Number(uid), platform as 'agora' | 'shengwang')
            console.log(`${logPrefix} Token generated successfully, length: ${token?.length || 0}`)
        } catch (tokenError) {
            console.error(`${logPrefix} Token generation failed:`, tokenError)
            return NextResponse.json({
                error: 'Token generation failed',
                details: String(tokenError)
            }, { status: 500 })
        }

        // 验证 Token 不为空
        if (!token) {
            console.error(`${logPrefix} Token is empty after generation!`)
            return NextResponse.json({
                error: 'Token generation returned empty string'
            }, { status: 500 })
        }

        const appId = getAppId(platform as 'agora' | 'shengwang')

        console.log(`${logPrefix} Success: platform=${platform}, appId=${appId}, tokenLen=${token.length}`)

        return NextResponse.json({
            token,
            appId,
            channelName,
            uid,
            platform,
        })
    } catch (error) {
        console.error(`${logPrefix} Unexpected error:`, error)
        return NextResponse.json(
            { error: 'Failed to generate token', details: String(error) },
            { status: 500 }
        )
    }
}
