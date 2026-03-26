<template>
  <div ref="panelRef" class="tab-panel" tabindex="-1">
    <!-- AI 生成输入框 -->
    <div v-if="showGenInput" class="gen-input-area">
      <textarea
        v-model="genPromptText"
        class="gen-textarea"
        rows="3"
        placeholder="描述你想要的设定，如：玄幻修仙，主角有特殊血脉，有修炼体系和门派体系..."
      ></textarea>
      <div class="gen-input-actions">
        <button @click="showGenInput = false" class="btn-cancel-sm">取消</button>
        <button @click="runAIGenerate" class="btn-confirm-sm" :disabled="!genPromptText.trim() || isGenerating">
          生成
        </button>
      </div>
    </div>

    <!-- 导航面包屑 -->
    <div class="nav-bar">
      <button v-if="navStack.length > 0" @click="navigateTo(navStack.length - 2)" class="nav-back" title="返回上一层">
        ↩
      </button>
      <div class="nav-crumbs">
        <button v-if="navStack.length > 0" @click="navigateTo(-1)" class="nav-btn nav-root" title="返回根目录">全部</button>
        <span v-else class="nav-current">全部</span>
        <template v-for="(nav, i) in navStack" :key="nav.id">
          <span class="nav-sep">/</span>
          <button
            v-if="i < navStack.length - 1"
            @click="navigateTo(i)"
            class="nav-btn"
          >{{ nav.name }}</button>
          <span v-else class="nav-current">{{ nav.name }}</span>
        </template>
      </div>
      <button @click="addRootEntry" class="nav-add" :disabled="isGenerating" title="添加子条目">＋</button>
    </div>

    <!-- 树形区域 -->
    <div class="tree-area">
      <SettingTree
        :entries="currentEntries"
        @update:entries="onEntriesChange"
        @drill="onDrill"
        @add-child="onAddChild"
      />
    </div>

    <!-- 更新确认弹窗 -->
    <SettingDiffModal
      v-if="diffPatch"
      :patch="diffPatch"
      :current-entries="settingEntries"
      @apply="onApplyPatch"
      @cancel="diffPatch = null"
    />

    <!-- 底部按钮组 -->
    <div class="button-group">
      <button @click="aiGenerate" class="ai-btn" :disabled="isGenerating">
        {{ isGenerating ? '生成中...' : 'AI 生成' }}
      </button>
      <button @click="aiUpdate" class="update-btn" :disabled="isGenerating">
        更新设定
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { ElMessage } from 'element-plus'
import AIService from '../services/aiService'
import { BookConfigService, type SettingEntry } from '../services/bookConfigService'
import { AIConfigService } from '../services/aiConfigService'
import {
  replaceSettingsJsonPromptVariables,
  replaceUpdateSettingsJsonPromptVariables,
  serializeSettingToText,
} from '../services/promptVariableService'
import SettingTree from './SettingTree.vue'
import SettingDiffModal, { type SettingPatch } from './SettingDiffModal.vue'

const genId = () => Math.random().toString(36).slice(2, 10)

const props = defineProps<{
  currentBook: any
  currentChapter?: any
  show: boolean
}>()

const panelRef = ref<HTMLElement>()
const settingEntries = ref<SettingEntry[]>([])
const navStack = ref<{ id: string; name: string }[]>([])
const isGenerating = ref(false)
const showGenInput = ref(false)
const genPromptText = ref('')
const diffPatch = ref<SettingPatch | null>(null)

// ---- 撤销/重做历史 ----
const MAX_HISTORY = 50
const historyStack: SettingEntry[][] = []
const redoStack: SettingEntry[][] = []

const deepClone = (entries: SettingEntry[]): SettingEntry[] =>
  JSON.parse(JSON.stringify(entries))

const pushHistory = () => {
  historyStack.push(deepClone(settingEntries.value))
  if (historyStack.length > MAX_HISTORY) historyStack.shift()
  redoStack.length = 0
}

const undo = () => {
  if (historyStack.length === 0) return
  redoStack.push(deepClone(settingEntries.value))
  settingEntries.value = historyStack.pop()!
  saveContent()
}

const redo = () => {
  if (redoStack.length === 0) return
  historyStack.push(deepClone(settingEntries.value))
  settingEntries.value = redoStack.pop()!
  saveContent()
}

const focusPanel = () => {
  panelRef.value?.focus({ preventScroll: true })
}

const onKeyDown = (e: KeyboardEvent) => {
  if (!(e.ctrlKey || e.metaKey)) return
  // 只在焦点位于设定面板内部时拦截
  if (!panelRef.value?.contains(document.activeElement)) return
  // 焦点在 input/textarea 内时，让浏览器原生撤销生效
  const tag = (document.activeElement as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA') return
  if (e.key === 'z' && !e.shiftKey) {
    e.preventDefault()
    e.stopPropagation()
    undo()
  } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
    e.preventDefault()
    e.stopPropagation()
    redo()
  }
}

