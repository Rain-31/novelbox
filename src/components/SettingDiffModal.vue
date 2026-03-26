<template>
  <div class="modal-mask" @click.self="$emit('cancel')">
    <div class="modal-box">
      <h3 class="modal-title">设定更新预览</h3>
      <p class="modal-subtitle">AI 分析出以下变更，勾选要应用的条目：</p>

      <div class="diff-list">
        <!-- 新增 -->
        <template v-if="patch.add.length">
          <div class="diff-section-title add">新增（{{ patch.add.length }}）</div>
          <label v-for="item in patch.add" :key="item.id" class="diff-item add">
            <input type="checkbox" v-model="selectedAdd" :value="item.id" />
            <span class="badge add">+</span>
            <div class="diff-text">
              <div class="diff-name">{{ item.name }}</div>
              <div class="diff-content">{{ item.content }}</div>
            </div>
          </label>
        </template>

        <!-- 修改 -->
        <template v-if="patch.modify.length">
          <div class="diff-section-title modify">修改（{{ patch.modify.length }}）</div>
          <label v-for="item in patch.modify" :key="item.id" class="diff-item modify">
            <input type="checkbox" v-model="selectedModify" :value="item.id" />
            <span class="badge modify">~</span>
            <div class="diff-text">
              <div class="diff-name">{{ item.name }}</div>
              <div class="diff-old">{{ getOriginalContent(item.id) }}</div>
              <div class="diff-arrow">↓</div>
              <div class="diff-content">{{ item.content }}</div>
            </div>
          </label>
        </template>

        <!-- 删除 -->
        <template v-if="patch.delete.length">
          <div class="diff-section-title delete">删除（{{ patch.delete.length }}）</div>
          <label v-for="id in patch.delete" :key="id" class="diff-item delete">
            <input type="checkbox" v-model="selectedDelete" :value="id" />
            <span class="badge delete">-</span>
            <div class="diff-text">
              <div class="diff-name">{{ getOriginalName(id) }}</div>
              <div class="diff-old">{{ getOriginalContent(id) }}</div>
            </div>
          </label>
        </template>

        <div v-if="!patch.add.length && !patch.modify.length && !patch.delete.length" class="empty-tip">
          AI 未检测到任何设定变更
        </div>
      </div>

      <div class="modal-footer">
        <button @click="$emit('cancel')" class="btn-cancel">取消</button>
        <button @click="applySelected" class="btn-apply" :disabled="nothingSelected">
          应用选中（{{ selectedCount }}）
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { SettingEntry } from '../services/bookConfigService'

export interface SettingPatch {
  add: SettingEntry[]
  modify: Array<{ id: string; name: string; content: string }>
  delete: string[]
}

const props = defineProps<{
  patch: SettingPatch
  currentEntries: SettingEntry[]
}>()

const emit = defineEmits<{
  apply: [patch: SettingPatch]
  cancel: []
}>()

const selectedAdd = ref<string[]>(props.patch.add.map(i => i.id))
const selectedModify = ref<string[]>(props.patch.modify.map(i => i.id))
const selectedDelete = ref<string[]>([...props.patch.delete])

const selectedCount = computed(
  () => selectedAdd.value.length + selectedModify.value.length + selectedDelete.value.length
)
const nothingSelected = computed(() => selectedCount.value === 0)

// 从现有设定树中查找原始内容
const findInTree = (entries: SettingEntry[], id: string): SettingEntry | undefined => {
  for (const e of entries) {
    if (e.id === id) return e
    if (e.children) {
      const found = findInTree(e.children, id)
      if (found) return found
    }
  }
}

const getOriginalContent = (id: string) => findInTree(props.currentEntries, id)?.content ?? ''
const getOriginalName = (id: string) => findInTree(props.currentEntries, id)?.name ?? id

const applySelected = () => {
  emit('apply', {
    add: props.patch.add.filter(i => selectedAdd.value.includes(i.id)),
    modify: props.patch.modify.filter(i => selectedModify.value.includes(i.id)),
    delete: props.patch.delete.filter(id => selectedDelete.value.includes(id)),
  })
}
</script>

<style scoped>
.modal-mask {
  @apply fixed inset-0 bg-black bg-opacity-40 z-50 flex items-center justify-center;
}

.modal-box {
  @apply bg-white rounded-xl shadow-2xl w-80 max-h-[80vh] flex flex-col overflow-hidden;
}

.modal-title {
  @apply text-base font-bold px-4 pt-4 pb-1;
}

.modal-subtitle {
  @apply text-xs text-gray-500 px-4 pb-2;
}

.diff-list {
  @apply flex-1 overflow-y-auto px-4 pb-2;
}

.diff-section-title {
  @apply text-xs font-semibold py-1 mt-2;
}
.diff-section-title.add { @apply text-green-600; }
.diff-section-title.modify { @apply text-yellow-600; }
.diff-section-title.delete { @apply text-red-500; }

.diff-item {
  @apply flex items-start gap-2 py-1.5 border-b border-gray-100 cursor-pointer;
}

.badge {
  @apply text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5;
}
.badge.add { @apply bg-green-100 text-green-700; }
.badge.modify { @apply bg-yellow-100 text-yellow-700; }
.badge.delete { @apply bg-red-100 text-red-600; }

.diff-text { @apply flex-1 min-w-0; }

.diff-name { @apply text-xs font-medium text-gray-800 truncate; }

.diff-content { @apply text-xs text-gray-600 mt-0.5 whitespace-pre-wrap; }

.diff-old { @apply text-xs text-gray-400 line-through mt-0.5 whitespace-pre-wrap; }

.diff-arrow { @apply text-xs text-gray-400 my-0.5; }

.empty-tip { @apply text-xs text-gray-400 text-center py-4; }

.modal-footer {
  @apply flex gap-2 px-4 py-3 border-t border-gray-100;
}

.btn-cancel {
  @apply flex-1 py-1.5 text-sm rounded border border-gray-300 hover:bg-gray-50;
}

.btn-apply {
  @apply flex-1 py-1.5 text-sm rounded bg-blue-500 text-white hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed;
}
</style>
