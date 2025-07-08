<template>
  <div class="fragment-editor-page">
    <!-- 窗口控制区 - 可拖动，降低高度 -->
    <div class="window-drag-area" @mousedown="startDrag">
      <!-- 标题区域，不可拖动 -->
      <div class="window-title" @mousedown.stop @click="startTitleEdit" v-if="!isEditingTitle" ref="titleRef">
        {{ fragmentTitle || '新片段' }}{{ isGenerating ? '（生成中...）' : (fragment.wasStopped ? '（已停止）' : '') }}
      </div>
      <div class="title-edit" v-else>
        <el-input v-model="editingTitle" size="small" @blur="saveTitleEdit" @keyup.enter="saveTitleEdit"
          @keyup.esc="cancelTitleEdit" ref="titleInputRef" placeholder="输入标题..." />
      </div>
      <div class="window-controls">
        <button class="close-btn" @click="closeWindow">×</button>
      </div>
    </div>
    <!-- 内容编辑区 -->
    <div class="editor-content">
      <div class="chat-container">
        <div class="message-list" v-if="messages.length > 0" ref="messageListRef">
          <div v-for="(message, index) in messages" :key="index"
            :class="['message-item', message.role === 'user' ? 'user-message' : 'ai-message']">
            <div class="message-avatar">
              <div class="avatar-icon" :class="message.role">
                <i class="el-icon" v-if="message.role === 'user'">
                  <svg viewBox="0 0 1024 1024" width="16" height="16">
                    <path fill="currentColor"
                      d="M858.5 763.6c-18.9-44.8-46.1-85-80.6-119.5-34.5-34.5-74.7-61.6-119.5-80.6-0.4-0.2-0.8-0.3-1.2-0.5C719.5 518 760 444.7 760 362c0-137-111-248-248-248S264 225 264 362c0 82.7 40.5 156 102.8 201.1-0.4 0.2-0.8 0.3-1.2 0.5-44.8 18.9-85 46-119.5 80.6-34.5 34.5-61.6 74.7-80.6 119.5C146.9 807.5 137 854 136 901.8c-0.1 4.5 3.5 8.2 8 8.2h60c4.4 0 7.9-3.5 8-7.8 2-77.2 33-149.5 87.8-204.3 56.7-56.7 132-87.9 212.2-87.9s155.5 31.2 212.2 87.9C779 752.7 810 825 812 902.2c0.1 4.4 3.6 7.8 8 7.8h60c4.5 0 8.1-3.7 8-8.2-1-47.8-10.9-94.3-29.5-138.2z">
                    </path>
                  </svg>
                </i>
                <i class="el-icon" v-else>
                  <svg viewBox="0 0 1024 1024" width="16" height="16">
                    <path fill="currentColor"
                      d="M288 512a224 224 0 1 0 448 0 224 224 0 1 0-448 0z m494.33 320L640.16 704.11A288 288 0 0 1 512 768c-69.09 0-136.15-24.1-189.57-68.11l-142.05 127.87A32 32 0 0 1 96 813.18V96a32 32 0 0 1 32-32h768a32 32 0 0 1 32 32v717.22a32 32 0 0 1-45.67 28.78z">
                    </path>
                  </svg>
                </i>
              </div>
            </div>
            <div class="message-content">
              <div class="message-text">{{ message.content }}</div>
            </div>
          </div>
        </div>
        <div class="empty-chat" v-else>
          <div class="empty-message">暂无消息，开始与AI对话吧</div>
        </div>
      </div>
    </div>

    <!-- 聊天输入区 -->
    <div class="chat-input-area">
      <div class="input-container">
        <el-input v-model="chatInput" placeholder="与AI对话..." size="small" @keyup.enter="sendChatMessage"
          class="chat-input" />
      </div>
      <el-button class="send-button" circle type="primary" @click="sendChatMessage" :loading="isSending">
        <svg class="custom-send-icon" viewBox="0 0 24 24" width="14" height="14">
          <path d="M3,20 L21,12 L3,4 L3,9.5 L13,12 L3,14.5 Z"></path>
        </svg>
      </el-button>
    </div>

    <div class="editor-footer">
      <!-- 生成控制按钮 -->
      <template v-if="isGenerating">
        <el-button type="danger" size="small" @click="stopGeneration">停止生成</el-button>
      </template>
      <template v-else>
        <template v-if="wasGenerating || fragment.wasStopped">
          <el-button type="primary" size="small" @click="regenerateContent">重新生成</el-button>
        </template>
      </template>
      <el-button type="success" size="small" @click="insertToEditor">插入原文</el-button>
      <el-button type="warning" size="small" @click="replaceInEditor">替换原文</el-button>
      <el-button type="primary" size="small" @click="saveFragment">保存</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { convertChatMessagesToMultiTurn } from '../services/promptVariableService'
