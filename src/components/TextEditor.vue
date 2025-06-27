<template>
  <Searcher v-if="quillEditor?.getQuill()" :quill="quillEditor.getQuill()"
    v-model:showSearchReplace="showSearchReplace" />
  <Proofreader v-if="showProofreader" :show="showProofreader" :content="content"
    :current-chapter="currentChapter" :current-book="currentBook" :quill="quillEditor?.getQuill()"
    @close="showProofreader = false" />
  <div class="text-editor-container">
    <OutlineDetail v-if="showDetailOutline" :show="showDetailOutline" :current-chapter="currentChapter"
      :current-book="currentBook" @close="showDetailOutline = false" />
    <div v-if="!currentChapter || currentChapter.type !== 'chapter'" class="no-chapter-selected">
      <div class="text-center">
        <p class="text-xl font-medium mb-2">请选择一个章节开始编辑</p>
        <p class="text-gray-500">在左侧章节列表中选择要编辑的章节</p>
      </div>
    </div>
    <template v-else>
      <!-- 保存成功提示 -->
      <div class="save-toast" v-show="showSaveToast">
        <span class="icon">✓</span>
        内容保存成功
      </div>

      <!-- 添加光标图标 -->
      <div v-if="aiTextContinueController.showContinueCursorValue" class="continue-cursor" 
        :style="aiTextContinueController.continueCursorStyleValue">
        <svg viewBox="0 0 24 24" width="28" height="28">
          <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
        </svg>
      </div>

      <QuillEditor v-model:content="content" :options="editorOptions" contentType="html" theme="snow"
        @textChange="onTextChange" class="h-full" ref="quillEditor" />
      <div class="ai-continue-toolbar">
        <input type="text" v-model="aiTextContinueController.continuePromptValue" placeholder="输入续写的剧情指导..." class="continue-input"
          :disabled="aiTextContinueController.isGeneratingValue" @focus="handleContinueInputFocus" @blur="handleContinueInputBlur" />
        <button @click="handleAIContinue" class="continue-btn" :class="{ 'stop-btn': aiTextContinueController.isGeneratingValue }">
          {{ aiTextContinueController.isGeneratingValue ? '停止生成' : 'AI续写' }}
        </button>
      </div>
      <!-- Floating Toolbar -->
      <div v-if="floatingToolbarController.showFloatingToolbarValue" class="floating-toolbar" :style="floatingToolbarController.toolbarStyleValue">
        <button @click="handleExpandSelectedText">扩写</button>
        <button @click="handleCondenseSelectedText">缩写</button>
        <input v-if="floatingToolbarController.showRewriteInputValue" v-model="floatingToolbarController.rewriteContentValue" placeholder="输入改写内容..." class="rewrite-input"
          @focus="handleRewriteInputFocus" />
        <button @click="handleRewriteSelectedText" class="rewrite-btn">改写</button>
      </div>
      <div class="status-bar" v-if="currentChapter && currentChapter.type === 'chapter'">
        <span>本章字数：{{ chapterWordCount }}字</span>
      </div>
    </template>
  </div>
  
  <!-- 添加片段面板组件，但不直接显示 -->
  <FragmentPane
    ref="fragmentPaneRef"
    :book-id="currentBook?.id || ''"
    :current-book="currentBook"
    style="display: none;"
  />
</template>

<script setup lang="ts">
import { ref, onMounted, watch, nextTick, onBeforeUnmount } from 'vue'
import { QuillEditor } from '@vueup/vue-quill'
import Searcher from './Searcher.vue'
import '@vueup/vue-quill/dist/vue-quill.snow.css'
import OutlineDetail from './OutlineDetail.vue'
import { ElMessage } from 'element-plus'
import Delta from 'quill-delta';
import { type Book, type Chapter } from '../services/bookConfigService'
import Proofreader from './Proofreader.vue'
import AITextContinueController from '../controllers/AITextContinueController'
import AIChapterGenerateController from '../controllers/AIChapterGenerateController'
import FloatingToolbarController from '../controllers/FloatingToolbarController'
import FragmentPane from './FragmentPane.vue'


