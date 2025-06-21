<template>
  <div class="fragment-editor-page">
    <!-- 窗口控制区 - 可拖动，降低高度 -->
    <div class="window-drag-area" @mousedown="startDrag">
      <!-- 标题区域，不可拖动 -->
      <div 
        class="window-title" 
        @mousedown.stop
        @click="startTitleEdit" 
        v-if="!isEditingTitle"
        ref="titleRef"
      >
        {{ fragmentTitle || '新片段' }}
      </div>
      <div class="title-edit" v-else>
        <el-input 
          v-model="editingTitle" 
          size="small" 
          @blur="saveTitleEdit"
          @keyup.enter="saveTitleEdit"
          @keyup.esc="cancelTitleEdit"
          ref="titleInputRef"
          placeholder="输入标题..."
        />
      </div>
      <div class="window-controls">
        <button class="close-btn" @click="closeWindow">×</button>
      </div>
    </div>
    <!-- 内容编辑区 -->
    <div class="editor-content">
      <el-input 
        v-model="fragment.content" 
        type="textarea" 
        placeholder="在此输入内容..." 
        resize="none"
        class="content-textarea"
      />
    </div>
    <div class="editor-footer">
      <!-- 生成控制按钮 -->
      <template v-if="isGenerating">
        <el-button type="danger" size="small" @click="stopGeneration">停止生成</el-button>
      </template>
      <template v-else>
        <template v-if="wasGenerating">
          <el-button type="primary" size="small" @click="regenerateContent">重新生成</el-button>
        </template>
      </template>
      <el-button type="success" size="small" @click="insertToEditor">插入原文</el-button>
      <el-button type="warning" size="small" @click="replaceInEditor">替换原文</el-button>
      <el-button type="primary" size="small" @click="saveFragment">保存</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import { ElMessage } from 'element-plus'

// 简化的片段数据结构
interface Fragment {
  id: string
  content: string
  createdAt: Date
  updatedAt: Date
  isGenerating?: boolean
}

// 片段数据
const fragment = ref<Fragment>({
  id: '',
  content: '',
  createdAt: new Date(),
  updatedAt: new Date(),
  isGenerating: false
})

// 片段标题
const fragmentTitle = ref('')
// 标题编辑状态
const isEditingTitle = ref(false)
// 正在编辑的标题
const editingTitle = ref('')
// 标题输入框引用
const titleInputRef = ref<any>(null)
// 标题文本引用
const titleRef = ref<any>(null)
// 片段是否正在生成
const isGenerating = ref(false)
// 片段是否曾经在生成（用于显示重新生成按钮）
const wasGenerating = ref(false)

// 保存片段
const saveFragment = async () => {
  try {
    // 更新时间戳
    fragment.value.updatedAt = new Date()
    
    // 通过Electron API保存片段
    const result = await window.electronAPI.saveFragmentContent({
      ...fragment.value,
      title: fragmentTitle.value // 使用当前标题
    })
    
    if (result.success) {
      ElMessage.success('内容已保存')
    } else {
      ElMessage.error(`保存失败: ${result.error?.message || '未知错误'}`)
    }
  } catch (error) {
    console.error('保存片段失败:', error)
    ElMessage.error('保存失败')
  }
}

// 关闭窗口
const closeWindow = () => {
  
  try {
    if (fragment.value.id) {
      window.electronAPI.closeFragmentWindow(fragment.value.id);
    } else {
      console.error('无法关闭窗口：fragmentId为空');
      // 如果ID为空，尝试关闭当前窗口
      window.electronAPI.closeCurrentWindow();
    }
  } catch (err) {
    console.error('关闭窗口出错:', err);
  }
}

// 监听ESC键，关闭窗口
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    closeWindow()
  }
}

// 窗口拖动功能
const startDrag = (e: MouseEvent) => {
  // 只有在点击标题区域之外才触发拖动
  if (titleRef.value && titleRef.value.contains(e.target)) {
    return;
  }
  window.electronAPI.startDrag();
}

// 开始编辑标题
const startTitleEdit = () => {
  editingTitle.value = fragmentTitle.value || '';
  isEditingTitle.value = true;
  // 等待DOM更新后聚焦输入框
  nextTick(() => {
    if (titleInputRef.value) {
      titleInputRef.value.focus();
    }
  });
}

// 保存标题编辑
const saveTitleEdit = () => {
  if (editingTitle.value.trim()) {
    fragmentTitle.value = editingTitle.value.trim()
  }
  isEditingTitle.value = false
}

// 取消标题编辑
const cancelTitleEdit = () => {
  isEditingTitle.value = false
}

