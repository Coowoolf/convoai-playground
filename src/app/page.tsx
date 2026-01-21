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
  const [platform, setPlatform] = useState<'agora' | 'shengwang'>('shengwang')  // 默认声网中国版
  const [language, setLanguage] = useState('zh-CN')
  const [ttsVendor, setTtsVendor] = useState('minimax')  // 默认 MiniMax
  const [minimaxVoice, setMinimaxVoice] = useState('femalegirl03')  // MiniMax 音色
  const [llmProvider, setLlmProvider] = useState<'openai' | 'openrouter'>('openai')  // LLM 提供商
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

  // 调试日志
  const [debugLogs, setDebugLogs] = useState<Array<{ time: string; type: string; message: string; isError?: boolean }>>([]);
  const addLog = useCallback((type: string, message: string, isError = false) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setDebugLogs(prev => [...prev.slice(-50), { time, type, message, isError }]);
    console.log(`[${type}] ${message}`);
  }, []);

  // 切换平台时自动调整 TTS 选择
  useEffect(() => {
    if (platform === 'agora') {
      setTtsVendor('elevenlabs')
    } else {
      setTtsVendor('minimax') // 声网默认使用 MiniMax
    }
  }, [platform])

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
    setDebugLogs([])  // 清空之前的日志
    addLog('🚀 开始', `平台: ${platform}, LLM: ${platform === 'agora' ? llmProvider : 'aliyun'}, TTS: ${ttsVendor}`)

    try {
      // 动态导入 Agora SDK
      addLog('RTC', '加载 Agora SDK...')
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default
      addLog('✅ RTC', 'Agora SDK 加载成功')

      // 初始化客户端
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      // 生成 channel 信息
      const channelName = generateChannelName()
      const userUid = generateUid()
      const agentUid = generateUid()
      channelNameRef.current = channelName
      addLog('RTC', `Channel: ${channelName}, UserUID: ${userUid}, AgentUID: ${agentUid}`)

      // 获取用户 Token (根据平台使用对应凭证)
      addLog('Token', `请求 Token (${platform})...`)
      const tokenResponse = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, uid: userUid, platform }),
      })
      const tokenData = await tokenResponse.json()

      // 验证 Token 响应
      if (!tokenResponse.ok) {
        addLog('❌ Token', `API 错误: ${tokenData.error || 'Unknown error'}`, true)
        throw new Error(`Token API error: ${tokenData.error || 'Unknown error'}`)
      }
      if (!tokenData.token || !tokenData.appId) {
        addLog('❌ Token', `无效响应: token=${!!tokenData.token}, appId=${!!tokenData.appId}`, true)
        throw new Error(`Invalid token response: token=${!!tokenData.token}, appId=${!!tokenData.appId}`)
      }
      addLog('✅ Token', `用户 Token 获取成功 (${tokenData.token.substring(0, 15)}...)`)

      // 为 Agent 生成专用 Token (根据平台使用对应凭证)
      addLog('Token', '请求 Agent Token...')
      const agentTokenResponse = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelName, uid: agentUid, platform }),
      })
      const agentTokenData = await agentTokenResponse.json()

      if (!agentTokenResponse.ok || !agentTokenData.token) {
        addLog('❌ Token', `Agent Token 获取失败: ${agentTokenData.error || 'Unknown error'}`, true)
        throw new Error(`Agent Token API error: ${agentTokenData.error || 'Unknown error'}`)
      }

      const { token, appId } = tokenData
      const agentToken = agentTokenData.token
      addLog('✅ Token', `Agent Token 获取成功 (${agentToken.substring(0, 15)}...)`)

      // 设置事件监听
      client.on('user-joined', (user: { uid: string | number }) => {
        addLog('✅ RTC', `用户加入频道: UID=${user.uid}`)
      })

      client.on('user-left', (user: { uid: string | number }) => {
        addLog('RTC', `用户离开频道: UID=${user.uid}`)
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.on('user-published', async (user: any, mediaType: any) => {
        addLog('RTC', `收到媒体流: UID=${user.uid}, 类型=${mediaType}`)
        try {
          await client.subscribe(user, mediaType)
          addLog('✅ RTC', `订阅成功: UID=${user.uid}, 类型=${mediaType}`)

          if (mediaType === 'audio' && user.audioTrack) {
            addLog('🔊 音频', `开始播放 Agent 音频: UID=${user.uid}`)
            user.audioTrack.play()
            setIsSpeaking(true)
          }
        } catch (err) {
          addLog('❌ RTC', `订阅失败: ${err}`, true)
        }
      })

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      client.on('user-unpublished', (user: any, mediaType: string) => {
        addLog('RTC', `停止媒体流: UID=${user.uid}, 类型=${mediaType}`)
        if (mediaType === 'audio') {
          setIsSpeaking(false)
        }
      })

      // 加入频道
      addLog('RTC', `加入频道: ${channelName}...`)
      await client.join(appId, channelName, token, userUid)
      addLog('✅ RTC', '成功加入频道')

      // 创建并发布音频轨道
      addLog('RTC', '创建麦克风音频轨道...')
      const audioTrack = await AgoraRTC.createMicrophoneAudioTrack()
      audioTrackRef.current = audioTrack
      await client.publish([audioTrack])
      addLog('✅ RTC', '音频轨道发布成功')

      // 启动 AI Agent
      addLog('Agent', `启动 ConvoAI Agent...`)
      const agentResponse = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName,
          agentUid,
          userUid,
          userToken: agentToken,
          platform,
          llmProvider,
          language,
          ttsVendor,
          minimaxVoice,  // MiniMax 音色选择
          systemPrompt,
          temperature,
          maxTokens,
        }),
      })

      const agentData = await agentResponse.json()

      if (!agentResponse.ok) {
        addLog('❌ Agent', `启动失败: ${agentData.error || 'Unknown error'}`, true)
        if (agentData.details) {
          addLog('❌ Agent', `详情: ${JSON.stringify(agentData.details)}`, true)
        }
        throw new Error(agentData.error || 'Failed to start agent')
      }

      addLog('✅ Agent', `启动成功! ID=${agentData.agentId || agentData.agent_id}`)
      addLog('Agent', `LLM: ${agentData.llm}, TTS: ${agentData.tts}`)

      agentIdRef.current = agentData.agentId
      setState('connected')
      setIsListening(true)
      addLog('✅ 完成', '对话已建立，等待 Agent 加入频道...')
      addMessage('ai', '你好！有什么可以帮助你的吗？')
    } catch (err) {
      addLog('❌ 错误', err instanceof Error ? err.message : 'Connection failed', true)
      setError(err instanceof Error ? err.message : 'Connection failed')
      setState('idle')
      await cleanup()
    }
  }, [platform, language, ttsVendor, minimaxVoice, systemPrompt, temperature, maxTokens, addMessage, addLog, llmProvider])

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
          {/* 1. 平台选择 */}
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

          {/* 2. 语种选择 */}
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

          {/* 3. LLM 选择 (Agora 可选 OpenAI/OpenRouter, 声网固定阿里云) */}
          <div className="select-wrapper">
            {platform === 'agora' ? (
              <select
                className="select"
                value={llmProvider}
                onChange={(e) => setLlmProvider(e.target.value as 'openai' | 'openrouter')}
                disabled={state !== 'idle'}
              >
                <option value="openai">OpenAI</option>
                <option value="openrouter">OpenRouter</option>
              </select>
            ) : (
              <select className="select" disabled>
                <option>阿里云通义千问</option>
              </select>
            )}
          </div>

          {/* 4. TTS 选择 (根据平台显示不同选项) */}
          <div className="select-wrapper">
            <select
              className="select"
              value={ttsVendor}
              onChange={(e) => setTtsVendor(e.target.value)}
              disabled={state !== 'idle'}
            >
              {platform === 'agora' ? (
                <option value="elevenlabs">ElevenLabs</option>
              ) : (
                <>
                  <option value="minimax">MiniMax</option>
                  <option value="volcano">火山引擎</option>
                </>
              )}
            </select>
          </div>

          {/* 5. MiniMax 音色选择 (仅声网+MiniMax 时显示) */}
          {platform === 'shengwang' && ttsVendor === 'minimax' && (
            <div className="select-wrapper">
              <select
                className="select"
                value={minimaxVoice}
                onChange={(e) => setMinimaxVoice(e.target.value)}
                disabled={state !== 'idle'}
              >
                <option value="femalegirl01">知性姐姐</option>
                <option value="femalegirl02">港风爽姐</option>
                <option value="femalegirl03">暖澄御音</option>
                <option value="femalegirl04">俏飒流光</option>
                <option value="femalegirl05">甜邻小语</option>
                <option value="femalegirl08">磁韵学姐</option>
                <option value="femalegirl09">松韵从容</option>
                <option value="shengwangtony">赵斌 Tony</option>
              </select>
            </div>
          )}

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
        </div >
      </header >

      {/* 主内容区 - 左右分栏 */}
      <div className="main-content">
        {/* 左侧面板 - System Prompt */}
        <div className="left-panel">
          {/* 悬浮开始对话按钮 */}
          <div className="floating-button">
            <button
              className={`floating-voice-btn ${state === 'connected' ? 'active' : ''}`}
              onClick={state === 'connected' ? stopConversation : startConversation}
              disabled={state === 'connecting' || state === 'disconnecting'}
            >
              <span className="btn-icon">
                {state === 'connected' ? '⏹️' : '🎤'}
              </span>
              <span className="btn-text">
                {state === 'connecting'
                  ? '连接中'
                  : state === 'connected'
                    ? '停止'
                    : '开始'}
              </span>
            </button>
          </div>

          {/* System Prompt 编辑区 */}
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
        </div>

        {/* 右侧面板 - 配置和控制 */}
        <div className="right-panel">
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

          {/* 参数配置 */}
          <div className="card">
            <h3 className="card-title">⚙️ {t(locale, 'params.label')}</h3>
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
            <h3 className="card-title">💬 {t(locale, 'conversation.label')}</h3>
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

          {/* 电话绑定 */}
          <div className="card">
            <h3 className="card-title">📞 {t(locale, 'phone.label')}</h3>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input
                type="tel"
                className="phone-input"
                placeholder={t(locale, 'phone.placeholder')}
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                disabled={phoneBound}
                style={{ flex: 1 }}
              />
              {phoneBound ? (
                <span className="phone-status">
                  ✓ {t(locale, 'phone.bound')}
                </span>
              ) : (
                <button
                  className="floating-voice-btn"
                  style={{ width: '50px', height: '50px', fontSize: '0.7rem' }}
                  onClick={bindPhone}
                  disabled={!phoneNumber}
                >
                  绑定
                </button>
              )}
            </div>
          </div>
        </div>
      </div>


      {/* 调试日志面板 */}
      <div className="card" style={{ marginTop: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 className="card-title" style={{ margin: 0 }}>📋 调试日志</h3>
          <button
            onClick={() => setDebugLogs([])}
            style={{
              padding: '4px 12px',
              fontSize: '12px',
              background: 'rgba(239, 68, 68, 0.1)',
              color: '#EF4444',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            清空
          </button>
        </div>
        <div
          style={{
            background: 'rgba(0, 0, 0, 0.3)',
            borderRadius: '8px',
            padding: '12px',
            maxHeight: '300px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '12px',
            lineHeight: '1.6',
          }}
        >
          {debugLogs.length === 0 ? (
            <div style={{ color: 'var(--text-muted)' }}>点击"开始对话"后，日志将显示在这里...</div>
          ) : (
            debugLogs.map((log, i) => (
              <div key={i} style={{ color: log.isError ? '#EF4444' : log.type.includes('✅') ? '#22C55E' : '#E5E7EB' }}>
                <span style={{ color: '#6B7280' }}>[{log.time}]</span>{' '}
                <span style={{ color: '#A78BFA' }}>[{log.type}]</span>{' '}
                {log.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div >
  )
}