import AIService from '../services/aiService'
import { AIConfigService } from '../services/aiConfigService'

// 消息接口
interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

// 简化的片段数据结构
interface Fragment {
  id: string
  content: string
  createdAt: Date
  updatedAt: Date
  isGenerating?: boolean
  wasStopped?: boolean
}

// 片段数据
const fragment = ref<Fragment>({
  id: '',
  content: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  isGenerating: false,
  wasStopped: false
})

// 片段标题
const fragmentTitle = ref('')
// 标题编辑状态
const isEditingTitle = ref(false)
// 正在编辑的标题
const editingTitle = ref('')
// 标题输入框引用
const titleInputRef = ref<any>(null)
// 标题文本引用
const titleRef = ref<any>(null)
// 片段是否正在生成
const isGenerating = ref(false)
// 片段是否曾经在生成（用于显示重新生成按钮）
const wasGenerating = ref(false)

// 聊天相关状态
const chatInput = ref('')
const isSending = ref(false)

// 聊天消息列表
const messages = ref<ChatMessage[]>([])

// 消息列表DOM引用
const messageListRef = ref<HTMLElement | null>(null);

// AI服务实例
const aiService = ref<any>(null);

// 初始化AI服务
const initAIService = async () => {
  try {
    const providerConfig = await AIConfigService.getCurrentProviderConfig();
    aiService.value = new AIService(providerConfig);
  } catch (error) {
    console.error('初始化AI服务失败:', error);
    ElMessage.error('AI服务初始化失败');
  }
};

// 解析内容为消息
const parseContentToMessages = (content: string) => {
  if (!content) return []

  const lines = content.split('\n')
  const parsedMessages: ChatMessage[] = []
  let currentMessage: ChatMessage | null = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    if (line.startsWith('用户:')) {
      // 如果有正在处理的消息，先保存
      if (currentMessage) {
        parsedMessages.push(currentMessage)
      }

      // 创建新的用户消息
      currentMessage = {
        role: 'user',
        content: line.substring(3).trim(),
        timestamp: new Date()
      }
    } else if (line.startsWith('AI:')) {
      // 如果有正在处理的消息，先保存
      if (currentMessage) {
        parsedMessages.push(currentMessage)
      }

      // 创建新的AI消息
      currentMessage = {
        role: 'assistant',
        content: line.substring(3).trim(),
        timestamp: new Date()
      }
    } else if (currentMessage && line) {
      // 继续添加到当前消息
      currentMessage.content += '\n' + line
    } else if (line && !currentMessage) {
      // 没有前缀的内容默认为AI消息
      currentMessage = {
        role: 'assistant',
        content: line,
        timestamp: new Date()
      }
    }
  }

  // 添加最后一条消息
  if (currentMessage) {
    parsedMessages.push(currentMessage)
  }

  return parsedMessages
}

// 监听片段内容变化，更新消息列表
watch(() => fragment.value.content, (newContent) => {
  messages.value = parseContentToMessages(newContent)
}, { immediate: true })

// 滚动到底部函数
const scrollToBottom = () => {
  nextTick(() => {
    if (messageListRef.value) {
      messageListRef.value.scrollTop = messageListRef.value.scrollHeight;
    }
  });
};

// 监听消息列表变化，自动滚动到底部
watch(() => messages.value.length, () => {
  scrollToBottom();
});

// 在消息内容变化时，也需要滚动到底部
watch(() => messages.value.map(m => m.content), () => {
  scrollToBottom();
}, { deep: true });