const content = ref('')

// AI续写控制器
const aiTextContinueController = new AITextContinueController({
  onContentSave: (chapterId, content) => {
    saveChapterContent(chapterId, content);
  }
});

// AI生成章节控制器
const aiChapterGenerateController = new AIChapterGenerateController({
  onContentSave: (chapterId, content) => {
    saveChapterContent(chapterId, content);
  }
});

// 片段面板引用
const fragmentPaneRef = ref(null);

// 浮动工具栏控制器
const floatingToolbarController = new FloatingToolbarController({
  onContentSave: (chapterId, content) => {
    saveChapterContent(chapterId, content);
  },
  onShowFragment: (content, title) => {
    // 调用片段面板的创建片段方法
    if (fragmentPaneRef.value) {
      fragmentPaneRef.value.createFragmentFromContent(content, title);
    } else {
      ElMessage.error('片段面板未初始化');
    }
  }
});

// 字数统计
const chapterWordCount = ref(0)

// 计算字数
const calculateWordCount = () => {
  if (!props.currentChapter?.id) return;

  // 计算当前章节字数
  const editor = quillEditor.value?.getQuill()
  if (editor) {
    const text = editor.getText().trim()
    chapterWordCount.value = text.length
  }
}

// 初始化AI生成按钮
const initAIGenerateButton = () => {
  aiChapterGenerateController.initGenerateButton();
}

// 处理来自片段窗口的消息
const handleFragmentMessage = (messageStr: string) => {
  try {
    
    // 解析消息
    const data = JSON.parse(messageStr);
    
    if (data.type === 'insert-fragment') {
      // 插入内容到编辑器
      const editor = quillEditor.value.getQuill();
      const selection = editor.getSelection();
      if (selection) {
        editor.insertText(selection.index, data.content, 'user');
        ElMessage.success('内容已插入');
      } else {
        editor.insertText(editor.getLength() - 1, data.content, 'user');
        ElMessage.success('内容已插入到文档末尾');
      }
    } else if (data.type === 'replace-fragment') {
      // 替换选中内容
      const editor = quillEditor.value.getQuill();
      const selection = editor.getSelection();
      if (selection && selection.length > 0) {
        editor.deleteText(selection.index, selection.length, 'user');
        editor.insertText(selection.index, data.content, 'user');
        ElMessage.success('内容已替换');
      } else {
        ElMessage.warning('请先选择要替换的文本');
      }
    } else if (data.type === 'stop-generation') {
      // 停止AI生成，传递片段ID
      if (data.fragmentId) {
        floatingToolbarController.stopGeneration(data.fragmentId);
      } else {
        console.warn('停止生成命令缺少fragmentId');
        floatingToolbarController.stopGeneration();
      }
    } else if (data.type === 'regenerate-content') {
      // 重新生成内容，传递片段ID
      if (data.fragmentId) {
        
        floatingToolbarController.regenerateContent(
          quillEditor.value.getQuill(), 
          props.currentChapter, 
          props.currentBook, 
          data.fragmentId
        );
        
      } else {
        console.warn('重新生成命令缺少fragmentId');
        ElMessage.error('重新生成需要指定片段ID');
      }
    } else {
      console.warn('未知的片段消息类型:', data.type);
    }
  } catch (error) {
    console.error('处理片段消息失败:', error);
  }
}

// 处理扩写选中文本
const handleExpandSelectedText = async () => {
  const editor = quillEditor.value.getQuill();
  await floatingToolbarController.expandSelectedText(editor, props.currentChapter, props.currentBook);
};

// 处理缩写选中文本
const handleCondenseSelectedText = async () => {
  const editor = quillEditor.value.getQuill();
  await floatingToolbarController.condenseSelectedText(editor, props.currentChapter, props.currentBook);
};

// 处理改写输入框获得焦点
const handleRewriteInputFocus = () => {
  const editor = quillEditor.value.getQuill();
  floatingToolbarController.handleRewriteInputFocus(editor);
};

