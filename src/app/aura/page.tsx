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
          // 自定义 LLM URL (待配置)
          customLlmUrl: process.env.NEXT_PUBLIC_VOICE_ADAPTER_URL,
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

  // 未认证界面
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 flex items-center justify-center">
        <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-8 w-full max-w-md border border-purple-500/30">
          <h1 className="text-3xl font-bold text-center mb-6 bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            🔒 Aura/Lix Voice
          </h1>
          <p className="text-gray-400 text-center mb-6">
            请输入密码访问语音通话功能
          </p>
          <input
            type="password"
            placeholder="输入密码"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            className="w-full bg-gray-700/50 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 mb-4"
          />
          <button 
            onClick={handleLogin}
            className="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:opacity-90 transition-opacity"
          >
            登录
          </button>
        </div>
      </div>
    )
  }

  // 已认证界面
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 p-4">
      {/* 顶部导航 */}
      <header className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <a href="/" className="text-gray-400 hover:text-white">← Playground</a>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
            🎙️ Voice Call
          </h1>
        </div>
        <button 
          onClick={handleLogout}
          className="text-gray-400 hover:text-white text-sm"
        >
          登出
        </button>
      </header>

      <div className="max-w-4xl mx-auto grid md:grid-cols-2 gap-6">
        {/* 左侧: 控制面板 */}
        <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/30">
          <h2 className="text-xl font-semibold text-white mb-6">控制面板</h2>

          {/* Agent 选择 */}
          <div className="mb-6">
            <label className="block text-gray-400 mb-2">对话对象</label>
            <div className="flex gap-2">
              <button
                onClick={() => setAgent('aura')}
                disabled={status !== 'idle'}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                  agent === 'aura'
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                } ${status !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                ⚡ Aura (CTO)
              </button>
              <button
                onClick={() => setAgent('lix')}
                disabled={status !== 'idle'}
                className={`flex-1 py-3 rounded-lg font-semibold transition-all ${
                  agent === 'lix'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                } ${status !== 'idle' ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                🔧 Lix (VP Eng)
              </button>
            </div>
          </div>

          {/* 状态显示 */}
          <div className="mb-6 text-center">
            <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full ${
              status === 'idle' ? 'bg-gray-700 text-gray-400' :
              status === 'connecting' ? 'bg-yellow-600/20 text-yellow-400' :
              status === 'connected' || status === 'talking' ? 'bg-green-600/20 text-green-400' :
              'bg-red-600/20 text-red-400'
            }`}>
              <span className={`w-2 h-2 rounded-full ${
                status === 'idle' ? 'bg-gray-400' :
                status === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                status === 'connected' || status === 'talking' ? 'bg-green-400 animate-pulse' :
                'bg-red-400'
              }`} />
              {status === 'idle' && '未连接'}
              {status === 'connecting' && '连接中...'}
              {status === 'connected' && '已连接'}
              {status === 'talking' && '通话中'}
              {status === 'error' && '连接失败'}
            </div>
            
            {(status === 'connected' || status === 'talking') && (
              <div className="mt-2 text-2xl font-mono text-white">
                {formatDuration(duration)}
              </div>
            )}
          </div>

          {/* 通话按钮 */}
          <div className="flex justify-center">
            {status === 'idle' || status === 'error' ? (
              <button
                onClick={startCall}
                className="w-24 h-24 rounded-full bg-gradient-to-r from-green-500 to-emerald-600 text-white text-4xl hover:scale-105 transition-transform shadow-lg shadow-green-500/30"
              >
                🎤
              </button>
            ) : status === 'connecting' ? (
              <button
                disabled
                className="w-24 h-24 rounded-full bg-yellow-600 text-white text-4xl opacity-50 cursor-not-allowed"
              >
                ⏳
              </button>
            ) : (
              <button
                onClick={endCall}
                className="w-24 h-24 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-white text-4xl hover:scale-105 transition-transform shadow-lg shadow-red-500/30"
              >
                📴
              </button>
            )}
          </div>

          <p className="text-center text-gray-500 mt-4 text-sm">
            {status === 'idle' && '点击开始通话'}
            {status === 'connecting' && '正在建立连接...'}
            {(status === 'connected' || status === 'talking') && '点击结束通话'}
            {status === 'error' && '点击重试'}
          </p>
        </div>

        {/* 右侧: 日志 */}
        <div className="bg-gray-800/50 backdrop-blur-lg rounded-2xl p-6 border border-purple-500/30">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-white">📋 通话日志</h2>
            <button
              onClick={() => setLogs([])}
              className="text-gray-500 hover:text-white text-sm"
            >
              清空
            </button>
          </div>

          <div className="h-80 overflow-y-auto space-y-2 font-mono text-sm">
            {logs.length === 0 ? (
              <p className="text-gray-500">开始通话后日志将显示在这里...</p>
            ) : (
              logs.map((log, i) => (
                <div key={i} className={`flex gap-2 ${
                  log.type === 'success' ? 'text-green-400' :
                  log.type === 'error' ? 'text-red-400' :
                  log.type === 'agent' ? 'text-purple-400' :
                  'text-gray-400'
                }`}>
                  <span className="text-gray-600">[{log.time}]</span>
                  <span>{log.message}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 底部说明 */}
      <footer className="max-w-4xl mx-auto mt-8 text-center text-gray-500 text-sm">
        <p>AURALIX Voice Call · Powered by Agora Conversational AI</p>
      </footer>
    </div>
  )
}