// 发送聊天消息
const sendChatMessage = async () => {
  if (!chatInput.value.trim()) return

  const userInput = chatInput.value.trim()
  chatInput.value = ''

  // 设置发送状态
  isSending.value = true

  try {
    messages.value.push({
      role: 'user',
      content: userInput,
      timestamp: new Date()
    })

    let messagesForAI = messages.value.map(msg => ({
      role: msg.role,
      content: msg.content
    }));
    
    // 确保第一条消息是用户角色，这是Gemini API的要求
    if (messagesForAI.length > 0 && messagesForAI[0].role === 'assistant') {
      // 如果第一条是助手消息，添加一个空的用户消息在前面
      messagesForAI.unshift({
        role: 'user',
        content: '请继续'
      });
    }
    
    const chatMessages = convertChatMessagesToMultiTurn(messagesForAI);

    // 更新片段内容以保持同步
    fragment.value.content = messages.value.map(msg =>
      `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`
    ).join('\n\n')

    // 滚动到底部
    scrollToBottom();

    // 直接使用AI服务生成回复
    if (!aiService.value) {
      await initAIService();
    }

    if (aiService.value) {
      // 使用流式响应处理AI回复
      let aiResponse = '';
      const streamCallback = (text: string, error?: string, complete?: boolean) => {
        if (error) {
          ElMessage.error(`AI回复错误: ${error}`);
          isSending.value = false;
          return;
        }
        
        aiResponse += text;
        
        // 如果是第一个回复块，创建新的AI消息
        if (aiResponse.length === text.length) {
          messages.value.push({
            role: 'assistant',
            content: aiResponse,
            timestamp: new Date()
          });
        } else {
          // 更新最后一条消息的内容
          const lastMessage = messages.value[messages.value.length - 1];
          if (lastMessage && lastMessage.role === 'assistant') {
            lastMessage.content = aiResponse;
          }
        }
        
        // 更新片段内容
        fragment.value.content = messages.value.map(msg =>
          `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`
        ).join('\n\n');
        
        // 滚动到底部
        scrollToBottom();
        
        // 如果完成，结束发送状态
        if (complete) {
          isSending.value = false;
        }
      };
      
      // 调用AI服务生成回复
      aiService.value.generateText(chatMessages, streamCallback);
    } else {
      // 如果AI服务初始化失败，使用原来的方式发送到主窗口
      const message = {
        type: 'chat-message',
        fragmentId: fragment.value.id,
        content: userInput,
        messages: chatMessages // 添加完整的消息历史
      }

      // 发送到主窗口
      window.electronAPI.sendToMainWindow(JSON.stringify(message))
      
      // 模拟AI回复
      setTimeout(() => {
        isSending.value = false
      }, 1000)
    }
  } catch (error) {
    console.error('发送消息失败:', error)
    ElMessage.error('发送失败' + error)
    isSending.value = false
  }
}

// 保存片段
const saveFragment = async () => {
  try {
    // 切换到片段栏
    try {
      // 在主进程中向主窗口发送消息
      window.electronAPI.sendToMainWindow('switch-to-fragments');

    } catch (error) {
      console.error('无法切换到片段栏:', error)
    }

    // 更新时间戳
    fragment.value.updatedAt = new Date()

    // 通过Electron API保存片段
    const result = await window.electronAPI.saveFragmentContent({
      ...fragment.value,
      title: fragmentTitle.value // 使用当前标题
    })

    if (result.success) {
      ElMessage.success('内容已保存')
    } else {
      ElMessage.error(`保存失败: ${result.error?.message || '未知错误'}`)
    }
  } catch (error) {
    console.error('保存片段失败:', error)
    ElMessage.error('保存失败')
  }
}

// 关闭窗口
const closeWindow = () => {

  try {
    if (fragment.value.id) {
      window.electronAPI.closeFragmentWindow(fragment.value.id);
    } else {
      console.error('无法关闭窗口：fragmentId为空');
      // 如果ID为空，尝试关闭当前窗口
      window.electronAPI.closeCurrentWindow();
    }
  } catch (err) {
    console.error('关闭窗口出错:', err);
  }
}

// 监听ESC键，关闭窗口
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeWindow()
  }
}

// 窗口拖动功能
const startDrag = (e: MouseEvent) => {
  // 只有在点击标题区域之外才触发拖动
  if (titleRef.value && titleRef.value.contains(e.target)) {
    return;
  }
  window.electronAPI.startDrag();
}

// 开始编辑标题
const startTitleEdit = () => {
  editingTitle.value = fragmentTitle.value || '';
  isEditingTitle.value = true;
  // 等待DOM更新后聚焦输入框
  nextTick(() => {
    if (titleInputRef.value) {
      titleInputRef.value.focus();
    }
  });
}

