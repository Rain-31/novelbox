<template>
  <div class="sidebar-toggle">
    <button 
      class="toggle-button"
      @click="toggleSidebar"
    >
      <span class="toggle-text" :class="{ 'active': isChapters }">目录</span>
      <span class="divider">/</span>
      <span class="toggle-text" :class="{ 'active': !isChapters }">片段</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const props = defineProps<{
  initialTab?: 'chapters' | 'fragments'
}>()

const emit = defineEmits(['toggle'])

const isChapters = ref(props.initialTab !== 'fragments')

const toggleSidebar = () => {
  isChapters.value = !isChapters.value
  emit('toggle', isChapters.value ? 'chapters' : 'fragments')
}
</script>

<style scoped>
.sidebar-toggle {
  @apply flex justify-center;
}

.toggle-button {
  @apply flex items-center justify-center px-5 py-1 
         bg-white border border-gray-200 rounded-full;
  min-width: 110px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
}

.toggle-text {
  @apply text-sm text-gray-400;
}

.toggle-text.active {
  @apply text-blue-500;
}

.divider {
  @apply mx-1 text-gray-300;
}
</style> 