// 停止AI生成
const stopGeneration = () => {
  try {
    const message = {
      type: 'stop-generation',
      fragmentId: fragment.value.id
    }
    // 确保消息内容是字符串
    const messageStr = JSON.stringify(message);
    window.electronAPI.sendToMainWindow(messageStr);
    ElMessage.info('已发送停止指令');
  } catch (error) {
    console.error('发送停止指令失败:', error);
    ElMessage.error('发送失败');
  }
}

// 重新生成内容
const regenerateContent = () => {
  try {
    const message = {
      type: 'regenerate-content',
      fragmentId: fragment.value.id
    }
    // 确保消息内容是字符串
    const messageStr = JSON.stringify(message);
    window.electronAPI.sendToMainWindow(messageStr);
    ElMessage.info('正在重新生成...');
    
    // 更新UI状态，显示生成中
    isGenerating.value = true;
    fragmentTitle.value = fragmentTitle.value.replace('（已停止）', '') + '（生成中...）';
  } catch (error) {
    console.error('发送重新生成指令失败:', error);
    ElMessage.error('发送失败');
  }
}

// 插入到编辑器
const insertToEditor = () => {
  try {
    const message = {
      type: 'insert-fragment',
      content: fragment.value.content
    }
    window.electronAPI.sendToMainWindow(JSON.stringify(message))
    ElMessage.success('已发送到编辑器')
  } catch (error) {
    console.error('发送到编辑器失败:', error)
    ElMessage.error('发送失败')
  }
}

// 替换编辑器中的选中内容
const replaceInEditor = () => {
  try {
    const message = {
      type: 'replace-fragment',
      content: fragment.value.content
    }
    window.electronAPI.sendToMainWindow(JSON.stringify(message))
    ElMessage.success('已发送到编辑器')
  } catch (error) {
    console.error('发送到编辑器失败:', error)
    ElMessage.error('发送失败')
  }
}

// 初始化
onMounted(async () => {
  // 先设置数据接收监听器
  const dataHandler = (data: any) => {
    // 创建片段对象
    fragment.value = {
      id: data.id || '', // 确保ID有值
      content: data.content || '',
      createdAt: new Date(data.createdAt || Date.now()),
      updatedAt: new Date(data.updatedAt || Date.now()),
      isGenerating: data.isGenerating || false
    }
    
    // 设置标题
    fragmentTitle.value = data.title || '新片段';
    
    // 设置生成状态
    isGenerating.value = data.isGenerating || false;
    
    if (fragmentTitle.value.includes('（生成中...）')) {
      isGenerating.value = true;
    }
    
    if (fragmentTitle.value.includes('（已停止）') || 
        (!fragmentTitle.value.includes('（生成中...）') && fragment.value.content.trim() !== '')) {
      wasGenerating.value = true;
    }
  };
  
  // 注册监听器
  window.electronAPI.onFragmentData(dataHandler);
  
  // 注册内容更新监听器
  window.electronAPI.onContentUpdate((data: any) => {
    // 如果ID不匹配，忽略此更新
    if (data.id !== fragment.value.id) return;
    
    // 更新内容
    fragment.value.content = data.content || fragment.value.content;
    
    // 更新标题
    if (data.title) {
      fragmentTitle.value = data.title;
    }
    
    // 检查之前的生成状态
    const wasGeneratingBefore = isGenerating.value;
    
    // 更新生成状态
    if (data.isGenerating !== undefined) {
      isGenerating.value = data.isGenerating;
    } else {
      // 根据标题判断生成状态
      if (fragmentTitle.value.includes('（生成中...）')) {
        isGenerating.value = true;
      } else {
        isGenerating.value = false;
      }
    }

    if ((wasGeneratingBefore && !isGenerating.value && fragment.value.content.trim() !== '') || 
        fragmentTitle.value.includes('（已停止）') || 
        (!fragmentTitle.value.includes('（生成中...）') && fragment.value.content.trim() !== '') ||
        wasGenerating.value) {
      wasGenerating.value = true;
    }
    
    // 更新时间戳
    fragment.value.updatedAt = new Date();
  });
  
  try {
    // 获取当前窗口ID并请求数据
    const result = await window.electronAPI.getCurrentWindowId();
    
    if (result.success && result.id) {
      // 主动请求片段数据
      await window.electronAPI.requestFragmentData(result.id);
    } else {
      console.error('获取窗口ID失败:', result.message);
    }
  } catch (error) {
    console.error('请求片段数据失败:', error);
  }
  
  // 添加键盘事件监听
  window.addEventListener('keydown', handleKeyDown)
})

// 清理
onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
</script>