// 保存标题编辑
const saveTitleEdit = () => {
  if (editingTitle.value.trim()) {
    fragmentTitle.value = editingTitle.value.trim()
  }
  isEditingTitle.value = false
}

// 取消标题编辑
const cancelTitleEdit = () => {
  isEditingTitle.value = false
}

// 停止AI生成
const stopGeneration = () => {
  try {
    const message = {
      type: 'stop-generation',
      fragmentId: fragment.value.id
    }
    // 确保消息内容是字符串
    const messageStr = JSON.stringify(message);
    window.electronAPI.sendToMainWindow(messageStr);

    // 更新本地状态
    isGenerating.value = false;
    fragment.value.wasStopped = true;

    ElMessage.info('已发送停止指令');
  } catch (error) {
    console.error('发送停止指令失败:', error);
    ElMessage.error('发送失败');
  }
}

// 重新生成内容
const regenerateContent = () => {
  try {
    if (!fragment.value.id) {
      console.error('无法重新生成：片段ID为空');
      ElMessage.error('无法重新生成：片段ID为空');
      return;
    }

    const message = {
      type: 'regenerate-content',
      fragmentId: fragment.value.id
    }

    // 确保消息内容是字符串
    const messageStr = JSON.stringify(message);
    // 直接发送到主窗口
    window.electronAPI.sendToMainWindow(messageStr);

    // 更新本地UI状态
    isGenerating.value = true;
    fragment.value.wasStopped = false;

    ElMessage.info('正在重新生成...');
  } catch (error) {
    console.error('发送重新生成指令失败:', error);
    ElMessage.error('发送失败');
  }
}

// 插入到编辑器
const insertToEditor = () => {
  try {
    const message = {
      type: 'insert-fragment',
      content: fragment.value.content
    }
    window.electronAPI.sendToMainWindow(JSON.stringify(message))
    ElMessage.success('已发送到编辑器')
  } catch (error) {
    console.error('发送到编辑器失败:', error)
    ElMessage.error('发送失败')
  }
}

// 替换编辑器中的选中内容
const replaceInEditor = () => {
  try {
    const message = {
      type: 'replace-fragment',
      content: fragment.value.content
    }
    window.electronAPI.sendToMainWindow(JSON.stringify(message))
    ElMessage.success('已发送到编辑器')
  } catch (error) {
    console.error('发送到编辑器失败:', error)
    ElMessage.error('发送失败')
  }
}

