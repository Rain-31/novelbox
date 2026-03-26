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
      <SettingEditor
        v-show="activeTab === 'setting'"
        :currentBook="currentBook"
        :currentChapter="currentChapter"
        :show="show && activeTab === 'setting'"
      />
      <div v-show="activeTab === 'plot'" class="tab-panel" data-tab="plot">
        <textarea v-model="plotContent" class="content-input" placeholder="写一些剧情发展的大概思路，如何开始、如何发展、如何结局等等，点击'AI生成'按钮..."
          @input="saveContent" :disabled="isGenerating"></textarea>
        <div class="button-group">
          <button @click="generatePlotContent" class="ai-btn" :disabled="isGenerating || !plotContent.trim()">
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
import { replaceOutlinePromptVariables } from '../services/promptVariableService'
import SettingEditor from './SettingEditor.vue'

const props = defineProps<{
  show: boolean
  currentBook: any
  currentChapter?: any
}>()

defineEmits(['close'])

const activeTab = ref('setting')
const plotContent = ref('')
const isGenerating = ref(false)

let aiService: AIService

const generatePlotContent = async () => {
  if (!plotContent.value.trim() || isGenerating.value) return

  isGenerating.value = true
  try {
    const aiConfig = await AIConfigService.getCurrentProviderConfig()
    aiService = new AIService(aiConfig)

    if (!props.currentBook) {
      ElMessage.error('无法获取当前书籍信息')
      return
    }

    const prompt = await replaceOutlinePromptVariables(props.currentBook, plotContent.value)
    const response = await aiService.generateText(prompt)
    if (response.error) {
      ElMessage.error(`AI生成失败：${response.error}`)
      return
    }

    plotContent.value = response.text
    saveContent()
  } catch (error) {
    ElMessage.error(error instanceof Error ? `AI生成失败：${error.message}` : 'AI生成失败，请检查网络连接和API配置')
  } finally {
    isGenerating.value = false
  }
}

const saveContent = async () => {
  if (!props.currentBook) return
  props.currentBook.plot = plotContent.value
  await BookConfigService.saveBook(props.currentBook)
}

onMounted(() => {
  if (props.currentBook) {
    plotContent.value = props.currentBook.plot || ''
  }
})

watch(() => props.show, (newVal) => {
  if (newVal && props.currentBook) {
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
  @apply flex-1 overflow-hidden flex flex-col;
}

.tab-panel {
  @apply flex-1 min-h-0 p-4 pb-2 flex flex-col;
}

.content-input {
  @apply flex-1 min-h-0 w-full p-1 border border-gray-200 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent;
}

.button-group {
  @apply flex gap-2 mt-2 mb-0 flex-shrink-0;
}

.ai-btn {
  width: calc(50% - 4px);
  @apply px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed;
  box-sizing: border-box;
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
</style>