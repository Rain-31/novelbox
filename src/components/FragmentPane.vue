<template>
  <div class="fragment-pane">
    <div class="header-row">
      <SidebarToggle 
        initialTab="fragments" 
        @toggle="handleToggle" 
      />
      <div class="action-buttons">
        <el-button class="action-button" circle>
          <el-icon><Document /></el-icon>
        </el-button>
        <el-button class="action-button" @click="addFragment" circle>
          <el-icon><Plus /></el-icon>
        </el-button>
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
          <el-tooltip content="编辑" placement="top">
            <el-button circle size="small" @click.stop="editFragment(fragment)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </el-tooltip>
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
    
    <el-dialog v-model="dialogVisible" title="编辑片段" width="500px">
      <el-form :model="currentFragment" label-position="top">
        <el-form-item label="标题">
          <el-input v-model="currentFragment.title" placeholder="片段标题" />
        </el-form-item>
        <el-form-item label="内容">
          <el-input 
            v-model="currentFragment.content" 
            type="textarea" 
            :rows="8"
            placeholder="片段内容" 
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="saveFragment">保存</el-button>
        </span>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Edit, Delete, Document } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import SidebarToggle from './SidebarToggle.vue'

interface Fragment {
  id: string
  title: string
  content: string
  createdAt: Date
  updatedAt: Date
}

const props = defineProps<{
  bookId: string
}>()

const emit = defineEmits(['select-fragment', 'switch-tab'])

const fragments = ref<Fragment[]>([])
const selectedFragmentId = ref<string | null>(null)
const dialogVisible = ref(false)
const currentFragment = ref<Fragment>({
  id: '',
  title: '',
  content: '',
  createdAt: new Date(),
  updatedAt: new Date()
})
const isEditing = ref(false)

// 处理切换
const handleToggle = (tab: 'chapters' | 'fragments') => {
  emit('switch-tab', tab)
}

// 获取片段预览
const getPreview = (content: string): string => {
  if (!content) return '无内容'
  return content.length > 50 ? content.substring(0, 50) + '...' : content
}

// 添加新片段
const addFragment = () => {
  isEditing.value = false
  currentFragment.value = {
    id: uuidv4(),
    title: '',
    content: '',
    createdAt: new Date(),
    updatedAt: new Date()
  }
  dialogVisible.value = true
}

// 编辑片段
const editFragment = (fragment: Fragment) => {
  isEditing.value = true
  currentFragment.value = { ...fragment }
  dialogVisible.value = true
}

// 保存片段
const saveFragment = () => {
  if (!currentFragment.value.title.trim()) {
    ElMessage.warning('标题不能为空')
    return
  }
  
  if (isEditing.value) {
    // 更新现有片段
    const index = fragments.value.findIndex(f => f.id === currentFragment.value.id)
    if (index > -1) {
      currentFragment.value.updatedAt = new Date()
      fragments.value[index] = { ...currentFragment.value }
    }
  } else {
    // 添加新片段
    fragments.value.push({ ...currentFragment.value })
  }
  
  // TODO: 保存到持久化存储
  saveFragmentsToStorage()
  
  dialogVisible.value = false
  ElMessage.success(isEditing.value ? '片段已更新' : '片段已添加')
}

// 选择片段
const selectFragment = (fragment: Fragment) => {
  selectedFragmentId.value = fragment.id
  emit('select-fragment', fragment)
}

// 删除片段
const removeFragment = (fragment: Fragment) => {
  const index = fragments.value.findIndex(f => f.id === fragment.id)
  if (index > -1) {
    fragments.value.splice(index, 1)
    saveFragmentsToStorage()
    ElMessage.success('片段已删除')
    
    if (selectedFragmentId.value === fragment.id) {
      selectedFragmentId.value = null
    }
  }
}

// 保存片段到存储
const saveFragmentsToStorage = () => {
  // TODO: 实现持久化存储
  localStorage.setItem(`fragments_${props.bookId}`, JSON.stringify(fragments.value))
}

// 加载片段
const loadFragments = () => {
  try {
    const savedFragments = localStorage.getItem(`fragments_${props.bookId}`)
    if (savedFragments) {
      fragments.value = JSON.parse(savedFragments)
    }
  } catch (error) {
    console.error('加载片段失败:', error)
  }
}

// 初始加载
loadFragments()
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