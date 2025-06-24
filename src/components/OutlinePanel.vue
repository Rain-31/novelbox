<template>
  <div v-if="show" class="outline-panel">
    <div class="outline-header">
      <h2 class="text-xl font-bold">大纲</h2>
      <button @click="$emit('close')" class="close-btn">
        <span class="close-icon">×</span>
      </button>
    </div>
    <div class="outline-tabs">
      <button @click="activeTab = 'setting'" :class="['tab-btn', { active: activeTab === 'setting' }]">
        设定
      </button>
      <button @click="activeTab = 'plot'" :class="['tab-btn', { active: activeTab === 'plot' }]">
        剧情
      </button>
    </div>
    <div class="outline-content">
      <div v-show="activeTab === 'setting'" class="tab-panel" data-tab="setting">
        <textarea v-model="settingContent" class="content-input" placeholder="写一些关于设定的想法，越多越好，点击'AI功能'-'AI润色'按钮..." @input="saveContent"
          :disabled="isGenerating"></textarea>
        <div class="button-group">
          <div class="ai-dropdown">
            <button @click="toggleAIMenu('setting')" class="ai-btn"
              :disabled="isGenerating || !settingContent.trim()">
              {{ isGenerating ? '生成中...' : 'AI功能' }}
            </button>
            <div v-if="showAIMenu && activeAIMenuTab === 'setting'" class="ai-dropdown-menu">
              <button @click="generateAIContent('setting')" class="dropdown-item">
                AI润色
              </button>
              <button @click="updateSettings" class="dropdown-item">
                更新设定
              </button>
            </div>
          </div>
          <button @click="saveContent" class="save-btn" :disabled="!settingContent.trim()">
            保存
          </button>
        </div>
      </div>
      <div v-show="activeTab === 'plot'" class="tab-panel" data-tab="plot">
        <textarea v-model="plotContent" class="content-input" placeholder="写一些剧情发展的大概思路，如何开始、如何发展、如何结局等等，点击'AI生成'按钮..."
          @input="saveContent" :disabled="isGenerating"></textarea>
        <div class="button-group">
          <button @click="generateAIContent('plot')" class="ai-btn" :disabled="isGenerating || !plotContent.trim()">
            {{ isGenerating ? '生成中...' : 'AI生成' }}
          </button>
          <button @click="saveContent" class="save-btn" :disabled="!plotContent.trim()">
            保存
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import AIService from '../services/aiService'
import { BookConfigService } from '../services/bookConfigService'
import { AIConfigService } from '../services/aiConfigService'
import { replaceUpdateSettingsPromptVariables, replaceSettingsPromptVariables, replaceOutlinePromptVariables } from '../services/promptVariableService'

const props = defineProps<{
  show: boolean
  currentBook: any
  currentChapter?: any
}>()

defineEmits(['close'])

const activeTab = ref('setting')
const settingContent = ref('')
const plotContent = ref('')
const isGenerating = ref(false)
// 添加下拉菜单状态变量
const showAIMenu = ref(false)
const activeAIMenuTab = ref('')

// 添加切换AI菜单的函数
const toggleAIMenu = (tab: 'setting' | 'plot') => {
  if (activeAIMenuTab.value === tab && showAIMenu.value) {
    showAIMenu.value = false
  } else {
    activeAIMenuTab.value = tab
    showAIMenu.value = true
  }
}

let aiService: AIService

// 添加更新设定函数
const updateSettings = async () => {
  if (!settingContent.value.trim() || isGenerating.value) return

  isGenerating.value = true
  try {
    // 从AIConfigService获取AI服务配置
    const aiConfig = await AIConfigService.getCurrentProviderConfig()
    aiService = new AIService(aiConfig)

    // 使用props传入的currentBook对象
    if (!props.currentBook) {
      ElMessage.error('无法获取当前书籍信息')
      return
    }

    let prompt;
    if (props.currentChapter) {
      const bookWithCurrentChapter = {
        ...props.currentBook,
        content: [props.currentChapter]
      }
      prompt = await replaceUpdateSettingsPromptVariables(bookWithCurrentChapter, settingContent.value)
    } else {
      prompt = await replaceUpdateSettingsPromptVariables(props.currentBook, settingContent.value)
    }

    const response = await aiService.generateText(prompt)
    if (response.error) {
      console.error('AI生成失败:', response.error)
      ElMessage.error(`AI生成失败：${response.error}`)
      return
    }

    settingContent.value = `${settingContent.value}\n>>>>>>>>>>>>>>>>>>>>>>>>>>>\n${response.text}`
    saveContent()
  } catch (error) {
    console.error('AI生成失败:', error)
    if (error instanceof Error) {
      ElMessage.error(`AI生成失败：${error.message}`)
    } else {
      ElMessage.error('AI生成失败，请检查网络连接和API配置')
    }
  } finally {
    isGenerating.value = false
  }
}

