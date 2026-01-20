import { NextResponse } from 'next/server'

// 测试端点：直接调用 Agora Conversational AI API
export async function GET() {
    const appId = process.env.AGORA_APP_ID || ''
    const customerId = process.env.AGORA_CUSTOMER_ID || ''
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET || ''

    // 生成 Basic Auth
    const credentials = Buffer.from(`${customerId}:${customerSecret}`).toString('base64')
    const authHeader = `Basic ${credentials}`

    // 构建最简请求
    const testPayload = {
        name: `test-${Date.now()}`,
        properties: {
            channel: `test-channel-${Date.now()}`,
            agent_rtc_uid: '12345',
            remote_rtc_uids: ['67890'],
        },
    }

    const apiUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${appId}/join`

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: authHeader,
            },
            body: JSON.stringify(testPayload),
        })

        const responseText = await response.text()
        let responseData
        try {
            responseData = JSON.parse(responseText)
        } catch {
            responseData = { rawText: responseText }
        }

        return NextResponse.json({
            status: 'test_complete',
            request: {
                url: apiUrl,
                authHeaderPreview: authHeader.slice(0, 15) + '...',
                payload: testPayload,
            },
            response: {
                status: response.status,
                statusText: response.statusText,
                headers: Object.fromEntries(response.headers.entries()),
                data: responseData,
            },
            credentials: {
                appIdLen: appId.length,
                customerIdLen: customerId.length,
                customerSecretLen: customerSecret.length,
                base64Credentials: credentials.slice(0, 20) + '...',
            },
        })
    } catch (error) {
        return NextResponse.json({
            status: 'error',
            error: String(error),
        }, { status: 500 })
    }
}
