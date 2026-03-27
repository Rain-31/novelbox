<template>
  <div class="tree-node">
    <!-- 节点头部 -->
    <div class="node-header group" @click="onHeaderClick">
      <!-- 左侧标识点 -->
      <span class="dot-icon" :class="hasChildren ? 'dot-parent' : 'dot-leaf'"></span>

      <!-- 节点名称（查看/编辑切换） -->
      <template v-if="isEditing">
        <input
          ref="nameInput"
          v-model="editName"
          class="name-input"
          @click.stop
          @keydown.enter.prevent="saveEdit"
          @keydown.escape.prevent="cancelEdit"
        />
      </template>
      <span v-else class="node-name">{{ entry.name }}</span>

      <!-- 操作按钮 -->
      <div class="node-actions" @click.stop>
        <button v-if="!isEditing" @click="startEdit" class="action-btn" title="编辑">✏️</button>
        <button v-if="isEditing" @click="saveEdit" class="action-btn" title="保存">✅</button>
        <button v-if="isEditing" @click="cancelEdit" class="action-btn" title="取消">❌</button>
        <button @click="$emit('add-child', entry)" class="action-btn" title="添加子条目">➕</button>
        <button @click="$emit('delete', entry.id)" class="action-btn delete-btn" title="删除">🗑️</button>
      </div>

      <!-- 父节点右侧导航箭头（始终可见） -->
      <span v-if="hasChildren && !isEditing" class="nav-chevron">›</span>
    </div>

    <!-- 内容区域（编辑时 或 有 content 时始终展示） -->
    <div v-if="isEditing || entry.content" class="node-body">
      <template v-if="isEditing">
        <textarea
          ref="contentTextarea"
          v-model="editContent"
          class="content-textarea"
          rows="1"
          @click.stop
          @input="autoResize"
          placeholder="条目内容..."
        ></textarea>
      </template>
      <p v-else-if="entry.content" class="node-content">{{ entry.content }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import type { SettingEntry } from '../services/bookConfigService'

const props = defineProps<{
  entry: SettingEntry
}>()

const emit = defineEmits<{
  update: [entry: SettingEntry]
  delete: [id: string]
  drill: [entry: SettingEntry]
  'add-child': [entry: SettingEntry]
  'open-fragment': [entry: SettingEntry]
}>()

const isExpanded = ref(false)
const isEditing = ref(false)
const editName = ref('')
const editContent = ref('')
const nameInput = ref<HTMLInputElement>()
const contentTextarea = ref<HTMLTextAreaElement>()

const hasChildren = computed(() => (props.entry.children?.length ?? 0) > 0)

const onHeaderClick = () => {
  if (isEditing.value) return
  if (hasChildren.value) {
    emit('drill', props.entry)
  } else {
    emit('open-fragment', props.entry)
  }
}

const autoResize = () => {
  const el = contentTextarea.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = el.scrollHeight + 'px'
}

const startEdit = () => {
  editName.value = props.entry.name
  editContent.value = props.entry.content
  isEditing.value = true
  nextTick(() => {
    nameInput.value?.focus()
    autoResize()
  })
}

const saveEdit = () => {
  if (!editName.value.trim()) return
  emit('update', {
    ...props.entry,
    name: editName.value.trim(),
    content: editContent.value,
  })
  isEditing.value = false
}

const cancelEdit = () => {
  isEditing.value = false
}
</script>

<style scoped>
.tree-node {
  @apply bg-white rounded-lg border border-gray-100 shadow-sm mb-2;
}

.node-header {
  @apply relative flex items-center gap-2 py-2 px-3 cursor-pointer hover:bg-gray-50 rounded-lg;
}

.dot-icon {
  @apply w-2 h-2 rounded-full flex-shrink-0;
}

.dot-parent {
  @apply bg-blue-400;
}

.dot-leaf {
  @apply bg-gray-300;
}

.nav-chevron {
  @apply text-gray-400 text-base flex-shrink-0 leading-none select-none;
}

.node-name {
  @apply flex-1 min-w-0 text-sm font-medium text-gray-800 text-left truncate;
}

.name-input {
  @apply flex-1 text-sm border border-blue-300 rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-blue-400;
  min-width: 0;
}

.node-actions {
  @apply flex gap-0.5 flex-shrink-0;
  display: none;
  position: absolute;
  right: 2px;
  top: 50%;
  transform: translateY(-50%);
  background: rgba(249, 250, 251, 0.95);
  border-radius: 4px;
}

.node-header:hover .node-actions {
  display: flex;
}

.action-btn {
  @apply text-xs px-1 py-0.5 rounded hover:bg-gray-200;
}

.delete-btn {
  @apply hover:bg-red-100;
}

.node-body {
  @apply pb-3 px-4;
  border-top: 1px solid #f3f4f6;
}

.node-content {
  @apply text-xs text-gray-500 pt-2 leading-relaxed whitespace-pre-wrap text-left;
}

.content-textarea {
  @apply w-full text-xs border border-blue-300 rounded px-2 py-1 outline-none focus:ring-1 focus:ring-blue-400 my-1;
  resize: none;
  overflow: hidden;
  min-height: 28px;
}
</style>
