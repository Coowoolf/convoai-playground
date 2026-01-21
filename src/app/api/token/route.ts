import { NextRequest, NextResponse } from 'next/server'
import { generateRtcToken, getAppId } from '@/lib/agora-token'

export async function POST(request: NextRequest) {
    try {
        const { channelName, uid, platform = 'agora' } = await request.json()

        if (!channelName || uid === undefined) {
            return NextResponse.json(
                { error: 'Missing channelName or uid' },
                { status: 400 }
            )
        }

        // 根据平台生成 Token
        const token = generateRtcToken(channelName, Number(uid), platform)
        const appId = getAppId(platform)

        console.log(`[Token] Generated for platform: ${platform}, channel: ${channelName}, uid: ${uid}`)

        return NextResponse.json({
            token,
            appId,
            channelName,
            uid,
            platform,
        })
    } catch (error) {
        console.error('Token generation error:', error)
        return NextResponse.json(
            { error: 'Failed to generate token', details: String(error) },
            { status: 500 }
        )
    }
}