// 当前导航层级的条目列表
const currentEntries = computed(() => {
  let items = settingEntries.value
  for (const nav of navStack.value) {
    const found = items.find(e => e.id === nav.id)
    if (!found) return []
    items = found.children ?? []
  }
  return items
})

// 将当前层级的变更写回完整树
const updateSubtree = (
  root: SettingEntry[],
  path: { id: string; name: string }[],
  newChildren: SettingEntry[]
): SettingEntry[] => {
  if (path.length === 0) return newChildren
  const [head, ...rest] = path
  return root.map(e => {
    if (e.id === head.id) {
      return rest.length === 0
        ? { ...e, children: newChildren }
        : { ...e, children: updateSubtree(e.children ?? [], rest, newChildren) }
    }
    return e
  })
}

let aiService: AIService

const loadEntries = () => {
  if (!props.currentBook) return
  if (props.currentBook.settingData?.length) {
    settingEntries.value = props.currentBook.settingData
  } else if (props.currentBook.setting?.trim()) {
    // 旧数据迁移：将纯文本包装为单条目
    settingEntries.value = [{
      id: genId(),
      name: '待整理的设定',
      content: props.currentBook.setting,
      children: [],
    }]
  } else {
    settingEntries.value = []
  }
}

const onEntriesChange = (entries: SettingEntry[]) => {
  pushHistory()
  settingEntries.value = updateSubtree(settingEntries.value, navStack.value, entries)
  saveContent()
}

const addRootEntry = () => {
  const newEntry: SettingEntry = { id: genId(), name: '新条目', content: '', children: [] }
  onEntriesChange([...currentEntries.value, newEntry])
}

const onDrill = (entry: SettingEntry) => {
  navStack.value = [...navStack.value, { id: entry.id, name: entry.name }]
  focusPanel()
}

const onAddChild = (parentEntry: SettingEntry) => {
  // 先钻入该节点，再添加子条目
  navStack.value = [...navStack.value, { id: parentEntry.id, name: parentEntry.name }]
  const newEntry: SettingEntry = { id: genId(), name: '新条目', content: '', children: [] }
  onEntriesChange([...currentEntries.value, newEntry])
  focusPanel()
}

const navigateTo = (index: number) => {
  navStack.value = index < 0 ? [] : navStack.value.slice(0, index + 1)
  focusPanel()
}

const aiGenerate = () => {
  showGenInput.value = true
}

const aiUpdate = async () => {
  if (!props.currentBook) { ElMessage.error('无法获取当前书籍信息'); return }

  const chapter = props.currentChapter ?? null
  if (!chapter?.content?.trim()) {
    ElMessage.error('请先打开一个有内容的章节再使用更新设定功能')
    return
  }

  isGenerating.value = true
  try {
    const aiConfig = await AIConfigService.getCurrentProviderConfig()
    aiService = new AIService(aiConfig)

    const prompt = await replaceUpdateSettingsJsonPromptVariables(
      props.currentBook,
      settingEntries.value,
      chapter.content
    )
    const response = await aiService.generateText(prompt)
    if (response.error) { ElMessage.error(`AI生成失败：${response.error}`); return }

    const patch = parseAIJson<SettingPatch>(response.text)
    if (!patch) { ElMessage.error('AI 返回格式异常，请重试'); return }

    // 补全 add 条目的 id
    patch.add = (patch.add ?? []).map(e => ({ ...e, id: e.id || genId() }))
    patch.modify = patch.modify ?? []
    patch.delete = patch.delete ?? []
    diffPatch.value = patch
  } catch (error) {
    ElMessage.error(error instanceof Error ? `AI生成失败：${error.message}` : 'AI生成失败，请检查网络连接和API配置')
  } finally {
    isGenerating.value = false
  }
}

const runAIGenerate = async () => {
  if (!genPromptText.value.trim() || isGenerating.value) return
  if (!props.currentBook) { ElMessage.error('无法获取当前书籍信息'); return }

  showGenInput.value = false
  isGenerating.value = true
  try {
    const aiConfig = await AIConfigService.getCurrentProviderConfig()
    aiService = new AIService(aiConfig)

    const prompt = await replaceSettingsJsonPromptVariables(props.currentBook, genPromptText.value)
    const response = await aiService.generateText(prompt)
    if (response.error) { ElMessage.error(`AI生成失败：${response.error}`); return }

    const entries = parseAIJson<SettingEntry[]>(response.text)
    if (!Array.isArray(entries)) { ElMessage.error('AI 返回格式异常，请重试'); return }

    // 确保每个条目都有 id
    const ensureIds = (list: SettingEntry[]): SettingEntry[] =>
      list.map(e => ({ ...e, id: e.id || genId(), children: e.children ? ensureIds(e.children) : [] }))

    pushHistory()
    settingEntries.value = ensureIds(entries)
    genPromptText.value = ''
    saveContent()
    focusPanel()
  } catch (error) {
    ElMessage.error(error instanceof Error ? `AI生成失败：${error.message}` : 'AI生成失败，请检查网络连接和API配置')
  } finally {
    isGenerating.value = false
  }
}

