import { NextResponse } from 'next/server'

// 调试端点：验证环境变量是否正确加载
export async function GET() {
    const appId = process.env.AGORA_APP_ID || ''
    const appCert = process.env.AGORA_APP_CERTIFICATE || ''
    const customerId = process.env.AGORA_CUSTOMER_ID || ''
    const customerSecret = process.env.AGORA_CUSTOMER_SECRET || ''

    // 只显示前后几个字符，保护敏感信息
    const mask = (str: string) => {
        if (!str) return '[EMPTY]'
        if (str.length < 8) return '[TOO_SHORT]'
        return `${str.slice(0, 4)}...${str.slice(-4)} (len:${str.length})`
    }

    // 检测是否有隐藏字符
    const checkHidden = (str: string) => {
        const hasNewline = str.includes('\n')
        const hasCarriageReturn = str.includes('\r')
        const hasTab = str.includes('\t')
        const hasSpace = str.startsWith(' ') || str.endsWith(' ')
        return { hasNewline, hasCarriageReturn, hasTab, hasSpace }
    }

    return NextResponse.json({
        status: 'debug',
        env: {
            AGORA_APP_ID: mask(appId),
            AGORA_APP_CERTIFICATE: mask(appCert),
            AGORA_CUSTOMER_ID: mask(customerId),
            AGORA_CUSTOMER_SECRET: mask(customerSecret),
        },
        hiddenChars: {
            AGORA_APP_ID: checkHidden(appId),
            AGORA_APP_CERTIFICATE: checkHidden(appCert),
            AGORA_CUSTOMER_ID: checkHidden(customerId),
            AGORA_CUSTOMER_SECRET: checkHidden(customerSecret),
        },
        // 验证 Basic Auth 生成
        testAuth: Buffer.from(`${customerId}:${customerSecret}`).toString('base64').slice(0, 10) + '...',
    })
}