const generateAIContent = async (type: 'setting' | 'plot') => {
  const content = type === 'setting' ? settingContent.value : plotContent.value
  if (!content.trim() || isGenerating.value) return

  isGenerating.value = true
  try {
    // 从AIConfigService获取AI服务配置
    const aiConfig = await AIConfigService.getCurrentProviderConfig()
    aiService = new AIService(aiConfig)

    // 使用props传入的currentBook对象
    if (!props.currentBook) {
      ElMessage.error('无法获取当前书籍信息')
      return
    }
    const currentBook = props.currentBook

    // 从PromptConfigService获取提示词配置
    const prompt = type === 'setting'
      ? await replaceSettingsPromptVariables(currentBook, content)
      : await replaceOutlinePromptVariables(currentBook, content)
    
    const response = await aiService.generateText(prompt)
    if (response.error) {
      console.error('AI生成失败:', response.error)
      ElMessage.error(`AI生成失败：${response.error}`)
      return
    }

    if (type === 'setting') {
      settingContent.value = response.text
    } else {
      plotContent.value = response.text
    }
    saveContent()
  } catch (error) {
    console.error('AI生成失败:', error)
    if (error instanceof Error) {
      ElMessage.error(`AI生成失败：${error.message}`)
    } else {
      ElMessage.error('AI生成失败，请检查网络连接和API配置')
    }
  } finally {
    isGenerating.value = false
  }
}

const saveContent = async () => {
  if (!props.currentBook) return

  props.currentBook.setting = settingContent.value
  props.currentBook.plot = plotContent.value

  await BookConfigService.saveBook(props.currentBook)
}

onMounted(() => {
  if (props.currentBook) {
    settingContent.value = props.currentBook.setting || ''
    plotContent.value = props.currentBook.plot || ''
  }
})

watch(() => props.show, (newVal) => {
  if (newVal && props.currentBook) {
    settingContent.value = props.currentBook.setting || ''
    plotContent.value = props.currentBook.plot || ''
  }
})
</script>

<style scoped>
.outline-panel {
  @apply fixed right-0 top-0 h-screen w-64 bg-white shadow-lg z-50 flex flex-col;
  animation: slideIn 0.3s ease-out;
}

.outline-header {
  @apply flex items-center justify-between p-4 border-b border-gray-200;
}

.close-btn {
  @apply p-2 text-gray-500 hover:text-gray-700 rounded-full hover:bg-gray-100;
}

.close-icon {
  @apply text-2xl font-light;
}

.outline-tabs {
  @apply flex border-b border-gray-200;
}

.tab-btn {
  @apply flex-1 py-3 text-center text-gray-600 hover:text-gray-900 relative;
}

.tab-btn.active {
  @apply text-blue-600;
}

.tab-btn.active::after {
  content: '';
  @apply absolute bottom-0 left-0 w-full h-0.5 bg-blue-600;
}

.outline-content {
  @apply flex-1 overflow-hidden;
}

.tab-panel {
  @apply h-full p-4 flex flex-col;
}

.content-input {
  @apply w-full h-[calc(100%-80px)] p-1 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent;
}

.button-group {
  @apply flex gap-2 mt-2 flex-shrink-0;
}

.ai-dropdown {
  @apply relative;
  width: calc(50% - 4px);
}

.ai-btn {
  @apply w-full px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed;
  box-sizing: border-box;
}

.tab-panel[data-tab="plot"] .ai-btn {
  width: calc(50% - 4px);
}

.save-btn {
  width: calc(50% - 4px);
  @apply px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed;
  box-sizing: border-box;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
  }

  to {
    transform: translateX(0);
  }
}

.ai-dropdown-menu {
  @apply absolute bottom-full left-0 w-full bg-white border border-gray-200 rounded shadow-lg mb-1 overflow-hidden;
  animation: slideUp 0.2s ease-out;
}

.dropdown-item {
  @apply w-full px-4 py-2 text-left text-gray-700 hover:bg-blue-50 hover:text-blue-600;
}

@keyframes slideUp {
  from {
    transform: translateY(10px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}
</style>