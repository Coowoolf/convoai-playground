'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type AgoraRTC from 'agora-rtc-sdk-ng'
import type { IAgoraRTCClient, IMicrophoneAudioTrack, IRemoteAudioTrack } from 'agora-rtc-sdk-ng'
import { generateUids } from '@/utils/uid'
import { isPasswordConfigured, validatePassword } from '@/utils/password'
import { generateChannelName } from '@/utils/channel'

type Agent = 'aura' | 'lix'
type Status = 'idle' | 'connecting' | 'connected' | 'talking' | 'error'

interface LogEntry {
  time: string
  type: 'info' | 'success' | 'error' | 'agent'
  message: string
}

export default function AuraPage() {
  // 认证状态
  const [authenticated, setAuthenticated] = useState(false)
  const [password, setPassword] = useState('')

  // 通话状态
  const [agent, setAgent] = useState<Agent>('aura')
  const [status, setStatus] = useState<Status>('idle')
  const [duration, setDuration] = useState(0)
  const [logs, setLogs] = useState<LogEntry[]>([])

  // Agora 相关
  const clientRef = useRef<IAgoraRTCClient | null>(null)
  const localTrackRef = useRef<IMicrophoneAudioTrack | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)

  // 使用工具函数检查密码配置

  // 添加日志
  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    setLogs(prev => [...prev, { time, type, message }])
  }, [])

  // 检查本地存储的认证
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('aura_voice_auth')
      if (saved === 'true') {
        setAuthenticated(true)
      }
    }
  }, [])

  // 计时器
  useEffect(() => {
    if (status === 'connected' || status === 'talking') {
      timerRef.current = setInterval(() => {
        setDuration(prev => prev + 1)
      }, 1000)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (status === 'idle') {
        setDuration(0)
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [status])

  // 登录
  const handleLogin = () => {
    if (!isPasswordConfigured()) {
      alert('密码未配置，请联系管理员')
      return
    }
    if (validatePassword(password)) {
      setAuthenticated(true)
      localStorage.setItem('aura_voice_auth', 'true')
      addLog('success', '登录成功')
    } else {
      alert('密码错误')
    }
  }

  // 登出
  const handleLogout = () => {
    setAuthenticated(false)
    localStorage.removeItem('aura_voice_auth')
  }

  // 开始通话
  const startCall = async () => {
    try {
      setStatus('connecting')
      addLog('info', `正在连接 ${agent.toUpperCase()}...`)

      // 动态导入 Agora SDK
      const AgoraRTCModule = await import('agora-rtc-sdk-ng')
      const AgoraRTC = AgoraRTCModule.default

      // 创建客户端
      const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' })
      clientRef.current = client

      // 生成频道名和 UID (使用工具函数)
      const channelName = generateChannelName('aura')
      const { userUid, agentUid } = generateUids()

      addLog('info', `频道: ${channelName}`)

      // 获取 Token
      const tokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName,
          uid: userUid,
          platform: 'agora'
        })
      })

      if (!tokenRes.ok) {
        throw new Error('获取 Token 失败')
      }

      const tokenData = await tokenRes.json()
      addLog('success', 'Token 获取成功')

      // 加入频道
      await client.join(tokenData.appId, channelName, tokenData.token, userUid)
      addLog('success', '已加入频道')

      // 创建麦克风轨道
      const localTrack = await AgoraRTC.createMicrophoneAudioTrack()
      localTrackRef.current = localTrack

      // 发布本地音频
      await client.publish([localTrack])
      addLog('success', '麦克风已启用')

      // 监听远程用户
      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType)
        if (mediaType === 'audio' && user.audioTrack) {
          user.audioTrack.play()
          addLog('agent', `${agent.toUpperCase()} 正在说话...`)
        }
      })

      client.on('user-unpublished', () => {
        addLog('info', `${agent.toUpperCase()} 停止说话`)
      })

      // 启动 Agent
      addLog('info', '正在启动 AI Agent...')

      const agentTokenRes = await fetch('/api/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName,
          uid: agentUid,
          platform: 'agora'
        })
      })

      if (!agentTokenRes.ok) {
        throw new Error('获取 Agent Token 失败')
      }

      const agentTokenData = await agentTokenRes.json()

      // 调用 Agent API (需要修改为使用自定义 LLM URL)
      const agentRes = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelName,
          agentUid,
          userUid,
          token: agentTokenData.token,
          platform: 'agora',
          language: 'en',
          llmProvider: 'openai',
          ttsProvider: 'elevenlabs',
          voiceId: 'pFZP5JQG7iQjIQuC4Bku', // Lily
          systemPrompt: agent === 'aura'
            ? 'You are Aura, Colin\'s AI CTO assistant. Be helpful, concise, and technical.'
            : 'You are Lix, Colin\'s AI VP of Engineering. Help with code review and technical research.',
          // 自定义 LLM URL - 使用 EC2 Voice Adapter
          customLlmUrl: process.env.NEXT_PUBLIC_VOICE_ADAPTER_URL || 'http://52.74.133.186:3456/v1/chat/completions',
          customLlmHeaders: {
            'X-Agent': agent,
            'X-Session-Id': channelName
          }
        })
      })

      if (!agentRes.ok) {
        const err = await agentRes.json()
        throw new Error(err.error || 'Agent 启动失败')
      }

      addLog('success', `${agent.toUpperCase()} 已上线`)
      setStatus('connected')

    } catch (error) {
      console.error('Call error:', error)
      addLog('error', `错误: ${error instanceof Error ? error.message : '未知错误'}`)
      setStatus('error')
      await endCall()
    }
  }

  // 结束通话 (P2 修复：移除事件监听器)
  const endCall = async () => {
    try {
      if (localTrackRef.current) {
        localTrackRef.current.close()
        localTrackRef.current = null
      }

      if (clientRef.current) {
        clientRef.current.removeAllListeners()
        await clientRef.current.leave()
        clientRef.current = null
      }

      addLog('info', '通话已结束')
    } catch (error) {
      console.error('End call error:', error)
    }

    setStatus('idle')
    setDuration(0)
  }

  // 格式化时长
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // 获取状态类名
  const getStatusClass = () => {
    switch (status) {
      case 'idle': return 'aura-status-idle'
      case 'connecting': return 'aura-status-connecting'
      case 'connected':
      case 'talking': return 'aura-status-connected'
      case 'error': return 'aura-status-error'
      default: return 'aura-status-idle'
    }
  }

  // 获取状态文本
  const getStatusText = () => {
    switch (status) {
      case 'idle': return '未连接'
      case 'connecting': return '连接中...'
      case 'connected': return '已连接'
      case 'talking': return '通话中'
      case 'error': return '连接失败'
      default: return '未连接'
    }
  }

  // 获取日志类名
  const getLogClass = (type: LogEntry['type']) => {
    switch (type) {
      case 'success': return 'aura-log-success'
      case 'error': return 'aura-log-error'
      case 'agent': return 'aura-log-agent'
      default: return 'aura-log-info'
    }
  }

  // 未认证界面 - 使用统一设计系统
  if (!authenticated) {
    return (
      <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}>
        {/* 浮动装饰 */}
        <div className="floating-shape shape-1" />
        <div className="floating-shape shape-2" />
        <div className="floating-shape shape-3" />
        <div className="floating-shape shape-4" />

        <div className="aura-login-card">
          <h1 className="header-title" style={{ textAlign: 'center', marginBottom: '8px' }}>
            🔒 Aura/Lix Voice
          </h1>
          <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '24px' }}>
            请输入密码访问语音通话功能
          </p>
          <input
            type="password"
            placeholder="输入密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="aura-login-input"
          />
          <button
            onClick={handleLogin}
            className="aura-login-btn"
          >
            登录
          </button>
        </div>
      </div>
    )
  }

  // 已认证界面 - 使用统一设计系统
  return (
    <div className="aura-container">
      {/* 浮动装饰 */}
      <div className="floating-shape shape-1" />
      <div className="floating-shape shape-2" />
      <div className="floating-shape shape-3" />
      <div className="floating-shape shape-4" />

      {/* 顶部导航 */}
      <header className="aura-header">
        <div className="aura-header-left">
          <a href="/" className="aura-back-link">← Playground</a>
          <h1 className="header-title">
            🎙️ Voice Call
          </h1>
        </div>
        <button
          onClick={handleLogout}
          className="aura-logout-btn"
        >
          登出
        </button>
      </header>

      <div className="aura-main">
        {/* 左侧: 控制面板 */}
        <div className="card">
          <h2 className="card-title">控制面板</h2>

          {/* Agent 选择 */}
          <div style={{ marginBottom: '24px' }}>
            <label style={{ display: 'block', color: 'var(--text-secondary)', marginBottom: '8px', fontSize: '0.875rem' }}>
              对话对象
            </label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setAgent('aura')}
                disabled={status !== 'idle'}
                className={`aura-agent-btn ${agent === 'aura' ? 'active' : ''}`}
              >
                ⚡ Aura (CTO)
              </button>
              <button
                onClick={() => setAgent('lix')}
                disabled={status !== 'idle'}
                className={`aura-agent-btn ${agent === 'lix' ? 'active-lix' : ''}`}
              >
                🔧 Lix (VP Eng)
              </button>
            </div>
          </div>

          {/* 状态显示 */}
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <div className={`aura-status-badge ${getStatusClass()}`}>
              <span className="aura-status-dot" />
              {getStatusText()}
            </div>

            {(status === 'connected' || status === 'talking') && (
              <div className="aura-duration">
                {formatDuration(duration)}
              </div>
            )}
          </div>

          {/* 通话按钮 */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            {status === 'idle' || status === 'error' ? (
              <button
                onClick={startCall}
                className="aura-call-btn aura-call-btn-start"
              >
                🎤
              </button>
            ) : status === 'connecting' ? (
              <button
                disabled
                className="aura-call-btn aura-call-btn-connecting"
              >
                ⏳
              </button>
            ) : (
              <button
                onClick={endCall}
                className="aura-call-btn aura-call-btn-end"
              >
                📴
              </button>
            )}
          </div>

          <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '16px', fontSize: '0.875rem' }}>
            {status === 'idle' && '点击开始通话'}
            {status === 'connecting' && '正在建立连接...'}
            {(status === 'connected' || status === 'talking') && '点击结束通话'}
            {status === 'error' && '点击重试'}
          </p>
        </div>

        {/* 右侧: 日志 */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="card-title" style={{ margin: 0 }}>📋 通话日志</h2>
            <button
              onClick={() => setLogs([])}
              className="aura-logout-btn"
            >
              清空
            </button>
          </div>

          <div className="aura-log-panel">
            {logs.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>开始通话后日志将显示在这里...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`aura-log-entry ${getLogClass(log.type)}`}>
                  <span className="aura-log-time">[{log.time}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <footer className="aura-footer">
        <p>AURALIX Voice Call · Powered by Agora Conversational AI</p>
      </footer>
    </div>
  )
}
