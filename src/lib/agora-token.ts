import { RtcTokenBuilder, RtcRole } from 'agora-token'

// 根据平台获取凭证 (添加 trim() 防止空格问题)
function getCredentials(platform: 'agora' | 'shengwang') {
    if (platform === 'shengwang') {
        return {
            appId: (process.env.SHENGWANG_APP_ID || '').trim(),
            appCertificate: (process.env.SHENGWANG_APP_CERTIFICATE || '').trim(),
        }
    }
    return {
        appId: (process.env.AGORA_APP_ID || '').trim(),
        appCertificate: (process.env.AGORA_APP_CERTIFICATE || '').trim(),
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

    console.log(`[Token Gen] Platform: ${platform}`)
    console.log(`[Token Gen] AppID: ${appId} (len: ${appId.length})`)
    console.log(`[Token Gen] AppCert: ${appCertificate.substring(0, 8)}... (len: ${appCertificate.length})`)

    if (!appId || !appCertificate) {
        console.error(`[Token Gen] Missing credentials for platform: ${platform}`)
        throw new Error(`${platform} credentials not configured`)
    }

    const currentTime = Math.floor(Date.now() / 1000)
    const privilegeExpireTime = currentTime + expireTimeInSeconds

    const rtcRole = role === 'publisher' ? RtcRole.PUBLISHER : RtcRole.SUBSCRIBER

    console.log(`[Token Gen] Calling RtcTokenBuilder.buildTokenWithUid...`)

    const token = RtcTokenBuilder.buildTokenWithUid(
        appId,
        appCertificate,
        channelName,
        uid,
        rtcRole,
        privilegeExpireTime,
        privilegeExpireTime
    )

    console.log(`[Token Gen] Result: ${token ? `Token length ${token.length}` : 'EMPTY!'}`)

    return token
}

export function getAppId(platform: 'agora' | 'shengwang' = 'agora'): string {
    const { appId } = getCredentials(platform)
    return appId
}
