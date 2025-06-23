<template>
  <div class="chapter-tree">
    <div class="header-row">
      <SidebarToggle 
        initialTab="chapters" 
        @toggle="handleToggle" 
      />
      <div class="action-buttons">
        <el-tooltip content="导出Word" placement="top">
          <el-button class="action-button" @click="exportWord" circle>
            <el-icon>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16">
                <path fill="currentColor" d="M19.5 4h-3V2.5A2.5 2.5 0 0 0 14 0H8a2.5 2.5 0 0 0-2.5 2.5V4h-3A1.5 1.5 0 0 0 1 5.5v15A1.5 1.5 0 0 0 2.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-15A1.5 1.5 0 0 0 19.5 4zM7 2.5c0-.3.2-.5.5-.5h7c.3 0 .5.2.5.5V4H7V2.5zm12 17c0 .3-.2.5-.5.5h-15c-.3 0-.5-.2-.5-.5v-12c0-.3.2-.5.5-.5h15c.3 0 .5.2.5.5v12z"/>
                <path fill="currentColor" d="M12.7 14.9l-1.3-1.3V18c0 .6-.4 1-1 1s-1-.4-1-1v-4.4l-1.3 1.3c-.4.4-1 .4-1.4 0s-.4-1 0-1.4l3-3c.4-.4 1-.4 1.4 0l3 3c.4.4.4 1 0 1.4s-1 .4-1.4 0z"/>
              </svg>
            </el-icon>
          </el-button>
        </el-tooltip>
        <el-tooltip content="添加卷" placement="top">
          <el-button class="action-button" @click="addVolume" circle>
            <el-icon><Plus /></el-icon>
          </el-button>
        </el-tooltip>
      </div>
    </div>
    <el-tree
      :data="chapters"
      node-key="id"
      :expand-on-click-node="false"
      default-expand-all
      class="custom-tree"
      @node-click="handleNodeClick"
    >
      <template #default="{ node, data }">
        <div class="custom-tree-node">
          <div class="node-content">
            <span v-if="editingNodeId !== data.id">{{ data.title }}</span>
            <el-input
              v-else
              v-model="data.title"
              size="small"
              @blur="finishEdit(data)"
              @keyup.enter="finishEdit(data)"
              ref="editInput"
            />
          </div>
          <div class="node-actions">
            <template v-if="editingNodeId !== data.id">
              <el-tooltip content="添加章节" placement="top" v-if="data.type === 'volume'">
                <el-button circle size="small" @click="addChapter(data)">
                  <el-icon><Plus /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="重命名" placement="top">
                <el-button circle size="small" @click="startEdit(data)">
                  <el-icon><Edit /></el-icon>
                </el-button>
              </el-tooltip>
              <el-tooltip content="删除" placement="top">
                <el-button circle size="small" type="danger" @click="removeNode(node, data)">
                  <el-icon><Delete /></el-icon>
                </el-button>
              </el-tooltip>
            </template>
          </div>
        </div>
      </template>
    </el-tree>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Edit, Delete } from '@element-plus/icons-vue'
import { v4 as uuidv4 } from 'uuid'
import { type Chapter } from '../services/bookConfigService'
import { DocumentService } from '../services/documentService'
import SidebarToggle from './SidebarToggle.vue'

const props = defineProps<{
  chapters: Chapter[],
  currentBook: any
}>()

const emit = defineEmits(['update:chapters', 'select-chapter', 'switch-tab'])

const editInput = ref<any>(null)
const editingNodeId = ref<string | null>(null)

// 处理切换
const handleToggle = (tab: 'chapters' | 'fragments') => {
  emit('switch-tab', tab)
}

// 添加新卷
const addVolume = () => {
  const newVolume: Chapter = {
    id: uuidv4(),
    title: '新卷',
    type: 'volume',
    children: [],
    detailOutline: {
      chapterNumber: '',
      detailContent: ''
    }
  }
  const updatedChapters = [...props.chapters, newVolume]
  emit('update:chapters', updatedChapters)
  editingNodeId.value = newVolume.id
  nextTick(() => {
    if (editInput.value) {
      editInput.value.focus()
    }
  })
}

// 添加新章节
const addChapter = (volume: Chapter) => {
  if (!volume.children) {
    volume.children = []
  }
  const newChapter: Chapter = {
    id: uuidv4(),
    title: '新章节',
    type: 'chapter',
    content: '',
    detailOutline: {
      chapterNumber: '',
      detailContent: ''
    }
  }
  volume.children.push(newChapter)
  emit('update:chapters', [...props.chapters])
  editingNodeId.value = newChapter.id
  nextTick(() => {
    if (editInput.value) {
      editInput.value.focus()
    }
  })
}

// 开始编辑节点
const startEdit = (data: Chapter) => {
  editingNodeId.value = data.id
  nextTick(() => {
    if (editInput.value) {
      editInput.value.focus()
    }
  })
}

// 完成编辑
const finishEdit = (data: Chapter) => {
  if (!data.title.trim()) {
    ElMessage.warning('标题不能为空')
    data.title = data.type === 'volume' ? '新卷' : '新章节'
  }
  editingNodeId.value = null
  emit('update:chapters', [...props.chapters])
}

// 删除节点
const removeNode = (node: any, data: Chapter) => {
  if (node.level === 1) {
    // 删除根节点(卷)
    const index = props.chapters.findIndex(item => item.id === data.id)
    if (index > -1) {
      const updatedChapters = [...props.chapters]
      updatedChapters.splice(index, 1)
      emit('update:chapters', updatedChapters)
    }
  } else {
    // 删除子节点(章节)
    const parent = node.parent
    if (parent && parent.data) {
      const children = parent.data.children || []
      const index = children.findIndex((item: Chapter) => item.id === data.id)
      if (index > -1) {
        children.splice(index, 1)
        emit('update:chapters', [...props.chapters])
      }
    }
  }
}

// 处理节点点击
const handleNodeClick = (data: Chapter) => {
  emit('select-chapter', data)
}

// 导出Word文档
const exportWord = async () => {
  if (!props.currentBook) {
    ElMessage.error('请先选择一本书籍');
    return;
  }
  try {
    // 打开保存对话框
    const defaultPath = `${props.currentBook.title}.docx`;
    const filePath = await window.electronAPI.saveFileAs(defaultPath);

    if (!filePath.success) {
      ElMessage.error(filePath.message);
      return; // 用户取消了保存
    }
    
    const documentService = DocumentService.getInstance();
    const fileName = await documentService.exportToWord(props.currentBook, filePath.filePath);
    ElMessage.success(`文档已导出为: ${fileName}`);
  } catch (error) {
    console.error('导出Word文档失败:', error);
    ElMessage.error(error.message);
  }
}
</script>

<style scoped>
.chapter-tree {
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

.custom-tree {
  @apply flex-1 overflow-auto;
}

.custom-tree-node {
  @apply flex items-center justify-between w-full;
}

.node-content {
  @apply flex-1 mr-4;
}

.node-actions {
  @apply flex gap-2;
}

:deep(.el-tree-node__content) {
  @apply h-auto min-h-[40px] py-1;
}

:deep(.el-button--small) {
  @apply px-2 py-1 text-xs;
}
</style>