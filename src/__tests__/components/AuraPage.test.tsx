import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AuraPage from '@/app/aura/page'

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
}
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

// Mock environment
vi.stubEnv('NEXT_PUBLIC_VOICE_PASSWORD', 'testpass123')

describe('AuraPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  describe('Authentication', () => {
    it('should show login form when not authenticated', () => {
      render(<AuraPage />)
      expect(screen.getByPlaceholderText('输入密码')).toBeInTheDocument()
      expect(screen.getByText('登录')).toBeInTheDocument()
    })

    it('should show lock icon in title', () => {
      render(<AuraPage />)
      expect(screen.getByText(/🔒/)).toBeInTheDocument()
    })

    it('should authenticate with correct password', () => {
      render(<AuraPage />)
      const input = screen.getByPlaceholderText('输入密码')
      const button = screen.getByText('登录')

      fireEvent.change(input, { target: { value: 'testpass123' } })
      fireEvent.click(button)

      expect(localStorageMock.setItem).toHaveBeenCalledWith('aura_voice_auth', 'true')
    })

    it('should show alert for wrong password', () => {
      const alertMock = vi.spyOn(window, 'alert').mockImplementation(() => {})
      render(<AuraPage />)
      
      const input = screen.getByPlaceholderText('输入密码')
      const button = screen.getByText('登录')

      fireEvent.change(input, { target: { value: 'wrongpass' } })
      fireEvent.click(button)

      expect(alertMock).toHaveBeenCalledWith('密码错误')
      alertMock.mockRestore()
    })

    it('should restore auth from localStorage', () => {
      localStorageMock.getItem.mockReturnValue('true')
      render(<AuraPage />)
      
      // Should show main interface, not login
      expect(screen.queryByPlaceholderText('输入密码')).not.toBeInTheDocument()
      expect(screen.getByText('🎙️ Voice Call')).toBeInTheDocument()
    })
  })

  describe('Agent Selection', () => {
    beforeEach(() => {
      localStorageMock.getItem.mockReturnValue('true')
    })

    it('should show Aura and Lix agent buttons', () => {
      render(<AuraPage />)
      expect(screen.getByText(/Aura/)).toBeInTheDocument()
      expect(screen.getByText(/Lix/)).toBeInTheDocument()
    })

    it('should have Aura selected by default', () => {
      render(<AuraPage />)
      const auraButton = screen.getByText(/Aura/)
      expect(auraButton.closest('button')).toHaveClass('bg-purple-600')
    })
  })

  describe('Call Controls', () => {
    beforeEach(() => {
      localStorageMock.getItem.mockReturnValue('true')
    })

    it('should show call button when idle', () => {
      render(<AuraPage />)
      expect(screen.getByText('🎤')).toBeInTheDocument()
    })

    it('should show "未连接" status when idle', () => {
      render(<AuraPage />)
      expect(screen.getByText('未连接')).toBeInTheDocument()
    })

    it('should show "点击开始通话" hint', () => {
      render(<AuraPage />)
      expect(screen.getByText('点击开始通话')).toBeInTheDocument()
    })
  })

  describe('Logout', () => {
    beforeEach(() => {
      localStorageMock.getItem.mockReturnValue('true')
    })

    it('should have logout button', () => {
      render(<AuraPage />)
      expect(screen.getByText('登出')).toBeInTheDocument()
    })

    it('should logout when clicking logout button', () => {
      render(<AuraPage />)
      const logoutButton = screen.getByText('登出')
      fireEvent.click(logoutButton)
      
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('aura_voice_auth')
    })
  })
})
