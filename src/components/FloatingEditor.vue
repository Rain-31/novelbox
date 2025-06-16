<template>
  <div 
    v-show="visible"
    class="floating-editor"
    :style="{ top: position.y + 'px', left: position.x + 'px', width: size.width + 'px', height: size.height + 'px' }"
    ref="editorRef"
  >
    <div class="editor-header" @mousedown="startDrag">
      <div class="title">{{ title }}</div>
      <div class="controls">
        <button class="control-btn minimize" @click="minimize">
          <span>-</span>
        </button>
        <button class="control-btn close" @click="close">
          <span>×</span>
        </button>
      </div>
    </div>
    <div class="editor-content">
      <el-input
        v-model="content"
        type="textarea"
        :rows="10"
        resize="none"
        placeholder="在此输入片段内容..."
        @input="handleContentChange"
      />
    </div>
    <div class="editor-footer">
      <div class="resize-handle" @mousedown="startResize"></div>
      <div class="footer-controls">
        <el-button type="primary" size="small" @click="saveContent">保存</el-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  initialContent: {
    type: String,
    default: ''
  },
  initialTitle: {
    type: String,
    default: '新片段'
  },
  fragmentId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'save', 'close', 'minimize'])

const title = ref(props.initialTitle)
const content = ref(props.initialContent)
const editorRef = ref<HTMLElement | null>(null)

// 位置和大小状态
const position = ref({ x: 100, y: 100 })
const size = ref({ width: 400, height: 300 })

// 监听内容变化
watch(() => props.initialContent, (newVal) => {
  content.value = newVal
})

// 监听标题变化
watch(() => props.initialTitle, (newVal) => {
  title.value = newVal
})

// 拖动状态
const dragging = ref(false)
const dragOffset = ref({ x: 0, y: 0 })

// 调整大小状态
const resizing = ref(false)
const initialSize = ref({ width: 0, height: 0 })
const initialPos = ref({ x: 0, y: 0 })

// 开始拖动
const startDrag = (e: MouseEvent) => {
  if (!editorRef.value) return
  
  dragging.value = true
  dragOffset.value = {
    x: e.clientX - position.value.x,
    y: e.clientY - position.value.y
  }
  
  document.addEventListener('mousemove', onDrag)
  document.addEventListener('mouseup', stopDrag)
}

// 拖动处理
const onDrag = (e: MouseEvent) => {
  if (!dragging.value) return
  
  position.value = {
    x: e.clientX - dragOffset.value.x,
    y: e.clientY - dragOffset.value.y
  }
}

// 停止拖动
const stopDrag = () => {
  dragging.value = false
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
}

// 开始调整大小
const startResize = (e: MouseEvent) => {
  e.preventDefault()
  resizing.value = true
  initialSize.value = { ...size.value }
  initialPos.value = { x: e.clientX, y: e.clientY }
  
  document.addEventListener('mousemove', onResize)
  document.addEventListener('mouseup', stopResize)
}

// 调整大小处理
const onResize = (e: MouseEvent) => {
  if (!resizing.value) return
  
  const deltaX = e.clientX - initialPos.value.x
  const deltaY = e.clientY - initialPos.value.y
  
  size.value = {
    width: Math.max(300, initialSize.value.width + deltaX),
    height: Math.max(200, initialSize.value.height + deltaY)
  }
}

// 停止调整大小
const stopResize = () => {
  resizing.value = false
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
}

// 内容变化处理
const handleContentChange = () => {
  // 可以添加自动保存或其他逻辑
}

// 保存内容
const saveContent = () => {
  emit('save', {
    id: props.fragmentId,
    title: title.value,
    content: content.value
  })
  ElMessage.success('内容已保存')
}

// 关闭窗口
const close = () => {
  emit('close')
  emit('update:visible', false)
}

// 最小化窗口
const minimize = () => {
  emit('minimize')
  emit('update:visible', false)
}

// 在组件卸载时清理事件监听
onUnmounted(() => {
  document.removeEventListener('mousemove', onDrag)
  document.removeEventListener('mouseup', stopDrag)
  document.removeEventListener('mousemove', onResize)
  document.removeEventListener('mouseup', stopResize)
})
</script>

<style scoped>
.floating-editor {
  position: fixed;
  background-color: white;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 1000; /* 确保在最上层 */
  min-width: 300px;
  min-height: 200px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: #f5f7fa;
  padding: 8px 12px;
  cursor: move;
  user-select: none;
  border-bottom: 1px solid #e4e7ed;
}

.title {
  font-weight: 600;
  font-size: 14px;
  color: #303133;
  flex-grow: 1;
}

.controls {
  display: flex;
  gap: 8px;
}

.control-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border: none;
  padding: 0;
}

.minimize {
  background-color: #f0c239;
}

.close {
  background-color: #ff6464;
}

.control-btn span {
  font-size: 14px;
  line-height: 1;
  color: #fff;
}

.editor-content {
  flex: 1;
  padding: 12px;
  overflow: auto;
}

.editor-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-top: 1px solid #e4e7ed;
}

.resize-handle {
  width: 10px;
  height: 10px;
  background-color: #c0c4cc;
  border-radius: 50%;
  cursor: nwse-resize;
  position: absolute;
  bottom: 5px;
  right: 5px;
}

.footer-controls {
  display: flex;
  gap: 8px;
}

:deep(.el-textarea__inner) {
  height: 100%;
  min-height: 120px;
  resize: none;
}
</style> 