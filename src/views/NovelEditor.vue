<template>
  <div class="novel-editor-page">
    <div class="editor-header">
      <div class="title-section">
        <div class="left-section">
          <button @click="backToLibrary" class="back-btn">
            <span class="back-icon">←</span> 返回书库
          </button>
        </div>
        <div class="center-section">
          <h1 class="text-2xl font-bold">{{ bookTitle || '小说编辑器' }}</h1>
        </div>
        <div class="right-section">
          <button @click="showOutline = true" class="outline-btn">
            <span class="outline-icon">📝</span> 大纲
          </button>
        </div>
      </div>
      <OutlinePanel :show="showOutline" @close="showOutline = false" :currentBook="currentBook"
        :currentChapter="currentChapter" />
      <OutlineDetail :show="showDetailOutline" @close="showDetailOutline = false" :currentBook="currentBook"
        :currentChapter="currentChapter" />
    </div>
    <div class="editor-main">
      <div class="editor-sidebar">
        <ChapterTree v-if="activeTab === 'chapters'" :chapters="currentBook?.content || []" :currentBook="currentBook"
          @update:chapters="handleChaptersUpdate" @select-chapter="handleChapterSelect" @switch-tab="handleSwitchTab" />
        <FragmentPane v-else :bookId="currentBook?.id || ''" :currentBook="currentBook" @switch-tab="handleSwitchTab"
          @update:book="handleBookUpdate" />
      </div>
      <div class="editor-content">
        <TextEditor :current-chapter="currentChapter" :current-book="currentBook" @save-content="handleSaveContent" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from 'vue'
import OutlinePanel from '../components/OutlinePanel.vue'
import OutlineDetail from '../components/OutlineDetail.vue'
import { useRouter } from 'vue-router'
import TextEditor from '../components/TextEditor.vue'
import ChapterTree from '../components/ChapterTree.vue'
import FragmentPane from '../components/FragmentPane.vue'
import { BookConfigService, type Chapter, type Book } from '../services/bookConfigService'

const router = useRouter()
const bookTitle = ref('')
const currentChapter = ref<Chapter | null>(null)
const showOutline = ref(false)
const showDetailOutline = ref(false)
const currentBook = ref<Book | null>(null)
const activeTab = ref<'chapters' | 'fragments'>('chapters')

const handleChapterSelect = async (chapter: Chapter) => {
  if (chapter.type === 'chapter' && currentBook.value) {
    const findChapter = (chapters: Chapter[]): Chapter | undefined => {
      for (const ch of chapters) {
        if (ch.id === chapter.id) return ch
        if (ch.children) {
          const found = findChapter(ch.children)
          if (found) return found
        }
      }
    }

    const latestChapter = findChapter(currentBook.value.content)
    if (latestChapter) {
      currentChapter.value = JSON.parse(JSON.stringify(latestChapter))
    } else {
      currentChapter.value = null
    }
  }
}

// 处理标签页切换
const handleSwitchTab = (tab: 'chapters' | 'fragments') => {
  activeTab.value = tab
}

const handleChaptersUpdate = async (chapters: Chapter[]) => {
  if (!currentBook.value) return

  currentBook.value = {
    ...currentBook.value,
    content: chapters,
    lastEdited: new Date()
  }

  await BookConfigService.saveBook(currentBook.value)
}

const handleSaveContent = async (chapterId: string, content: string) => {
  if (!currentBook.value) return

  const updateChapters = (chapters: Chapter[]): Chapter[] => {
    return chapters.map(ch => {
      if (ch.id === chapterId) {
        return {
          ...ch,
          content
        }
      }
      if (ch.children) {
        return {
          ...ch,
          children: updateChapters(ch.children)
        }
      }
      return ch
    })
  }

  currentBook.value = {
    ...currentBook.value,
    content: updateChapters(currentBook.value.content),
    lastEdited: new Date()
  }

  await BookConfigService.saveBook(currentBook.value)
}

const handleBookUpdate = async (book: Book) => {
  if (!currentBook.value) return

  currentBook.value = {
    ...currentBook.value,
    ...book,
    lastEdited: new Date()
  }

  await BookConfigService.saveBook(currentBook.value)
}

const backToLibrary = () => {
  router.push('/')
}

// 定义事件处理函数
let switchToFragmentsHandler: (() => void) | null = null;

onMounted(async () => {
  const currentBookId = localStorage.getItem('currentBookId')
  if (currentBookId) {
    try {
      const book = await BookConfigService.getBook(currentBookId)
      if (book) {
        bookTitle.value = book.title
        currentBook.value = book
      }
    } catch (e) {
      console.error('获取书籍信息失败', e)
    }
  }

  // 监听从主进程发来的切换到片段栏的消息
  if (window.electronAPI) {
    // 注册一个监听器，监听switch-to-fragments事件
    switchToFragmentsHandler = () => {
      activeTab.value = 'fragments';
    };

    // 自定义事件监听
    document.addEventListener('switch-to-fragments', switchToFragmentsHandler);
  }
})

// 在组件卸载前移除事件监听器
onBeforeUnmount(() => {
  if (switchToFragmentsHandler) {
    document.removeEventListener('switch-to-fragments', switchToFragmentsHandler);
  }
});
</script>

<style scoped>
.novel-editor-page {
  @apply h-screen flex flex-col bg-gray-50 overflow-hidden;
  width: 100%;
  max-width: 100%;
}

.editor-header {
  @apply p-4 bg-white shadow-sm;
}

.title-section {
  @apply flex items-center relative;
}

.left-section {
  @apply absolute left-0 z-10;
}

.center-section {
  @apply flex-1 flex justify-center;
}

.back-btn {
  @apply flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors;
}

.back-icon {
  @apply text-xl;
}

.editor-main {
  @apply flex-1 p-4 overflow-hidden flex gap-4;
}

.editor-sidebar {
  @apply w-64 flex-shrink-0;
}

.editor-content {
  @apply flex-1 overflow-auto;
}

.right-section {
  @apply absolute right-0 z-10;
}

.outline-btn {
  @apply flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors;
}

.outline-icon {
  @apply text-xl;
}
</style>