// 应用 Diff 弹窗选中的变更
const onApplyPatch = (patch: SettingPatch) => {
  let entries = [...settingEntries.value]

  // 删除
  const deleteSet = new Set(patch.delete)
  const removeFromTree = (list: SettingEntry[]): SettingEntry[] =>
    list.filter(e => !deleteSet.has(e.id)).map(e => ({ ...e, children: e.children ? removeFromTree(e.children) : [] }))
  entries = removeFromTree(entries)

  // 修改
  const modifyMap = new Map(patch.modify.map(m => [m.id, m]))
  const applyModify = (list: SettingEntry[]): SettingEntry[] =>
    list.map(e => {
      const m = modifyMap.get(e.id)
      return m
        ? { ...e, name: m.name ?? e.name, content: m.content ?? e.content, children: e.children ? applyModify(e.children) : [] }
        : { ...e, children: e.children ? applyModify(e.children) : [] }
    })
  entries = applyModify(entries)

  // 新增到根层级
  entries = [...entries, ...patch.add]

  pushHistory()
  settingEntries.value = entries
  diffPatch.value = null
  saveContent()
  focusPanel()
  ElMessage.success('设定已更新')
}

const saveContent = async () => {
  if (!props.currentBook) return
  props.currentBook.settingData = settingEntries.value
  // 同步序列化为文本，供章节生成等 AI 功能使用
  props.currentBook.setting = serializeSettingToText(settingEntries.value)
  await BookConfigService.saveBook(props.currentBook)
}

// 解析 AI 返回的 JSON（兼容 markdown 代码块包裹）
function parseAIJson<T>(text: string): T | null {
  try {
    const cleaned = text.replace(/^```(?:json)?\n?|\n?```$/gm, '').trim()
    return JSON.parse(cleaned) as T
  } catch {
    return null
  }
}

onMounted(() => {
  loadEntries()
  window.addEventListener('keydown', onKeyDown, true)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown, true)
})
watch(() => props.show, (newVal) => { if (newVal) loadEntries() })
watch(() => props.currentBook?.id, () => {
  navStack.value = []
  historyStack.length = 0
  redoStack.length = 0
  loadEntries()
})
</script>

<style scoped>
.tab-panel {
  @apply flex-1 min-h-0 flex flex-col overflow-hidden;
  outline: none;
}

.button-group {
  @apply flex gap-2 px-2 pt-3 pb-1 flex-shrink-0;
}

.ai-btn {
  width: calc(50% - 4px);
  @apply px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed;
  box-sizing: border-box;
}

.update-btn {
  width: calc(50% - 4px);
  @apply px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600 disabled:opacity-50 disabled:cursor-not-allowed;
  box-sizing: border-box;
}

.gen-input-area {
  @apply mx-3 mb-2 flex-shrink-0;
}

.gen-textarea {
  @apply w-full text-xs border border-gray-200 rounded p-2 resize-none focus:outline-none focus:ring-1 focus:ring-blue-400;
}

.gen-input-actions {
  @apply flex gap-2 mt-1 justify-end;
}

.btn-cancel-sm {
  @apply px-3 py-1 text-xs border border-gray-300 rounded hover:bg-gray-50;
}

.btn-confirm-sm {
  @apply px-3 py-1 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50;
}

.tree-area {
  @apply flex-1 overflow-y-auto px-2 pb-3;
}

.nav-bar {
  @apply flex items-center gap-2 px-2 py-2 bg-gray-100 border-b border-gray-200 flex-shrink-0;
}

.nav-back {
  @apply flex-shrink-0 flex items-center justify-center text-base text-gray-400
    hover:text-gray-700 cursor-pointer bg-transparent border-none p-0 leading-none;
}

.nav-add {
  @apply flex-shrink-0 flex items-center justify-center text-lg text-gray-400
    hover:text-gray-700 cursor-pointer bg-transparent border-none p-0 leading-none
    disabled:opacity-40 disabled:cursor-not-allowed ml-auto;
}

.nav-crumbs {
  @apply flex items-center gap-1 min-w-0 text-xs;
}

.nav-btn {
  @apply text-blue-500 hover:text-blue-700 hover:underline cursor-pointer bg-transparent border-none p-0 flex-shrink-0;
}

.nav-root {
  @apply text-gray-500 hover:text-gray-700;
}

.nav-sep {
  @apply text-gray-300 select-none flex-shrink-0;
}

.nav-current {
  @apply text-gray-800 font-semibold truncate min-w-0;
}

@keyframes fadeDown {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
