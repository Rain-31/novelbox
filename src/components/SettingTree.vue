<template>
  <div class="setting-tree">
    <div v-if="entries.length === 0" class="empty-tip">
      暂无设定条目，点击"+ 新增"或使用 AI 生成
    </div>
    <SettingTreeNode
      v-for="entry in entries"
      :key="entry.id"
      :entry="entry"
      @update="onUpdate"
      @delete="onDelete"
      @drill="$emit('drill', $event)"
      @add-child="$emit('add-child', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import type { SettingEntry } from '../services/bookConfigService'
import SettingTreeNode from './SettingTreeNode.vue'

const props = defineProps<{
  entries: SettingEntry[]
}>()

const emit = defineEmits<{
  'update:entries': [entries: SettingEntry[]]
  'drill': [entry: SettingEntry]
  'add-child': [entry: SettingEntry]
}>()

const onUpdate = (updated: SettingEntry) => {
  emit('update:entries', props.entries.map(e => e.id === updated.id ? updated : e))
}

const onDelete = (id: string) => {
  emit('update:entries', props.entries.filter(e => e.id !== id))
}
</script>

<style scoped>
.setting-tree {
  /* natural block flow, scroll handled by parent tree-area */
}

.empty-tip {
  @apply text-xs text-gray-400 text-center py-8 px-4;
}
</style>
