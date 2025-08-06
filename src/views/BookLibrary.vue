<template>
  <div class="book-library-page">
    <AIConfigModal v-model:showAIConfigModal="showAIConfigModal" />
    <div class="library-header">
      <div class="header-left">
        <button @click="showAIConfigModal = true" class="config-btn">
          <span class="icon">⚙️</span> AI配置
        </button>
      </div>
      <h1 class="page-title">我的书库</h1>
      <div class="header-right">
        <button @click="showCreateModal = true" class="create-btn">
          <span class="icon">+</span> 创建新书
        </button>
      </div>
    </div>

    <div class="books-container" v-if="books.length > 0">
      <div v-for="book in books" :key="book.id" class="book-card">
        <div class="book-info">
          <h2 class="book-title">{{ book.title }}</h2>
          <p class="book-desc">{{ book.description || '暂无简介' }}</p>
          <p class="book-meta">最后编辑: {{ formatDate(book.lastEdited) }}</p>
        </div>
        <div class="book-actions">
          <button @click="openBook(book)" class="open-btn">打开</button>
          <button @click="editBook(book)" class="edit-btn">编辑</button>
          <button @click="confirmDelete(book)" class="delete-btn">删除</button>
        </div>
      </div>
    </div>

    <div class="empty-state" v-else>
      <div class="empty-icon">📚</div>
      <p class="empty-text">您的书库还没有书籍</p>
      <p class="empty-subtext">点击"创建新书"按钮开始您的创作之旅</p>
    </div>

    <!-- 创建书籍对话框 -->
    <div class="modal-overlay" v-if="showCreateModal" @click="closeModal"></div>
    <div class="modal" v-if="showCreateModal">
      <div class="modal-header">
        <h2 class="modal-title">{{ editingBook ? '编辑书籍' : '创建新书' }}</h2>
        <button @click="closeModal" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label for="bookTitle">书名</label>
          <input type="text" id="bookTitle" v-model="newBook.title" placeholder="请输入书名" class="form-input" />
        </div>
        <div class="form-group">
          <label for="bookDesc">简介</label>
          <div class="desc-input-group">
            <textarea id="bookDesc" v-model="newBook.description" placeholder="请输入书籍简介"
              class="form-textarea"></textarea>
            <button @click="showAIGenModal = true" class="ai-gen-btn">
              <span class="icon">🤖</span> AI生成
            </button>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="closeModal" class="cancel-btn">取消</button>
        <button @click="saveBook" class="save-btn">保存</button>
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div class="modal-overlay" v-if="showDeleteModal" @click="cancelDelete"></div>
    <div class="modal" v-if="showDeleteModal">
      <div class="modal-header">
        <h2 class="modal-title">确认删除</h2>
        <button @click="cancelDelete" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <p class="confirm-text">确定要删除《{{ bookToDelete?.title }}》吗？此操作不可恢复。</p>
      </div>
      <div class="modal-footer">
        <button @click="cancelDelete" class="cancel-btn">取消</button>
        <button @click="deleteBook" class="delete-confirm-btn">确认删除</button>
      </div>
    </div>

    <!-- AI生成对话框 -->
    <div class="modal-overlay" v-if="showAIGenModal" @click="showAIGenModal = false"></div>
    <div class="modal" v-if="showAIGenModal">
      <div class="modal-header">
        <h2 class="modal-title">AI生成书名简介</h2>
        <button @click="showAIGenModal = false" class="modal-close">×</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>输入内容</label>
          <textarea v-model="aiInputContent" placeholder="输入任何有关小说的内容，越详细越好……" class="form-textarea h-40"
            :disabled="isGenerating"></textarea>
        </div>
        <div class="form-group">
          <label>AI输出</label>
          <textarea v-model="aiOutputContent" placeholder="AI生成的内容将显示在这里" class="form-textarea h-40"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button @click="showAIGenModal = false" class="cancel-btn">取消</button>
        <button @click="applyAIContent" class="apply-btn" :disabled="!aiOutputContent.trim()">
          应用
        </button>
        <button @click="generateDescription" class="save-btn" :disabled="isGenerating || !aiInputContent.trim()">
          {{ isGenerating ? '生成中...' : '生成' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox } from 'element-plus'
import { ref, reactive, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { BookConfigService } from '../services/bookConfigService'
import AIConfigModal from '../components/AIConfigModal.vue'
import { Book } from '../services/bookConfigService'
import { replaceBookNameAndDescPromptVariables } from '../services/promptVariableService'

const router = useRouter()
const books = ref<Book[]>([])
const showCreateModal = ref(false)
const showDeleteModal = ref(false)
const editingBook = ref<Book | null>(null)
const bookToDelete = ref<Book | null>(null)

const newBook = reactive({
  title: '',
  description: ''
})

const loadBooks = async () => {
  try {
    books.value = await BookConfigService.listBooks()
  } catch (error) {
    console.error('加载书籍数据失败', error)
    books.value = []
  }
}

const saveBooks = async () => {
  for (const book of books.value) {
    try {
      await BookConfigService.saveBook(book)
    } catch (error) {
      console.error('保存书籍失败', error)
      ElMessage.error(error.message)
    }
  }
}

const formatDate = (date: Date) => {
  return new Date(date).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const openBook = (book: Book) => {
  // 保存当前选中的书籍ID到本地存储
  localStorage.setItem('currentBookId', book.id)
  // 导航到编辑器页面
  router.push('/editor')
}

const editBook = (book: Book) => {
  editingBook.value = book
  newBook.title = book.title
  newBook.description = book.description || ''
  showCreateModal.value = true
}

const confirmDelete = (book: Book) => {
  bookToDelete.value = book
  showDeleteModal.value = true
}

const deleteBook = async () => {
  if (bookToDelete.value) {
    try {
      await BookConfigService.deleteBook(bookToDelete.value.id)
      books.value = books.value.filter(b => b.id !== bookToDelete.value?.id)
      showDeleteModal.value = false
      bookToDelete.value = null
    } catch (error) {
      console.error('删除书籍失败', error)
    }
  }
}

const cancelDelete = () => {
  showDeleteModal.value = false
  bookToDelete.value = null
}

const saveBook = () => {
  if (!newBook.title.trim()) {
    alert('请输入书名')
    return
  }

  if (editingBook.value) {
    // 编辑现有书籍
    const index = books.value.findIndex(b => b.id === editingBook.value?.id)
    if (index !== -1) {
      books.value[index] = {
        ...books.value[index],
        title: newBook.title,
        description: newBook.description,
        lastEdited: new Date()
      }
    }
  } else {
    // 创建新书籍
    const newBookObj: Book = {
      id: Date.now().toString(),
      title: newBook.title,
      description: newBook.description,
      content: [],
      lastEdited: new Date(),
      setting: '',
      plot: ''
    }
    books.value.push(newBookObj)
  }

  saveBooks()
  closeModal()
}

const closeModal = () => {
  showCreateModal.value = false
  editingBook.value = null
  newBook.title = ''
  newBook.description = ''
}

const showAIConfigModal = ref(false)
const showAIGenModal = ref(false)
const aiInputContent = ref('')
const aiOutputContent = ref('')
const isGenerating = ref(false)

// 初始化数据和配置
onMounted(async () => {
  try {
    // 加载书籍数据
    loadBooks()
  } catch (error) {
    console.error('初始化失败:', error)
  }
})

import { ElMessage } from 'element-plus'

import AIService from '../services/aiService'
import { AIConfigService } from '../services/aiConfigService'

const generateDescription = async () => {
  const aiConfig = await AIConfigService.getCurrentProviderConfig();
  const aiService = new AIService(aiConfig);

  isGenerating.value = true
  try {
    const prompt = await replaceBookNameAndDescPromptVariables(aiInputContent.value)
    const result = await aiService.generateText(prompt)

    if (result.error) {
      throw new Error(result.error)
    }

    aiOutputContent.value = result.text
    ElMessage.success('生成成功')
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
const applyAIContent = () => {
  const content = aiOutputContent.value
  const titleMatch = content.match(/书名[:：]\s*([^\n]+)/)
  const descMatch = content.match(/简介[:：]\s*([\s\S]*?)(?=\n\n|$)/)

  if (titleMatch && descMatch) {
    newBook.title = titleMatch[1].trim()
    newBook.description = descMatch[1].trim()
    showAIGenModal.value = false
    showCreateModal.value = true
  } else {
    ElMessage.warning('无法解析AI输出内容，请确保格式正确')
  }
}
</script>

<style scoped>
.book-library-page {
  @apply min-h-screen w-full flex flex-col bg-gray-50 overflow-auto p-4 pb-8;
}

.library-header {
  @apply flex justify-between items-center mb-8;
}

.create-btn {
  @apply bg-blue-500 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-600 transition-colors;
}

.icon {
  @apply text-xl font-bold;
}

.books-container {
  @apply grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 justify-items-center pb-8;
}

.book-card {
  @apply bg-white rounded-lg shadow-md p-6 flex flex-col w-full min-w-[280px] max-w-[320px];
}

.book-info {
  @apply flex-1;
}

.book-title {
  @apply text-xl font-bold mb-2 text-gray-800;
}

.book-desc {
  @apply text-gray-600 mb-4 line-clamp-2;
}

.book-meta {
  @apply text-sm text-gray-500 mb-4;
}

.book-actions {
  @apply flex gap-2 mt-2 justify-center;
}

.edit-btn {
  @apply px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors;
}

.open-btn {
  @apply px-3 py-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors;
}

.delete-btn {
  @apply px-3 py-1.5 bg-red-100 text-red-600 rounded hover:bg-red-200 transition-colors;
}

.empty-state {
  @apply flex flex-col items-center justify-center h-64 bg-white rounded-lg shadow-sm p-8;
}

.empty-icon {
  @apply text-5xl mb-4;
}

.empty-text {
  @apply text-xl font-medium text-gray-700 mb-2;
}

.empty-subtext {
  @apply text-gray-500;
}

.modal {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  background-color: white !important;
  border-radius: 0.5rem !important;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
  z-index: 50 !important;
  width: 90% !important;
  max-width: 36rem !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  max-height: 95vh !important;
}

.modal-overlay {
  @apply fixed inset-0 bg-black bg-opacity-50 z-40;
}

.modal-header {
  @apply flex justify-between items-center p-4 border-b border-gray-200;
}

.modal-title {
  @apply text-xl font-bold text-gray-800;
}

.modal-close {
  @apply text-2xl text-gray-500 hover:text-gray-700;
}

.modal-body {
  @apply p-6 overflow-y-auto flex-1 overflow-x-hidden;
}

.modal-footer {
  @apply flex justify-end gap-3 p-4 border-t border-gray-200;
}

.form-group {
  @apply mb-4;
}

.form-input,
.form-textarea {
  @apply w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent box-border;
}

.form-textarea {
  @apply h-24 resize-none;
}

.desc-input-group {
  @apply relative;
}

.ai-gen-btn {
  @apply absolute right-2 top-2 flex items-center gap-1 px-3 py-1.5 bg-green-500 text-white rounded-md transition-all text-sm;
  opacity: 0.4;
}

.ai-gen-btn:hover {
  @apply bg-green-600;
  opacity: 1;
}

.h-40 {
  height: 10rem;
}

.modal-actions {
  @apply flex gap-2;
}

.cancel-btn {
  @apply px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700;
}

.save-btn {
  @apply px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors dark:bg-blue-700 dark:hover:bg-blue-800;
}

.delete-confirm-btn {
  @apply px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors dark:bg-red-700 dark:hover:bg-red-800;
}

.confirm-text {
  @apply text-center py-4;
}

.header-left {
  @apply flex items-center;
}

.header-right {
  @apply flex items-center gap-4;
}

.library-header {
  @apply flex justify-between items-center p-6 bg-white shadow-sm;
}

.page-title {
  @apply text-4xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600 tracking-wider;
  font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.1);
  transform: scale(1);
  transition: transform 0.2s ease;
}

.page-title:hover {
  transform: scale(1.02);
}

.header-right {
  @apply flex items-center gap-6;
}

.config-btn {
  @apply flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors;
}

.apply-btn {
  @apply px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors;
}
</style>