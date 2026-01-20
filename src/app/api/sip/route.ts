import { NextRequest, NextResponse } from 'next/server'

const AGORA_APP_ID = process.env.AGORA_APP_ID || ''
const AGORA_CUSTOMER_ID = process.env.AGORA_CUSTOMER_ID || ''
const AGORA_CUSTOMER_SECRET = process.env.AGORA_CUSTOMER_SECRET || ''

// SIP 呼叫 API
const AGORA_SIP_API = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${AGORA_APP_ID}/sip/call`

export async function POST(request: NextRequest) {
    try {
        const {
            channelName,
            agentUid,
            userToken,
            phoneNumber,
            fromNumber,
        } = await request.json()

        if (!channelName || !agentUid || !phoneNumber) {
            return NextResponse.json(
                { error: 'Missing required parameters: channelName, agentUid, phoneNumber' },
                { status: 400 }
            )
        }

        const credentials = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString('base64')

        const requestBody = {
            convoai_body: {
                name: `sip-call-${Date.now()}`,
                properties: {
                    channel: channelName,
                    token: userToken,
                    agent_rtc_uid: String(agentUid),
                },
                sip: {
                    to_number: phoneNumber,
                    from_number: fromNumber || process.env.AGORA_SIP_FROM_NUMBER || '',
                    rtc_token: userToken,
                    rtc_uid: String(agentUid),
                },
            },
        }

        console.log('Starting SIP call with config:', JSON.stringify(requestBody, null, 2))

        const response = await fetch(AGORA_SIP_API, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${credentials}`,
            },
            body: JSON.stringify(requestBody),
        })

        const data = await response.json()
        console.log('SIP API response:', response.status, data)

        if (!response.ok) {
            return NextResponse.json(
                { error: data.message || 'Failed to start SIP call', details: data },
                { status: response.status }
            )
        }

        return NextResponse.json({
            callId: data.call_id || data.id,
            status: 'calling',
            ...data,
        })
    } catch (error) {
        console.error('SIP call error:', error)
        return NextResponse.json(
            { error: 'Failed to start SIP call', details: String(error) },
            { status: 500 }
        )
    }
}

export async function DELETE(request: NextRequest) {
    try {
        const { callId } = await request.json()

        if (!callId) {
            return NextResponse.json({ error: 'Missing callId' }, { status: 400 })
        }

        const credentials = Buffer.from(`${AGORA_CUSTOMER_ID}:${AGORA_CUSTOMER_SECRET}`).toString('base64')

        const hangupUrl = `https://api.agora.io/api/conversational-ai-agent/v2/projects/${AGORA_APP_ID}/sip/hangup`

        const response = await fetch(hangupUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Basic ${credentials}`,
            },
            body: JSON.stringify({ call_id: callId }),
        })

        const data = await response.json()

        return NextResponse.json({
            status: 'hangup',
            ...data,
        })
    } catch (error) {
        console.error('SIP hangup error:', error)
        return NextResponse.json({ error: 'Failed to hangup SIP call' }, { status: 500 })
    }
}