// 处理改写选中文本
const handleRewriteSelectedText = async () => {
  const editor = quillEditor.value.getQuill();
  await floatingToolbarController.rewriteSelectedText(editor, props.currentChapter, props.currentBook);
};

let saveTimeout: NodeJS.Timeout | null = null;
let isNewChapter = false;
let isModified = false;
// 添加工具栏观察器
let toolbarObserver: MutationObserver | null = null;

// 监听工具栏变化
const observeToolbar = () => {
  if (toolbarObserver) {
    toolbarObserver.disconnect();
  }
  
  toolbarObserver = new MutationObserver(() => {
    // 当工具栏发生变化时，初始化AI生成按钮
    initAIGenerateButton();
  });
  
  const toolbar = document.querySelector('.ql-toolbar');
  if (toolbar) {
    toolbarObserver.observe(toolbar, {
      childList: true,
      subtree: true,
      attributes: true
    });
  }
};

onMounted(() => {
  // 组件挂载后立即初始化AI生成按钮
  initAIGenerateButton()
  
  // 设置工具栏观察器
  nextTick(() => {
    observeToolbar();
  });

  // 添加对片段编辑器消息的处理
  if (window.electronAPI) {
    window.electronAPI.onFragmentMessage(handleFragmentMessage)
  }
})

// 使用防抖处理，避免频繁保存，设置2秒延迟
watch(content, (newValue) => {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }
  if (isNewChapter) {
    return;
  }
  isModified = true;
  saveTimeout = setTimeout(() => {
    if (isModified) {
      saveChapterContent(props.currentChapter.id, content.value);
    }
  }, 2000);

})
// 组件卸载前保存
onBeforeUnmount(() => {
  if (toolbarObserver) {
    toolbarObserver.disconnect();
    toolbarObserver = null;
  }
  
  if (props.currentChapter?.type === 'chapter' && isModified) {
    saveChapterContent(props.currentChapter.id, content.value);
  }
});

// 窗口关闭事件处理
window.addEventListener('beforeunload', () => {
  if (props.currentChapter?.type === 'chapter' && isModified) {
    saveChapterContent(props.currentChapter.id, content.value);
  }
});

const quillEditor = ref()
const showSearchReplace = ref(false)
const showDetailOutline = ref(false)
const showSaveToast = ref(false)
const showProofreader = ref(false)

// 监听编辑器实例
watch(() => quillEditor.value?.getQuill(), (editor) => {
  if (editor) {
    editor.root.setAttribute('spellcheck', 'false')
  }
}, { immediate: true })

