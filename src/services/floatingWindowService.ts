import { reactive } from 'vue'

interface FragmentData {
  id: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
  isMinimized?: boolean
}

interface WindowState {
  visible: boolean
  fragment: FragmentData | null
}

class FloatingWindowService {
  private windowState = reactive<WindowState>({
    visible: false,
    fragment: null
  })

  private minimizedFragments = reactive<Map<string, FragmentData>>(new Map())

  // 打开编辑窗口
  openWindow(fragment: FragmentData) {
    // 如果是最小化的片段，从最小化集合中移除
    if (this.minimizedFragments.has(fragment.id)) {
      this.minimizedFragments.delete(fragment.id)
    }
    
    this.windowState.fragment = fragment
    this.windowState.visible = true
  }

  // 关闭编辑窗口
  closeWindow() {
    this.windowState.visible = false
    this.windowState.fragment = null
  }

  // 最小化窗口
  minimizeWindow() {
    if (!this.windowState.fragment) return
    
    const fragment = { ...this.windowState.fragment, isMinimized: true }
    this.minimizedFragments.set(fragment.id, fragment)
    
    this.windowState.visible = false
  }

  // 恢复最小化的窗口
  restoreWindow(fragmentId: string) {
    const fragment = this.minimizedFragments.get(fragmentId)
    if (fragment) {
      this.minimizedFragments.delete(fragmentId)
      this.openWindow(fragment)
    }
  }

  // 获取当前窗口状态
  getWindowState() {
    return this.windowState
  }

  // 获取最小化的片段列表
  getMinimizedFragments() {
    return Array.from(this.minimizedFragments.values())
  }

  // 判断片段是否已打开
  isFragmentOpen(fragmentId: string) {
    return (
      (this.windowState.visible && this.windowState.fragment?.id === fragmentId) || 
      this.minimizedFragments.has(fragmentId)
    )
  }
}

// 创建单例
export const floatingWindowService = new FloatingWindowService() 