import { RtcTokenBuilder, RtcRole } from 'agora-token'

// 根据平台获取凭证
function getCredentials(platform: 'agora' | 'shengwang') {
    if (platform === 'shengwang') {
        return {
            appId: process.env.SHENGWANG_APP_ID || '',
            appCertificate: process.env.SHENGWANG_APP_CERTIFICATE || '',
        }
    }
    return {
        appId: process.env.AGORA_APP_ID || '',
        appCertificate: process.env.AGORA_APP_CERTIFICATE || '',
    }
}

export function generateRtcToken(
    channelName: string,
    uid: number,
    platform: 'agora' | 'shengwang' = 'agora',
    role: 'publisher' | 'subscriber' = 'publisher',
    expireTimeInSeconds: number = 3600
): string {
    const { appId, appCertificate } = getCredentials(platform)

    if (!appId || !appCertificate) {
        console.error(`Missing credentials for platform: ${platform}`)
        throw new Error(`${platform} credentials not configured`)
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

export function getAppId(platform: 'agora' | 'shengwang' = 'agora'): string {
    const { appId } = getCredentials(platform)
    return appId
}
