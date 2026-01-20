import { NextRequest, NextResponse } from 'next/server'
import { generateRtcToken, getAppId } from '@/lib/agora-token'

export async function POST(request: NextRequest) {
    try {
        const { channelName, uid } = await request.json()

        if (!channelName || uid === undefined) {
            return NextResponse.json(
                { error: 'Missing channelName or uid' },
                { status: 400 }
            )
        }

        const token = generateRtcToken(channelName, Number(uid))
        const appId = getAppId()

        return NextResponse.json({
            token,
            appId,
            channelName,
            uid,
        })
    } catch (error) {
        console.error('Token generation error:', error)
        return NextResponse.json(
            { error: 'Failed to generate token' },
            { status: 500 }
        )
    }
}
