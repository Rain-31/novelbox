<template>
  <div class="fragment-pane">
    <div class="header-row">
      <SidebarToggle 
        initialTab="fragments" 
        @toggle="handleToggle" 
      />
      <div class="action-buttons">
        <!-- <el-button class="action-button" circle>
          <el-icon><Document /></el-icon>
        </el-button> -->
        <el-tooltip content="添加片段" placement="top">
        <el-button class="action-button" @click="createFloatingFragment" circle>
          <el-icon><Plus /></el-icon>
        </el-button>
        </el-tooltip>
      </div>
    </div>
    <div class="fragment-list">
      <div 
        v-for="fragment in fragments" 
        :key="fragment.id" 
        class="fragment-item"
        :class="{ 'active': selectedFragmentId === fragment.id }"
        @click="selectFragment(fragment)"
      >
        <div class="fragment-content">
          <div class="fragment-title">{{ fragment.title }}</div>
          <div class="fragment-preview">{{ getPreview(fragment.content) }}</div>
        </div>
        <div class="fragment-actions">
          <!-- <el-tooltip content="编辑" placement="top">
            <el-button circle size="small" @click.stop="editFragment(fragment)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </el-tooltip> -->
          <el-tooltip content="删除" placement="top">
            <el-button circle size="small" type="danger" @click.stop="removeFragment(fragment)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </el-tooltip>
        </div>
      </div>
      <div v-if="fragments.length === 0" class="empty-state">
        暂无片段，点击上方"+"按钮添加
      </div>
    </div>
    
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import SidebarToggle from './SidebarToggle.vue'
import { BookConfigService, type Fragment, type Book } from '../services/bookConfigService'

const props = defineProps<{
  bookId: string
  currentBook: Book | null
}>()

const emit = defineEmits(['select-fragment', 'switch-tab', 'update:book'])

const fragments = ref<Fragment[]>([])
const selectedFragmentId = ref<string | null>(null)

// 处理切换
const handleToggle = (tab: 'chapters' | 'fragments') => {
  emit('switch-tab', tab)
}

// 获取片段预览
const getPreview = (content: string): string => {
  if (!content) return '无内容'
  return content.length > 50 ? content.substring(0, 50) + '...' : content
}

// 创建新的浮动片段
const createFloatingFragment = async () => {
  if (!props.currentBook) {
    ElMessage.error('当前没有打开的书籍')
    return
  }

  const newFragment = {
    id: uuidv4(),
    title: '新片段',
    content: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
  
  try {
    // 使用Electron API创建真正的独立窗口
    const result = await window.electronAPI.createFragmentWindow(newFragment)
    
    if (!result.success) {
      ElMessage.error(`创建片段窗口失败: ${result.error?.message || '未知错误'}`)
    }
    
    // 监听片段保存事件
    window.electronAPI.onFragmentSaved((savedFragment) => {
      console.log("onFragmentSaved", savedFragment)
      // 保存片段到列表
      const index = fragments.value.findIndex(f => f.id === savedFragment.id)
      if (index > -1) {
        fragments.value[index] = savedFragment
      } else {
        fragments.value.push(savedFragment)
      }
      // 保存到小说文件
      saveFragmentsToBook()
    })
  } catch (error) {
    console.error('创建片段窗口失败:', error)
    ElMessage.error('创建窗口失败')
  }
}

// 选择片段
const selectFragment = (fragment: Fragment) => {
  selectedFragmentId.value = fragment.id
  emit('select-fragment', fragment)
  
  // 打开片段窗口
  try {
    // 创建纯JavaScript对象副本，确保可序列化
    const serializable = {
      // 确保ID不为空，如果为空则生成一个
      id: fragment.id || uuidv4(),
      title: fragment.title,      // 确保标题被包含
      content: fragment.content,
      createdAt: fragment.createdAt, 
      updatedAt: fragment.updatedAt
    }
    
    // 添加调试日志
    console.log('传递给窗口的片段数据:', JSON.stringify(serializable))
    
    window.electronAPI.createFragmentWindow(serializable)
  } catch (error) {
    console.error('打开片段窗口失败:', error)
    ElMessage.error('打开片段窗口失败')
  }
}

// 删除片段
const removeFragment = (fragment: Fragment) => {
  if (!props.currentBook) return

  const index = fragments.value.findIndex(f => f.id === fragment.id)
  if (index > -1) {
    fragments.value.splice(index, 1)
    saveFragmentsToBook()
    ElMessage.success('片段已删除')
    
    if (selectedFragmentId.value === fragment.id) {
      selectedFragmentId.value = null
    }
  }
}

// 保存片段到书籍
const saveFragmentsToBook = async () => {
  if (!props.currentBook) return

  try {
    const updatedBook: Book = {
      ...props.currentBook,
      fragments: fragments.value,
      lastEdited: new Date()
    }
    
    await BookConfigService.saveBook(updatedBook)
    emit('update:book', updatedBook)
  } catch (error) {
    console.error('保存片段失败:', error)
    ElMessage.error('保存片段失败')
  }
}

// 从书籍加载片段
const loadFragments = () => {
  if (!props.currentBook) return
  
  if (props.currentBook.fragments && props.currentBook.fragments.length > 0) {
    fragments.value = props.currentBook.fragments
  } else {
    fragments.value = []
  }
}

// 监听书籍变化，重新加载片段
import { watch } from 'vue'
watch(() => props.currentBook, () => {
  loadFragments()
}, { immediate: true, deep: true })
</script>

<style scoped>
.fragment-pane {
  @apply bg-white rounded-lg shadow p-4 h-full overflow-hidden flex flex-col;
}

.header-row {
  @apply flex items-center justify-between mb-4;
}

.action-buttons {
  @apply flex gap-2;
}

.action-button {
  @apply flex items-center justify-center w-8 h-8 rounded-full border border-gray-300;
}

.fragment-list {
  @apply flex-1 overflow-auto;
}

.fragment-item {
  @apply border-b border-gray-200 p-3 cursor-pointer hover:bg-gray-50 flex justify-between;
}

.fragment-item.active {
  @apply bg-blue-50;
}

.fragment-content {
  @apply flex-1 mr-2;
}

.fragment-title {
  @apply font-medium mb-1;
}

.fragment-preview {
  @apply text-sm text-gray-500 line-clamp-2;
}

.fragment-actions {
  @apply flex gap-2 items-start;
}

.empty-state {
  @apply text-center text-gray-400 p-4;
}
</style> 