// 初始化
onMounted(async () => {
  // 初始化AI服务
  await initAIService();
  
  // 先设置数据接收监听器
  const dataHandler = (data: any) => {
    // 创建片段对象
    fragment.value = {
      id: data.id || '', // 确保ID有值
      content: data.content || '',
      createdAt: new Date(data.createdAt || Date.now()),
      updatedAt: new Date(data.updatedAt || Date.now()),
      isGenerating: data.isGenerating || false,
      wasStopped: data.wasStopped || false
    }

    // 设置标题
    fragmentTitle.value = data.title || '新片段';

    // 设置生成状态
    isGenerating.value = data.isGenerating || false;

    // 只有在以下情况才设置曾经生成过的标志：
    // 1. 明确标记了 wasStopped 为 true
    // 2. 有 lastGenerationParams 参数（表示之前进行过生成）
    if (data.wasStopped || data.hasLastGenerationParams) {
      wasGenerating.value = true;
    } else {
      // 从片段栏直接创建的新片段，不应该显示重新生成按钮
      wasGenerating.value = false;
    }

    // 初始化消息数组 - 解析内容为消息
    if (data.content) {
      messages.value = parseContentToMessages(data.content);
    } else {
      messages.value = []; // 确保消息数组为空数组而非undefined
    }
  };

  // 注册监听器
  window.electronAPI.onFragmentData(dataHandler);

  // 注册内容更新监听器
  window.electronAPI.onContentUpdate((data: any) => {
    // 如果ID不匹配，忽略此更新
    if (data.id !== fragment.value.id) {
      console.log('ID不匹配，忽略更新:', data.id, fragment.value.id);
      return;
    }

    // 更新内容
    fragment.value.content = data.content || fragment.value.content;

    // 解析内容为消息
    messages.value = parseContentToMessages(fragment.value.content);

    // 滚动到底部
    scrollToBottom();

    // 更新标题
    if (data.title) {
      fragmentTitle.value = data.title;
    }

    // 检查之前的生成状态
    const wasGeneratingBefore = isGenerating.value;

    // 更新生成状态
    if (data.isGenerating !== undefined) {
      isGenerating.value = data.isGenerating;
    }

    // 更新停止状态
    if (data.wasStopped !== undefined) {
      fragment.value.wasStopped = data.wasStopped;
    }

    // 更新重新生成按钮状态
    if ((wasGeneratingBefore && !isGenerating.value && fragment.value.content.trim() !== '') ||
      fragment.value.wasStopped ||
      (!isGenerating.value && fragment.value.content.trim() !== '')) {
      wasGenerating.value = true;
    }

    // 更新时间戳
    fragment.value.updatedAt = new Date();
  });

  // 注册聊天回复监听器
  try {
    const api = window.electronAPI as any;
    if (typeof api.onChatResponse === 'function') {
      api.onChatResponse((data: any) => {
        if (data.fragmentId === fragment.value.id && data.content) {
          // 添加AI回复到消息列表
          messages.value.push({
            role: 'assistant',
            content: data.content,
            timestamp: new Date()
          })

          // 更新片段内容
          fragment.value.content = messages.value.map(msg =>
            `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}`
          ).join('\n\n')

          isSending.value = false;

          // 滚动到底部
          scrollToBottom();
        }
      });
    }
  } catch (error) {
    console.error('注册聊天响应监听器失败:', error);
  }

  try {
    // 获取当前窗口ID并请求数据
    const result = await window.electronAPI.getCurrentWindowId();

    if (result.success && result.id) {
      // 主动请求片段数据
      await window.electronAPI.requestFragmentData(result.id);
    } else {
      console.error('获取窗口ID失败:', result.message);
    }
  } catch (error) {
    console.error('请求片段数据失败:', error);
  }

  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
})

// 清理
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
/* 整体容器，设置为透明 */
.fragment-editor-page {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: transparent;
  /* 完全透明 */
  position: relative;
  border-radius: 8px;
  /* 整体圆角 */
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.1);
  /* 添加整体阴影 */
}

/* 实际内容容器，这个才是真正的圆角矩形 */
.window-drag-area {
  height: 28px;
  -webkit-app-region: drag;
  background-color: #f5f7fa;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px;
  border-top-left-radius: 8px;
  /* 顶部左侧圆角 */
  border-top-right-radius: 8px;
  /* 顶部右侧圆角 */
  border: 1px solid rgba(230, 230, 230, 0.8);
  border-bottom: none;
}

.window-title {
  font-size: 13px;
  /* 增加字体大小 */
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80%;
  -webkit-app-region: no-drag;
  /* 确保不可拖动 */
  cursor: pointer;
  padding: 3px 6px;
  /* 增加内边距 */
  border-radius: 3px;
  background-color: rgba(0, 0, 0, 0.02);
  /* 添加轻微背景色 */
  border: 1px solid transparent;
  /* 添加透明边框 */
  margin-left: 5px;
  /* 添加左边距 */
  z-index: 10;
  /* 确保在拖动区域上层 */
}

.window-title:hover {
  color: #409EFF;
  background-color: rgba(64, 158, 255, 0.1);
  border-color: rgba(64, 158, 255, 0.2);
  /* 显示边框 */
}

.title-edit {
  max-width: 80%;
  -webkit-app-region: no-drag;
}

:deep(.title-edit .el-input__wrapper) {
  padding: 0 5px;
  height: 20px;
  width: 150px;
}

:deep(.title-edit .el-input__inner) {
  font-size: 12px;
  height: 20px;
  line-height: 20px;
}

.window-controls {
  -webkit-app-region: no-drag;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
}

.close-btn:hover {
  background-color: #ff4d4f;
  color: white;
}

.editor-content {
  flex: 1;
  display: flex;
  padding: 0 8px;
  width: 100%;
  box-sizing: border-box;
  background-color: #f5f7fa;
  border-left: 1px solid rgba(230, 230, 230, 0.8);
  border-right: 1px solid rgba(230, 230, 230, 0.8);
  border-bottom: none;
  position: relative;
  overflow: hidden;
  /* 确保不出现双滚动条 */
}

