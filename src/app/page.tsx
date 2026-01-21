'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { t, Locale } from '@/lib/i18n'

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'disconnecting'

interface Message {
  id: string
  role: 'user' | 'ai'
  content: string
  timestamp: Date
}

export default function Home() {
  // 界面语言
  const [locale, setLocale] = useState<Locale>('zh')

  // 对话配置
  const [platform, setPlatform] = useState<'agora' | 'shengwang'>('agora')  // 平台选择
  const [language, setLanguage] = useState('zh-CN')
  const [ttsVendor, setTtsVendor] = useState('elevenlabs')  // TTS 供应商
  const [systemPrompt, setSystemPrompt] = useState(
    '你是一个友好的AI语音助手。请用简洁自然的语言回答问题，语速适中，像朋友一样交流。'
  )

  // 参数配置
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(500)

  // 电话绑定
  const [phoneNumber, setPhoneNumber] = useState('')
  const [phoneBound, setPhoneBound] = useState(false)

  // 连接状态
  const [state, setState] = useState<ConnectionState>('idle')
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 对话历史
  const [messages, setMessages] = useState<Message[]>([])

  // Refs
  const clientRef = useRef<unknown>(null)
  const audioTrackRef = useRef<unknown>(null)
  const agentIdRef = useRef<string | null>(null)
  const channelNameRef = useRef<string>('')

  // 生成随机 channel 名称
  const generateChannelName = () => {
    return `convoai-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }

  // 生成随机 UID
  const generateUid = () => {
    return Math.floor(Math.random() * 100000) + 1
  }

  // 添加消息到历史
  const addMessage = useCallback((role: 'user' | 'ai', content: string) => {
    const message: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      role,
      content,
      timestamp: new Date(),
    }
    setMessages((prev) => [...prev, message])
  }, [])

  // 开始对话
  const startConversation = useCallback(async () => {
    setState('connecting')
    setError(null)

    try {
      // 动态导入 Agora SDK
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default

      // 初始化客户端
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      // 生成 channel 信息
      const channelName = generateChannelName()
      const userUid = generateUid()
      const agentUid = generateUid()
      channelNameRef.current = channelName

      console.log('Channel:', channelName, 'User UID:', userUid, 'Agent UID:', agentUid)

      // 获取用户 Token
      const tokenResponse = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, uid: userUid }),
      })
      const tokenData = await tokenResponse.json()

      if (!tokenData.appId) {
        throw new Error('App ID not returned from server')
      }

      // 为 Agent 生成专用 Token (关键！Agent 需要自己的 Token)
      const agentTokenResponse = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, uid: agentUid }),
      })
      const agentTokenData = await agentTokenResponse.json()
      console.log('✅ Agent Token generated for UID:', agentUid)

      const { token, appId } = tokenData
      const agentToken = agentTokenData.token

      // 设置事件监听
      // 监听用户加入（包括 Agent）
      client.on('user-joined', (user: { uid: string | number }) => {
        console.log('🟢 User joined channel:', user.uid)
        console.log('Agent (UID:', user.uid, ') 已加入频道')
      })

      // 监听用户离开
      client.on('user-left', (user: { uid: string | number }) => {
        console.log('🔴 User left channel:', user.uid)
      })

      // 监听音频发布
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.on('user-published', async (user: any, mediaType: any) => {
        console.log('📢 User published:', user.uid, mediaType)
        try {
          await client.subscribe(user, mediaType)
          console.log('✅ Subscribed to:', user.uid, mediaType)

          if (mediaType === 'audio' && user.audioTrack) {
            console.log('🔊 Playing audio track from:', user.uid)
            user.audioTrack.play()
            setIsSpeaking(true)
            console.log('Agent 开始说话...')
          }
        } catch (err) {
          console.error('❌ Subscribe error:', err)
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.on('user-unpublished', (user: any, mediaType: string) => {
        console.log('📤 User unpublished:', user.uid, mediaType)
        if (mediaType === 'audio') {
          setIsSpeaking(false)
        }
      })

      // 加入频道
      await client.join(appId, channelName, token, userUid)
      console.log('Joined channel successfully')

      // 创建并发布音频轨道
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      audioTrackRef.current = audioTrack
      await client.publish([audioTrack])
      console.log('Published audio track')

      // 启动 AI Agent
      const agentResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName,
          agentUid,
          userUid,  // 用户的 RTC UID
          userToken: agentToken,  // 使用 Agent 专用的 Token！
          platform,  // 平台选择: 'agora' | 'shengwang'
          language,
          ttsVendor,
          systemPrompt,
          temperature,
          maxTokens,
        }),
      })

      const agentData = await agentResponse.json()
      console.log('Agent response:', agentData)

      if (!agentResponse.ok) {
        throw new Error(agentData.error || 'Failed to start agent')
      }

      agentIdRef.current = agentData.agentId
      setState('connected')
      setIsListening(true)
      addMessage('ai', '你好！有什么可以帮助你的吗？')
    } catch (err) {
      console.error('Connection error:', err)
      setError(err instanceof Error ? err.message : 'Connection failed')
      setState('idle')
      await cleanup()
    }
  }, [platform, language, ttsVendor, systemPrompt, temperature, maxTokens, addMessage])

  // 停止对话
  const stopConversation = useCallback(async () => {
    setState('disconnecting')
    await cleanup()
    setState('idle')
  }, [])

  // 清理资源
  const cleanup = async () => {
    setIsListening(false)
    setIsSpeaking(false)

    // 停止 Agent
    if (agentIdRef.current) {
      try {
        await fetch('/api/agent', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agentId: agentIdRef.current, platform }),
        })
      } catch (e) {
        console.error('Failed to stop agent:', e)
      }
      agentIdRef.current = null
    }

    // 清理音频轨道
    if (audioTrackRef.current) {
      const track = audioTrackRef.current as { stop: () => void; close: () => void }
      track.stop()
      track.close()
      audioTrackRef.current = null
    }

    // 离开频道
    if (clientRef.current) {
      const client = clientRef.current as { leave: () => Promise<void> }
      await client.leave()
      clientRef.current = null
    }
  }

  // 绑定电话
  const bindPhone = useCallback(async () => {
    if (!phoneNumber) return
    // TODO: 实现电话绑定逻辑
    setPhoneBound(true)
  }, [phoneNumber])

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  // 获取状态文本
  const getStatusText = () => {
    if (state === 'connecting') return t(locale, 'status.connecting')
    if (state === 'connected') {
      if (isSpeaking) return t(locale, 'status.speaking')
      if (isListening) return t(locale, 'status.listening')
      return t(locale, 'status.connected')
    }
    return ''
  }

  // 获取状态样式
  const getStatusClass = () => {
    if (state === 'connecting') return 'status-connecting'
    if (isSpeaking) return 'status-speaking'
    if (state === 'connected') return 'status-connected'
    return ''
  }

  return (
    <div className="app-container">
      {/* 浮动装饰 */}
      <div className="floating-shape shape-1" />
      <div className="floating-shape shape-2" />
      <div className="floating-shape shape-3" />
      <div className="floating-shape shape-4" />

      {/* Header */}
      <header className="header">
        <h1 className="header-title">{t(locale, 'header.title')}</h1>
        <div className="header-controls">
          {/* 语种选择 */}
          <div className="select-wrapper">
            <select
              className="select"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={state !== 'idle'}
            >
              <option value="zh-CN">{t(locale, 'language.zh')}</option>
              <option value="en-US">{t(locale, 'language.en')}</option>
              <option value="ja-JP">{t(locale, 'language.ja')}</option>
            </select>
          </div>

          {/* 平台选择 */}
          <div className="select-wrapper">
            <select
              className="select"
              value={platform}
              onChange={(e) => setPlatform(e.target.value as 'agora' | 'shengwang')}
              disabled={state !== 'idle'}
            >
              <option value="agora">Agora 国际版</option>
              <option value="shengwang">声网中国版</option>
            </select>
          </div>

          {/* TTS 选择 */}
          <div className="select-wrapper">
            <select
              className="select"
              value={ttsVendor}
              onChange={(e) => setTtsVendor(e.target.value)}
              disabled={state !== 'idle'}
            >
              <option value="elevenlabs">ElevenLabs</option>
              <option value="minimax">MiniMax</option>
              {platform === 'shengwang' && <option value="volcano">火山引擎</option>}
            </select>
          </div>

          {/* 界面语言切换 */}
          <div className="lang-switch">
            <button
              className={`lang-btn ${locale === 'en' ? 'active' : ''}`}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
            <button
              className={`lang-btn ${locale === 'zh' ? 'active' : ''}`}
              onClick={() => setLocale('zh')}
            >
              中
            </button>
          </div>
        </div>
      </header>

      {/* Prompt 编辑区 */}
      <section className="card prompt-section">
        <h2 className="card-title">{t(locale, 'prompt.label')}</h2>
        <textarea
          className="prompt-editor"
          value={systemPrompt}
          onChange={(e) => setSystemPrompt(e.target.value)}
          placeholder={t(locale, 'prompt.placeholder')}
          disabled={state !== 'idle'}
        />
      </section>

      {/* 配置和对话历史区 */}
      <div className="config-row">
        {/* 参数配置 */}
        <div className="card">
          <h3 className="card-title">{t(locale, 'params.label')}</h3>
          <div className="param-group">
            <label className="param-label">
              {t(locale, 'params.temperature')}: {temperature.toFixed(1)}
            </label>
            <input
              type="range"
              className="param-slider"
              min="0"
              max="2"
              step="0.1"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              disabled={state !== 'idle'}
            />
          </div>
          <div className="param-group" style={{ marginTop: '16px' }}>
            <label className="param-label">{t(locale, 'params.maxTokens')}</label>
            <input
              type="number"
              className="param-input"
              min="50"
              max="4000"
              step="50"
              value={maxTokens}
              onChange={(e) => setMaxTokens(Number(e.target.value))}
              disabled={state !== 'idle'}
            />
          </div>
        </div>

        {/* 对话历史 */}
        <div className="card">
          <h3 className="card-title">{t(locale, 'conversation.label')}</h3>
          <div className="conversation-panel">
            {messages.length === 0 ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                {t(locale, 'conversation.empty')}
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`message fade-in ${msg.role === 'user' ? 'message-user' : 'message-ai'}`}
                >
                  <span className="message-icon">{msg.role === 'user' ? '👤' : '🤖'}</span>
                  {msg.content}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 电话绑定区 */}
      <div className="phone-section">
        <span>{t(locale, 'phone.label')}:</span>
        <input
          type="tel"
          className="phone-input"
          placeholder={t(locale, 'phone.placeholder')}
          value={phoneNumber}
          onChange={(e) => setPhoneNumber(e.target.value)}
          disabled={phoneBound}
        />
        {phoneBound ? (
          <span className="phone-status">
            ✓ {t(locale, 'phone.bound')}
          </span>
        ) : (
          <button
            className="voice-button"
            style={{ width: 'auto', height: 'auto', padding: '10px 20px', borderRadius: '12px' }}
            onClick={bindPhone}
            disabled={!phoneNumber}
          >
            {t(locale, 'phone.bind')}
          </button>
        )}
      </div>

      {/* 状态指示器 */}
      {getStatusText() && (
        <div className={`status-indicator ${getStatusClass()}`}>
          {getStatusText()}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="status-indicator" style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#EF4444' }}>
          ❌ {error}
        </div>
      )}

      {/* 主按钮 */}
      <div className="voice-button-container">
        <button
          className={`voice-button ${state === 'connected' ? 'active' : ''}`}
          onClick={state === 'connected' ? stopConversation : startConversation}
          disabled={state === 'connecting' || state === 'disconnecting'}
        >
          <span className="voice-button-icon">
            {state === 'connected' ? '⏹️' : '🎤'}
          </span>
          <span>
            {state === 'connecting'
              ? t(locale, 'voiceButton.connecting')
              : state === 'connected'
                ? t(locale, 'voiceButton.stop')
                : t(locale, 'voiceButton.start')}
          </span>
        </button>
      </div>
    </div>
  )
}