const editorOptions = {
  modules: {
    history: {
      delay: 2000,
      maxStack: 100,
      userOnly: true
    },
    clipboard: {
      matchVisual: false,
      matchers: [
        [Node.TEXT_NODE, function (node, delta) {
          return new Delta().insert(node.data);
        }]
      ]
    },
    toolbar: {
      container: [
        ['detail-outline'],
        [
          'save',
          'format',
          'bold',
          'undo', 'redo',
          { 'size': ['small', false, 'large'] },
          { 'proofread': 'proofread', 'style': 'background-color:white !important;color:black !important;' },
          { 'search': 'search', 'style': 'background-color:white !important;color:black !important;' },
        ],
        ['ai-generate']
      ],
      handlers: {
        'search': function () {
          showSearchReplace.value = !showSearchReplace.value;
        },
        'detail-outline': function () {
          showDetailOutline.value = !showDetailOutline.value;
        },
        'proofread': function () {
          showProofreader.value = !showProofreader.value;
        },
        save: function () {
          if (props.currentChapter?.id) {
            saveChapterContent(props.currentChapter.id, content.value);
          }
        },
        format: function () {
          const editor = quillEditor.value.getQuill();
          const selection = editor.getSelection();

          const content = selection?.length > 0 ?
            editor.getContents(selection.index, selection.length) :
            editor.getContents();

          const formattedDelta = new Delta();
          content.ops.forEach(op => {
            if (typeof op.insert === 'string') {
              op.insert.split(/\n+/).forEach(paragraph => {
                const trimmed = paragraph.trim();
                if (trimmed) {
                  formattedDelta
                    .insert('　　' + trimmed)
                    .insert('\n\n', { 'indent-block': true });
                }
              });
            }
          });
          // 执行原子操作
          if (selection?.index >= 0 && selection?.length > 0) {
            editor.updateContents(
              new Delta()
                .retain(selection.index)
                .delete(selection.length)
                .concat(formattedDelta),
              'user'
            );
            // 设置新选区
            editor.setSelection(
              selection.index,
              formattedDelta.length(),
              'silent'
            );
          } else {
            editor.setContents(formattedDelta, 'user');
          }
        },
        'ai-generate': async function () {
          const editor = quillEditor.value.getQuill();
          await aiChapterGenerateController.handleAIGenerate(editor, props.currentChapter, props.currentBook);
        },
        undo: function () {
          quillEditor.value.getQuill().history.undo();
        },
        redo: function () {
          quillEditor.value.getQuill().history.redo();
        }
      }
    },
    keyboard: {
      bindings: {
        'ctrl+f': {
          key: 70,
          ctrlKey: true,
          handler: () => {
            showSearchReplace.value = !showSearchReplace.value
          }
        },
        'ctrl+s': {
          key: 83,
          ctrlKey: true,
          handler: () => {
            if (props.currentChapter?.id) {
              saveChapterContent(props.currentChapter.id, content.value);
            }
            return false;
          }
        }
      }
    }
  },
  placeholder: '开始创作你的小说...',
}

const props = defineProps<{
  currentChapter: {
    id: string
    title: string
    type: 'volume' | 'chapter'
    content?: string
    detailOutline: {
      chapterNumber: string
      detailContent: string
    }
  } | null,
  currentBook: Book | null
}>()

const emit = defineEmits<{
  'save-content': [chapterId: string, content: string]
}>()

// 添加性能优化相关的状态
const isUpdating = ref(false);
const updateTimeout = ref<number | null>(null);

// 优化章节切换逻辑
watch(() => props.currentChapter, async (newChapter, oldChapter) => {
  
  try {
    // 保存旧章节内容
    if (oldChapter?.type === 'chapter' && oldChapter?.id && isModified) {
      await saveChapterContent(oldChapter.id, content.value);
    }
    
    isNewChapter = true;
    isUpdating.value = true;
    
    // 清空编辑器内容
    content.value = '';
    await nextTick();

    // 加载新章节内容
    if (newChapter?.type === 'chapter' && newChapter?.id) {
      const latestContent = await getLatestChapterContent(newChapter.id);
      
      const editor = quillEditor.value?.getQuill();
      if (editor) {
        try {
          // 暂时禁用编辑器和历史记录
          editor.disable();
          editor.history.clear();
          
          // 使用 requestAnimationFrame 优化 DOM 更新
          await new Promise<void>(resolve => {
            requestAnimationFrame(() => {
              content.value = latestContent || '';
              
              // 使用 requestAnimationFrame 确保 DOM 更新完成
              requestAnimationFrame(() => {
                editor.setContents(editor.clipboard.convert(content.value));
                editor.enable();
                // 在内容更新完成后立即计算字数
                calculateWordCount();
                // 初始化AI生成按钮
                initAIGenerateButton();
                resolve();
              });
            });
          });
          
          // 重新绑定选择事件
          editor.off('selection-change');
          editor.on('selection-change', handleSelectionChange);
        } catch (error) {
          console.error('编辑器内容设置失败', error);
          editor.enable();
        }
      }
    }
    
    isNewChapter = false;
    isUpdating.value = false;
    
  } catch (error) {
    console.error('章节切换处理失败:', error);
    isUpdating.value = false;
  }
}, { immediate: true, deep: true });

