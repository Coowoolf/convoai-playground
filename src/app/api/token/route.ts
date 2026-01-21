import { NextRequest, NextResponse } from 'next/server'
import { generateRtcToken, getAppId } from '@/lib/agora-token'

export async function POST(request: NextRequest) {
    try {
        const { channelName, uid, platform = 'shengwang' } = await request.json()

        console.log(`[Token] Request: platform=${platform}, channel=${channelName}, uid=${uid}`)

        if (!channelName || uid === undefined) {
            return NextResponse.json(
                { error: 'Missing channelName or uid' },
                { status: 400 }
            )
        }

        // 检查环境变量
        const envCheck = platform === 'shengwang' ? {
            appId: process.env.SHENGWANG_APP_ID,
            appCert: process.env.SHENGWANG_APP_CERTIFICATE,
        } : {
            appId: process.env.AGORA_APP_ID,
            appCert: process.env.AGORA_APP_CERTIFICATE,
        }

        console.log(`[Token] Env check for ${platform}:`, {
            appIdLen: envCheck.appId?.length || 0,
            appCertLen: envCheck.appCert?.length || 0,
        })

        if (!envCheck.appId || !envCheck.appCert) {
            console.error(`[Token] Missing credentials for ${platform}`)
            return NextResponse.json(
                { error: `Missing ${platform} credentials`, details: { appIdLen: envCheck.appId?.length || 0, appCertLen: envCheck.appCert?.length || 0 } },
                { status: 500 }
            )
        }

        // 根据平台生成 Token
        const token = generateRtcToken(channelName, Number(uid), platform)
        const appId = getAppId(platform)

        console.log(`[Token] Generated: platform=${platform}, tokenLen=${token.length}, appId=${appId}`)

        return NextResponse.json({
            token,
            appId,
            channelName,
            uid,
            platform,
        })
    } catch (error) {
        console.error('[Token] Error:', error)
        return NextResponse.json(
            { error: 'Failed to generate token', details: String(error) },
            { status: 500 }
        )
    }
}
