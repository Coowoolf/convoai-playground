import { RtcTokenBuilder, RtcRole } from 'agora-token'

const AGORA_APP_ID = process.env.AGORA_APP_ID || ''
const AGORA_APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE || ''

export function generateRtcToken(
    channelName: string,
    uid: number,
    role: 'publisher' | 'subscriber' = 'publisher',
    expireTimeInSeconds: number = 3600
): string {
    const currentTime = Math.floor(Date.now() / 1000)
    const privilegeExpireTime = currentTime + expireTimeInSeconds

    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER

    const token = RtcTokenBuilder.buildTokenWithUid(
        AGORA_APP_ID,
        AGORA_APP_CERTIFICATE,
        channelName,
        uid,
        rtcRole,
        privilegeExpireTime,
        privilegeExpireTime
    )

    return token
}

export function getAppId(): string {
    return AGORA_APP_ID
}