// 优化内容更新逻辑
const onTextChange = () => {
  if (isUpdating.value) return;
  
  // 使用防抖处理内容更新
  if (updateTimeout.value) {
    clearTimeout(updateTimeout.value);
  }
  
  updateTimeout.value = window.setTimeout(() => {
    calculateWordCount();
  }, 200);
};

// 保存章节内容
// 获取最新章节内容
const getLatestChapterContent = async (chapterId: string) => {
  try {
    if (!props.currentBook) return '';
    const findChapterContent = (chapters: Chapter[]): Chapter | undefined => {
      for (const ch of chapters) {
        if (ch.id === chapterId) return ch;
        if (ch.children) {
          const found = findChapterContent(ch.children);
          if (found) return found;
        }
      }
    }
    const targetChapter = findChapterContent(props.currentBook.content || []);
    return targetChapter?.content || '';
  } catch (error) {
    console.error('获取章节内容失败:', error);
    ElMessage.error('获取章节内容失败');
    return '';
  }
}

const saveChapterContent = async (chapterId?: string, contentToSave?: string) => {
  try {
    // 如果没有提供章节ID且当前章节为空，则直接返回
    const targetChapterId = chapterId || props.currentChapter?.id;
    if (!targetChapterId) return;

    emit('save-content', targetChapterId, contentToSave || content.value);
    isModified = false;
    showSaveToast.value = true;
    setTimeout(() => {
      showSaveToast.value = false;
    }, 2000);
    calculateWordCount();
  } catch (error) {
    console.error('保存章节内容失败:', error);
    ElMessage.error('保存章节内容失败');
  }
}

// 使用控制器的AI续写方法
const handleAIContinue = async () => {
  const editor = quillEditor.value.getQuill();
  await aiTextContinueController.handleAIContinue(editor, props.currentChapter, props.currentBook);
}

// 使用控制器的输入框焦点方法
const handleContinueInputFocus = () => {
  const editor = quillEditor.value.getQuill();
  aiTextContinueController.handleContinueInputFocus(editor);
}

// 使用控制器的输入框失焦方法
const handleContinueInputBlur = () => {
  aiTextContinueController.handleContinueInputBlur();
}

// 处理选择变化，使用浮动工具栏控制器
const handleSelectionChange = (range: any, oldRange: any, source: string) => {
  const editor = quillEditor.value.getQuill();
  floatingToolbarController.handleSelectionChange(range, oldRange, source, editor);
};
</script>

<style scoped>
.floating-toolbar {
  position: absolute;
  display: flex;
  align-items: center;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  padding: 4px;
  z-index: 1000;
  transition: all 0.3s ease;
  transform-origin: left center;
}