/* 聊天输入区域 */
.chat-input-area {
  padding: 8px;
  background-color: #f5f7fa;
  border-left: 1px solid rgba(230, 230, 230, 0.8);
  border-right: 1px solid rgba(230, 230, 230, 0.8);
  border-bottom: none;
  display: flex;
  align-items: center;
  gap: 8px;
  position: relative;
}

.input-container {
  flex: 1;
  min-width: 0;
  /* 防止flex子项溢出 */
}

/* 聊天输入框样式 */
.chat-input {
  width: 100%;
}

:deep(.chat-input .el-input__wrapper) {
  border-radius: 16px;
  padding-left: 12px;
  padding-right: 12px;
  background-color: #fff;
  box-shadow: 0 0 0 1px rgba(230, 230, 230, 0.8) inset !important;
  /* 统一边框颜色 */
  height: 32px;
  line-height: 32px;
  display: flex;
  align-items: center;
}

:deep(.chat-input .el-input__inner) {
  height: 32px;
  line-height: 32px;
  font-size: 14px;
}

:deep(.chat-input .el-input__wrapper:hover) {
  box-shadow: 0 0 0 1px rgba(64, 158, 255, 0.3) inset !important;
}

:deep(.chat-input .el-input__wrapper:focus-within) {
  box-shadow: 0 0 0 1px #409EFF inset !important;
}

/* 发送按钮样式 */
.send-button {
  transition: all 0.2s;
  height: 32px;
  width: 32px;
  min-width: 32px;
  /* 防止按钮被压缩 */
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.send-button:hover {
  transform: translateY(-2px);
  box-shadow: 0 2px 8px rgba(64, 158, 255, 0.5);
}

.custom-send-icon {
  width: 14px;
  height: 14px;
  fill: currentColor;
  transform: rotate(-30deg);
  margin-left: -1px;
  margin-bottom: 2px;
}

/* 聊天容器样式 */
.chat-container {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  /* 改为hidden，防止整体出现滚动条 */
  background-color: #fff;
  border-radius: 4px;
  border: 1px solid rgba(230, 230, 230, 0.8);
}

.message-list {
  flex: 1;
  padding: 10px;
  overflow-y: auto;
  /* 确保消息列表可以滚动 */
  display: flex;
  flex-direction: column;
  max-height: 100%;
  /* 确保不超出容器高度 */
  scroll-behavior: smooth;
  /* 平滑滚动 */
}

.message-item {
  display: flex;
  margin-bottom: 12px;
  max-width: 100%;
}

.message-avatar {
  width: 36px;
  flex-shrink: 0;
  margin-right: 8px;
}

.avatar-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  position: static;
  /* 修改为static，让头像随消息一起滚动 */
}

.avatar-icon.user {
  background-color: #409EFF;
}

.avatar-icon.assistant {
  background-color: #67C23A;
}

.message-content {
  flex: 1;
  min-width: 0;
  overflow-wrap: break-word;
  /* 确保长词可以换行 */
}

.message-text {
  padding: 8px 12px;
  border-radius: 12px;
  word-break: break-word;
  white-space: pre-wrap;
  font-size: 14px;
  line-height: 1.5;
  max-width: 100%;
  overflow-wrap: break-word;
  /* 确保长词可以换行 */
}

.user-message .message-text {
  background-color: #E6F1FF;
  color: #303133;
  border-top-left-radius: 2px;
}

.ai-message .message-text {
  background-color: #F2F6FC;
  color: #303133;
  border-top-right-radius: 2px;
}

.empty-chat {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: center;
}

.empty-message {
  color: #909399;
  font-size: 14px;
}

/* 强制内容区填满窗口，覆盖原有的文本区域样式 */
:deep(.el-textarea) {
  display: none;
}

/* 移除通用的阴影样式，改用伪元素实现 */
.window-drag-area,
.editor-content,
.editor-footer,
.chat-input-area {
  box-shadow: none;
  background-color: #f5f7fa;
  /* 统一背景色 */
}

/* 添加样式修复透明窗口问题 */
:root {
  --fragment-bg-color: transparent;
}

/* 确保body和html也是透明的 */
html,
body {
  background-color: var(--fragment-bg-color) !important;
  margin: 0;
  padding: 0;
}

/* 移除之前可能导致问题的伪元素 */
.fragment-editor-page::after {
  display: none;
}
</style>