<style scoped>
/* 整体容器，设置为透明 */
.fragment-editor-page {
  height: 100vh;
  width: 100vw;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: transparent; /* 完全透明 */
}

/* 通用的样式：为整体添加阴影 */
.fragment-editor-page {
  position: relative;
  border-radius: 8px; /* 整体圆角 */
  overflow: hidden;
}

/* 添加整体阴影 */
.fragment-editor-page::after {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: -1;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.1);
  border-radius: 8px;
}

/* 实际内容容器，这个才是真正的圆角矩形 */
.window-drag-area {
  height: 28px;
  -webkit-app-region: drag;
  background-color: #f5f7fa;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 8px;
  border-top-left-radius: 8px; /* 顶部左侧圆角 */
  border-top-right-radius: 8px; /* 顶部右侧圆角 */
  border-top: 1px solid rgba(230, 230, 230, 0.8);
  border-left: 1px solid rgba(230, 230, 230, 0.8);
  border-right: 1px solid rgba(230, 230, 230, 0.8);
  box-shadow: none; /* 移除重复的阴影 */
}

.window-title {
  font-size: 13px; /* 增加字体大小 */
  color: #606266;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 80%;
  -webkit-app-region: no-drag; /* 确保不可拖动 */
  cursor: pointer;
  padding: 3px 6px; /* 增加内边距 */
  border-radius: 3px;
  background-color: rgba(0, 0, 0, 0.02); /* 添加轻微背景色 */
  border: 1px solid transparent; /* 添加透明边框 */
  margin-left: 5px; /* 添加左边距 */
  z-index: 10; /* 确保在拖动区域上层 */
}

.window-title:hover {
  color: #409EFF;
  background-color: rgba(64, 158, 255, 0.1);
  border-color: rgba(64, 158, 255, 0.2); /* 显示边框 */
}

.title-edit {
  max-width: 80%;
  -webkit-app-region: no-drag;
}

:deep(.title-edit .el-input__wrapper) {
  padding: 0 5px;
  height: 20px;
  width: 150px;
}

:deep(.title-edit .el-input__inner) {
  font-size: 12px;
  height: 20px;
  line-height: 20px;
}

.window-controls {
  -webkit-app-region: no-drag;
}

.close-btn {
  background: none;
  border: none;
  font-size: 16px;
  color: #666;
  cursor: pointer;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  margin: 0;
}

.close-btn:hover {
  background-color: #ff4d4f;
  color: white;
}

.editor-content {
  flex: 1;
  display: flex;
  padding: 0 8px;
  width: 100%;
  box-sizing: border-box;
  background-color: #f5f7fa; /* 中间内容区域背景色 */
  border-left: 1px solid rgba(230, 230, 230, 0.8);
  border-right: 1px solid rgba(230, 230, 230, 0.8);
  box-shadow: none; /* 移除重复的阴影 */
}

/* 强制内容区填满窗口 */
.content-textarea {
  width: 100%;
  height: 100%;
}

:deep(.el-textarea) {
  width: 100%;
  height: 100%;
  display: flex;
}

:deep(.el-textarea__inner) {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  border: 1px solid #e6e6e6;
  padding: 8px 12px;
  font-family: "Microsoft YaHei", "Segoe UI", Arial, sans-serif;
  font-size: 14px;
  line-height: 1.6;
  background-color: #fff;
  resize: none;
  flex: 1;
  min-height: unset;
  border-radius: 4px; /* 添加内部文本区域圆角 */
}

/* 去掉element-plus的默认样式 */
:deep(.el-textarea .el-input__wrapper) {
  box-shadow: none !important;
  padding: 0;
  width: 100%;
  height: 100%;
}

:deep(.el-input__wrapper) {
  width: 100%;
  height: 100%;
  padding: 0;
  margin: 0;
}

.editor-footer {
  display: flex;
  justify-content: center;
  gap: 10px;
  padding: 5px 0;
  background-color: #f5f7fa; /* 底部区域背景色 */
  border-bottom-left-radius: 8px; /* 底部左侧圆角 */
  border-bottom-right-radius: 8px; /* 底部右侧圆角 */
  border-top: 1px solid rgba(230, 230, 230, 0.5);
  border-bottom: 1px solid rgba(230, 230, 230, 0.8);
  border-left: 1px solid rgba(230, 230, 230, 0.8);
  border-right: 1px solid rgba(230, 230, 230, 0.8);
  box-shadow: none; /* 移除重复的阴影 */
}

/* 移除通用的阴影样式，改用伪元素实现 */
.window-drag-area, .editor-content, .editor-footer {
  box-shadow: none;
}
</style> 