.floating-toolbar button {
  margin: 0 4px;
  padding: 4px 8px;
  border: none;
  background: #f0f0f0;
  border-radius: 2px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.floating-toolbar button:hover {
  background: #e0e0e0;
}

.rewrite-btn {
  position: relative;
}

.rewrite-input {
  margin-left: 8px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 2px;
  width: 0;
  opacity: 0;
  transition: all 0.3s ease;
  transform-origin: left center;
}

.floating-toolbar.show-rewrite {
  transform: translateX(0);
}

.floating-toolbar.show-rewrite .rewrite-btn {
  transform: translateX(0);
}

.floating-toolbar.show-rewrite .rewrite-input {
  width: 200px;
  opacity: 1;
  margin-left: 8px;
}

.text-editor-container {
  @apply flex flex-col h-full;
}

.status-bar {
  @apply text-sm max-w-[150px] truncate text-right text-gray-600;
}

.status-bar {
  @apply flex justify-end p-1 bg-gray-50 border-b border-gray-200 max-w-[200px] ml-auto;
}

:deep(.ql-toolbar) {
  @apply bg-white border-b border-gray-200 sticky top-0 z-10;
  padding: 8px !important;
}

:deep(.ql-container) {
  @apply flex-1 bg-white overflow-hidden;
  font-size: 16px;
}

:deep(.ql-editor) {
  @apply p-6 overflow-y-auto bg-white text-black;
  height: calc(100vh - 220px);
  min-height: 400px;
  max-height: calc(100vh - 180px);
}

.ai-continue-toolbar {
  @apply flex items-center gap-2 p-2 bg-white border-t border-gray-200;
}

.continue-input {
  @apply flex-1 px-3 py-1.5 border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-black;
}

.continue-btn {
  @apply px-4 py-1.5 bg-gradient-to-r from-orange-500 to-red-500 text-white rounded hover:from-orange-600 hover:to-red-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium transition-all duration-200 ease-in-out;
}

.stop-btn {
  @apply bg-gradient-to-r from-red-500 to-red-700 hover:from-red-600 hover:to-red-800;
}

.no-chapter-selected {
  @apply h-full flex items-center justify-center bg-gray-50 rounded-lg p-8;
}

.file-toolbar {
  @apply flex gap-2 p-2 bg-gray-100 border-b border-gray-200;
}

.file-btn {
  @apply px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600;
}

.file-path {
  @apply ml-2 text-gray-600 self-center text-sm truncate;
}

:deep(.ql-formats) {
  @apply flex items-center gap-2;
  margin-right: 12px !important;
}

:deep(.ql-formats:first-child) {
  margin-right: auto !important;
}

:deep(.ql-formats:last-child) {
  margin-left: auto !important;
}

.save-toast {
  @apply fixed bottom-24 right-4 bg-green-500 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2;
  animation: slideIn 0.3s ease-out;
  z-index: 1000;
}

.save-toast.fade-out {
  animation: fadeOut 0.3s ease-in forwards;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }

  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes fadeOut {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

:deep(.ql-container) {
  @apply h-[calc(100vh-180px)] bg-white;
  font-size: 16px;
  min-height: 400px;
}

:deep(.ql-editor) {
  @apply p-6;
  color: black !important;
  background-color: white !important;
  min-height: 400px;
  max-height: calc(100vh - 180px);
  overflow-y: auto;
}

.text-editor-container :deep(.ql-toolbar) {
  @apply bg-white text-black border-b border-gray-200 bg-gray-50 !important;
  padding: 8px !important;
  display: flex !important;
  justify-content: space-between !important;
  align-items: center !important;
}

.text-editor-container :deep(.ql-toolbar .ql-formats:first-child) {
  margin-right: auto !important;
}

.text-editor-container :deep(.ql-toolbar .ql-formats:last-child) {
  margin-left: auto !important;
}

:deep(.ql-formats) {
  margin-right: 12px !important;
}

.text-editor-container :deep(.ql-undo) {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M12.5 8c-2.65 0-5.05.99-6.9 2.6L2 7v9h9l-3.62-3.62c1.39-1.16 3.16-1.88 5.12-1.88 3.54 0 6.55 2.31 7.6 5.5l2.37-.78C21.08 11.03 17.15 8 12.5 8z'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
  width: 24px;
  height: 24px;
}

.text-editor-container :deep(.ql-redo) {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M18.4 10.6C16.55 8.99 14.15 8 11.5 8c-4.65 0-8.58 3.03-9.96 7.22l2.36.78c1.05-3.19 4.05-5.5 7.6-5.5 1.95 0 3.73.72 5.12 1.88L13 16h9V7l-3.6 3.6z'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
  width: 24px;
  height: 24px;
}

.text-editor-container :deep(.ql-save) {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M17 3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V7l-4-4zm-5 16c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm3-10H5V5h10v4z'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
}

.text-editor-container :deep(.ql-detail-outline) {
  @apply bg-gradient-to-br from-blue-600 via-purple-600 to-pink-600 text-white rounded-xl shadow-2xl transform transition-all duration-300 hover:scale-105 hover:shadow-2xl font-bold !important;
  padding: 12px 24px !important;
  min-width: 100px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1.2;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  animation: shimmer 6s linear infinite;
}

@keyframes shimmer {
  0% {
    background-position: 200% 50%;
  }

  100% {
    background-position: -200% 50%;
  }
}

.text-editor-container :deep(.ql-detail-outline):before {
  content: '';
  position: absolute;
  inset: -1px;
  background: linear-gradient(90deg, #60a5fa, #c084fc, #f472b6, #60a5fa);
  background-size: 400% 100%;
  animation: borderRotate 8s linear infinite;
  z-index: -1;
  filter: blur(8px);
}

@keyframes borderRotate {
  100% {
    transform: rotate(360deg);
  }
}

.text-editor-container :deep(.ql-detail-outline):after {
  content: '细纲';
  white-space: normal;
  color: #ffffff !important;
  font-weight: 800 !important;
  font-size: 1.15rem !important;
  letter-spacing: 0.15em;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 100%;
  line-height: 1;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3),
    0 0 20px rgba(255, 255, 255, 0.5);
  transform-style: preserve-3d;
  perspective: 1000px;
}

.text-editor-container :deep(.ql-ai-generate) {
  @apply bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 text-white rounded-xl shadow-2xl transform transition-all duration-300 hover:scale-105 hover:shadow-2xl font-bold !important;
  padding: 8px 16px !important;
  min-width: 100px !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  line-height: 1;
  position: relative;
  overflow: hidden;
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.2);
  animation: shimmer 6s linear infinite;
}

.text-editor-container :deep(.ql-ai-generate):before {
  content: '';
  position: absolute;
  inset: -1px;
  background: linear-gradient(90deg, #10b981, #14b8a6, #06b6d4, #10b981);
  background-size: 400% 100%;
  animation: borderRotate 8s linear infinite;
  z-index: -1;
  filter: blur(8px);
}

.text-editor-container :deep(.ql-ai-generate):after {
  content: attr(data-content);
  white-space: nowrap;
  color: #ffffff !important;
  font-weight: 800 !important;
  font-size: 1.15rem !important;
  letter-spacing: 0.15em;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
  height: 100%;
  line-height: 1;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.3),
    0 0 20px rgba(255, 255, 255, 0.5);
  transform-style: preserve-3d;
  perspective: 1000px;
}

.text-editor-container :deep(.ql-search) {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
}

.text-editor-container :deep(.ql-format) {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M3 21h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18v-2H3v2zm0-4h18V7H3v2zm0-6v2h18V3H3z'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
}

.text-editor-container :deep(.ql-editor) {
  @apply bg-white text-black p-4 !important;
  height: 100%;
  overflow-y: auto;
}

.text-editor-container :deep(.ql-toolbar .ql-formats) {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  margin-right: 12px !important;
}

.floating-toolbar {
  position: absolute;
  background-color: #333;
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  /* Ensure it's above the editor content */
  display: flex;
  gap: 8px;
}

.floating-toolbar button {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  padding: 2px 5px;
}

.floating-toolbar button:hover {
  background-color: #555;
}

/* Add other styles if needed */
.text-editor-container :deep(.ql-proofread) {
  background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='%23000' d='M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z'/%3E%3C/svg%3E");
  background-position: center;
  background-repeat: no-repeat;
  width: 24px;
  height: 24px;
  margin: 0 4px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.text-editor-container :deep(.ql-proofread:hover) {
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 4px;
}

.continue-cursor {
  position: fixed;
  z-index: 1000;
  pointer-events: none;
  animation: slideDown 1.5s infinite;
  color: #f97316;
  filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.2));
  background: rgba(255, 255, 255, 0.9);
  border-radius: 50%;
  padding: 4px;
  transform: translate(-50%, -50%);
}

@keyframes slideDown {
  0% {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
  50% {
    opacity: 0.7;
    transform: translate(-50%, calc(-50% + 6px));
  }
  100% {
    opacity: 1;
    transform: translate(-50%, -50%);
  }
}

:deep(.continue-position-dialog .el-message-box__content) {
  padding: 20px;
}

:deep(.continue-position-dialog .el-message-box__btns) {
  padding: 10px 20px 20px;
}

:deep(.continue-position-dialog .el-button) {
  padding: 12px 24px;
  font-size: 16px;
}
</style>
