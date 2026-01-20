import { RtcTokenBuilder, RtcRole } from 'agora-token'

export function generateRtcToken(
    channelName: string,
    uid: number,
    role: 'publisher' | 'subscriber' = 'publisher',
    expireTimeInSeconds: number = 3600
): string {
    // 在函数内部读取环境变量，确保 Next.js 运行时已加载
    const appId = process.env.AGORA_APP_ID || ''
    const appCertificate = process.env.AGORA_APP_CERTIFICATE || ''

    if (!appId || !appCertificate) {
        console.error('Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE')
        throw new Error('Agora credentials not configured')
    }

    const currentTime = Math.floor(Date.now() / 1000)
    const privilegeExpireTime = currentTime + expireTimeInSeconds

    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER

    const token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        rtcRole,
        privilegeExpireTime,
        privilegeExpireTime
    )

    return token
}

export function getAppId(): string {
    return process.env.AGORA_APP_ID || ''
}
