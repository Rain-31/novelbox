<template>
  <!-- AI配置对话框 -->
  <div class="modal-overlay" v-if="showAIConfigModal" @click="closeAIConfigModal"></div>
  <div class="modal" v-if="showAIConfigModal">
    <div class="modal-header">
      <h2 class="modal-title">AI服务配置</h2>
      <button @click="closeAIConfigModal" class="modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="aiProvider">AI服务商</label>
        <select id="aiProvider" v-model="aiConfig.provider" class="form-select" @change="updateModelOptions">
          <option v-for="provider in AI_PROVIDERS" :key="provider.id" :value="provider.id">
            {{ provider.name }}
          </option>
          <option v-for="provider in aiConfig.customProviders" :key="provider.name" :value="provider.name">
            {{ provider.name }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="aiModel">AI模型</label>
        <select id="aiModel" v-model="aiConfig.model" class="form-select">
          <option v-for="model in modelOptions" :key="model.id" :value="model.id">
            {{ model.name }}
          </option>
        </select>
      </div>
      <div class="form-group">
        <label for="apiKey">API密钥</label>
        <input type="password" id="apiKey" v-model="aiConfig.apiKey" placeholder="请输入API密钥" class="form-input" />
      </div>
      <div class="form-group">
        <label for="proxyUrl">网络代理</label>
        <input type="text" id="proxyUrl" v-model="aiConfig.proxyUrl" placeholder="例如：http://127.0.0.1:7890，留空则不使用代理"
          class="form-input" />
      </div>
      <div class="form-group">
        <button @click="showAdvancedSettings = !showAdvancedSettings" class="advanced-settings-btn">
          {{ showAdvancedSettings ? '收起更多设置' : '更多设置' }}
          <span class="arrow" :class="{ 'arrow-up': showAdvancedSettings }">▼</span>
        </button>
        <div v-if="showAdvancedSettings" class="advanced-settings">
          <div class="form-group">
            <label for="temperature">Temperature</label>
            <div class="slider-container">
              <input type="range" id="temperature" v-model.number="aiConfig.temperature" min="0" max="2" step="0.01" class="slider" />
              <span class="slider-value">{{ aiConfig.temperature.toFixed(2) }}</span>
            </div>
            <div class="slider-description">严谨与想象，值越大想象力越丰富</div>
          </div>
          <div class="form-group">
            <label for="topP">Top P</label>
            <div class="slider-container">
              <input type="range" id="topP" v-model.number="aiConfig.topP" min="0" max="1" step="0.01" class="slider" />
              <span class="slider-value">{{ aiConfig.topP.toFixed(2) }}</span>
            </div>
            <div class="slider-description">控制输出的多样性，值越小输出越保守</div>
          </div>
          <div class="form-group">
            <label for="maxTokens">最大Token数</label>
            <input type="number" id="maxTokens" v-model.number="aiConfig.maxTokens" min="1" max="4096" class="form-input" />
            <div class="slider-description">控制生成文本的最大长度</div>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-footer">
      <button @click="closeAIConfigModal" class="cancel-btn">取消</button>
      <button @click="() => showPromptConfigModal = true" class="config-btn mr-2">提示词配置</button>
      <button @click="() => showCustomProviderModal = true" class="config-btn mr-2">自定义服务商</button>
      <button v-if="isEditingCustomProvider" @click="deleteCustomProvider" class="delete-btn mr-2">删除</button>
      <button @click="saveAIConfig" class="save-btn">保存</button>
    </div>
  </div>

  <!-- 自定义服务商配置对话框 -->
  <div class="modal-overlay" v-if="showCustomProviderModal" @click="closeCustomProviderModal"></div>
  <div class="modal" v-if="showCustomProviderModal">
    <div class="modal-header">
      <h2 class="modal-title">自定义服务商配置</h2>
      <button @click="closeCustomProviderModal" class="modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label for="providerName">名称</label>
        <input type="text" id="providerName" v-model="customProvider.name" placeholder="请输入服务商名称" class="form-input" />
      </div>
      <div class="form-group">
        <label for="apiDomain">API域名</label>
        <input type="text" id="apiDomain" v-model="customProvider.apiDomain" placeholder="请输入API域名（例如：api.example.com）" class="form-input" />
      </div>
      <div class="form-group">
        <label for="apiPath">API路径</label>
        <input type="text" id="apiPath" v-model="customProvider.apiPath" placeholder="请输入API路径（例如：/v1/chat/completions）" class="form-input" />
      </div>
      <div class="form-group">
        <label for="model">模型</label>
        <input type="text" id="model" v-model="customProvider.model" placeholder="请输入模型名称" class="form-input" />
      </div>
    </div>
    <div class="modal-footer">
      <button @click="closeCustomProviderModal" class="cancel-btn">取消</button>
      <button v-if="isEditingCustomProvider" @click="deleteCustomProvider" class="delete-btn mr-2">删除</button>
      <button @click="saveCustomProvider" class="save-btn">保存</button>
    </div>
  </div>

  <!-- 提示词配置对话框 -->
  <div class="modal-overlay" v-if="showPromptConfigModal" @click="closePromptConfigModal"></div>
  <div class="modal prompt-config-modal" v-if="showPromptConfigModal">
    <div class="modal-header">
      <h2 class="modal-title">提示词配置</h2>
      <button @click="closePromptConfigModal" class="modal-close">×</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label>生成书名简介提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.bookNameAndDesc"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="bookNameDescTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>生成设定提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.settings"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="settingsTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>生成剧情大纲提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.outline"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="outlineTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>生成章节细纲提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.chapterOutline"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="chapterOutlineTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>生成小说章节提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.chapter"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="chapterTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>生成小说首章提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.firstChapter"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="firstChapterTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>续写提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.continue"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="continueTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>扩写提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.expand"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="expandTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>缩写提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.abbreviate"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="abbreviateTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>改写提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.rewrite"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="rewriteTextarea"></textarea>
        </div>
      </div>
      <div class="form-group">
        <label>更新设定提示词</label>
        <div class="prompt-input-group">
          <textarea v-model="tempPromptConfig.updateSettings"
            @focus="(e: FocusEvent) => lastFocusedTextarea = e.target as HTMLTextAreaElement"
            class="form-textarea prompt-textarea" ref="updateSettingsTextarea"></textarea>
        </div>
      </div>
    </div>
    <div class="variable-toolbar">
      <button @click="insertVariable('title', $event)">书名</button>
      <button @click="insertVariable('desc', $event)">简介</button>
      <button @click="insertVariable('settings', $event)">设定</button>
      <button @click="insertVariable('outline', $event)">大纲</button>
      <button @click="insertVariable('chapterOutline', $event)">章节细纲</button>
      <button @click="insertVariable('chapter', $event)">章节内容</button>
      <button @click="insertVariable('content', $event)">当前内容</button>
      <button @click="insertVariable('previous', $event)">前文</button>
    </div>
    <div class="modal-footer">
      <button @click="closePromptConfigModal" class="cancel-btn">取消</button>
      <button @click="resetToDefault" class="reset-btn">恢复默认值</button>
      <button @click="savePromptConfig" class="save-btn">保存</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ElMessageBox, ElMessage } from 'element-plus'
import { ref, reactive, onMounted, computed, watch } from 'vue'
import { defaultBookNameAndDescPrompt, defaultSettingsPrompt, defaultOutlinePrompt, defaultChapterOutlinePrompt, defaultChapterPrompt, defaultContinuePrompt, defaultExpandPrompt, defaultAbbreviatePrompt, defaultRewriteAbbreviatePrompt, defaultUpdateSettingsPrompt, defaultFirstChapterPrompt, AI_PROVIDERS, type AIProvider, type AIModel } from '../constants'
import { PromptConfigService } from '../services/promptConfigService'
import { AIConfigService, type CustomProvider } from '../services/aiConfigService'

const props = defineProps<{
  showAIConfigModal: boolean
}>()

interface AIConfig {
  provider: string
  model: string
  apiKey: string
  proxyUrl: string
  customProviders?: CustomProvider[]
  temperature: number
  maxTokens: number
  topP: number
}

interface ProviderConfig {
  provider?: string
  model: string
  apiKey: string
  proxyUrl: string
  customProviders?: CustomProvider[]
  temperature?: number
  maxTokens?: number
  topP?: number
}

// 使用已导入的CustomProvider类型，不再需要本地定义
interface ModelOption {
  id: string
  name: string
}

const emit = defineEmits(['update:showAIConfigModal'])

const aiConfig = reactive<AIConfig>({
  provider: 'openai',
  model: '',
  apiKey: '',
  proxyUrl: '',
  customProviders: [],
  temperature: AI_PROVIDERS.find(p => p.id === 'openai')?.defaultTemperature ?? 0.7,
  maxTokens: 2000,
  topP: AI_PROVIDERS.find(p => p.id === 'openai')?.defaultTopP ?? 0.95
})

const promptConfig = reactive({
  bookNameAndDesc: defaultBookNameAndDescPrompt,
  settings: defaultSettingsPrompt,
  outline: defaultOutlinePrompt,
  chapterOutline: defaultChapterOutlinePrompt,
  chapter: defaultChapterPrompt,
  firstChapter: defaultFirstChapterPrompt,
  continue: defaultContinuePrompt,
  expand: defaultExpandPrompt,
  abbreviate: defaultAbbreviatePrompt,
  rewrite: defaultRewriteAbbreviatePrompt,
  updateSettings: defaultUpdateSettingsPrompt,
})

// 临时存储提示词配置的修改
const tempPromptConfig = reactive({
  bookNameAndDesc: promptConfig.bookNameAndDesc,
  settings: promptConfig.settings,
  outline: promptConfig.outline,
  chapterOutline: promptConfig.chapterOutline,
  chapter: promptConfig.chapter,
  firstChapter: promptConfig.firstChapter,
  continue: promptConfig.continue,
  expand: promptConfig.expand,
  abbreviate: promptConfig.abbreviate,
  rewrite: promptConfig.rewrite,
  updateSettings: promptConfig.updateSettings
})

const modelOptions = ref<ModelOption[]>([])
const showPromptConfigModal = ref(false)
const showCustomProviderModal = ref(false)
const customProvider = reactive({
  name: '',
  apiDomain: '',
  apiPath: '',
  model: ''
})

const isEditingCustomProvider = ref(false)
const lastFocusedTextarea = ref<HTMLTextAreaElement>()

const bookNameDescTextarea = ref<HTMLTextAreaElement>()
const settingsTextarea = ref<HTMLTextAreaElement>()
const outlineTextarea = ref<HTMLTextAreaElement>()
const chapterOutlineTextarea = ref<HTMLTextAreaElement>()
const chapterTextarea = ref<HTMLTextAreaElement>()
const continueTextarea = ref<HTMLTextAreaElement>()
const expandTextarea = ref<HTMLTextAreaElement>()
const abbreviateTextarea = ref<HTMLTextAreaElement>()
const updateSettingsTextarea = ref<HTMLTextAreaElement>()
const firstChapterTextarea = ref<HTMLTextAreaElement>()

const showAdvancedSettings = ref(false)

// 监听对话框显示状态
watch(() => props.showAIConfigModal, async (newValue) => {
  if (newValue) {
    // 当对话框显示时，重新加载配置
    await loadAIConfig()
  }
})

onMounted(async () => {
  try {
    await loadAIConfig()
    updateModelOptions()
  } catch (error) {
    console.error('初始化失败:', error)
  }
})

const loadAIConfig = async () => {
  try {
    // 加载全局配置（包含当前选择的服务商和自定义服务商列表）
    const globalConfig = await AIConfigService.loadProviderConfig('global')
    
    // 加载自定义服务商列表
    if (globalConfig.customProviders) {
      aiConfig.customProviders = globalConfig.customProviders
    }
    
    // 设置当前选择的服务商
    if (globalConfig.provider) {
      aiConfig.provider = globalConfig.provider
    }
    
    // 更新模型选项
    await updateModelOptions()
    
    // 加载当前服务商的配置
    await loadCurrentProviderConfig()
    
    // 加载提示词配置
    await loadPromptConfig()
    Object.assign(tempPromptConfig, promptConfig)
  } catch (error) {
    console.error('加载AI配置失败:', error)
  }
}

// 加载当前选择的服务商配置
const loadCurrentProviderConfig = async () => {
  try {
    const providerConfig = await AIConfigService.loadProviderConfig(aiConfig.provider)
    aiConfig.model = providerConfig.model || ''
    aiConfig.apiKey = providerConfig.apiKey || ''
    aiConfig.proxyUrl = providerConfig.proxyUrl || ''
    
    // 获取当前服务商的默认配置
    const provider = AI_PROVIDERS.find(p => p.id === aiConfig.provider)
    if (provider) {
      // 查找当前选中的模型
      const currentModel = provider.models.find(m => m.id === aiConfig.model)
      
      // 检查是否有针对当前模型的保存配置
      const modelConfig = providerConfig.modelConfigs?.[aiConfig.model]
      
      // 设置temperature (优先级: 模型配置 > 默认值)
      aiConfig.temperature = modelConfig?.temperature ?? provider.defaultTemperature
      
      // 设置maxTokens (优先级: 模型配置 > 模型默认值 > 全局默认值)
      if (modelConfig?.maxTokens) {
        // 1. 使用保存的模型特定配置
        aiConfig.maxTokens = modelConfig.maxTokens
      } else if (currentModel?.maxTokens) {
        // 2. 使用模型的默认值
        aiConfig.maxTokens = currentModel.maxTokens
      } else {
        // 3. 使用全局默认值
        aiConfig.maxTokens = 2000
      }
      
      // 设置topP (优先级: 模型配置 > 默认值)
      aiConfig.topP = modelConfig?.topP ?? provider.defaultTopP
    } else {
      // 自定义服务商使用默认值
      aiConfig.temperature = 0.7
      aiConfig.maxTokens = 2000
      aiConfig.topP = 0.95
      
      // 如果有模型配置，优先使用
      const modelConfig = providerConfig.modelConfigs?.[aiConfig.model]
      if (modelConfig) {
        if (modelConfig.temperature !== undefined) aiConfig.temperature = modelConfig.temperature
        if (modelConfig.maxTokens !== undefined) aiConfig.maxTokens = modelConfig.maxTokens
        if (modelConfig.topP !== undefined) aiConfig.topP = modelConfig.topP
      }
    }
  } catch (error) {
    console.error('加载服务商配置失败:', error)
  }
}

const saveAIConfig = async () => {
  const isCustomProvider = aiConfig.customProviders?.some(p => p.name === aiConfig.provider);
  
  if (!isCustomProvider && !aiConfig.apiKey.trim()) {
    ElMessage.error('请输入API密钥')
    return
  }

  try {
    // 加载当前配置
    const currentConfig = await AIConfigService.loadProviderConfig(aiConfig.provider)
    
    // 确保modelConfigs存在
    if (!currentConfig.modelConfigs) {
      currentConfig.modelConfigs = {}
    }
    
    // 保存当前模型的特定配置
    if (aiConfig.model) {
      currentConfig.modelConfigs[aiConfig.model] = {
        temperature: aiConfig.temperature,
        maxTokens: aiConfig.maxTokens,
        topP: aiConfig.topP
      }
    }
    
    // 保存当前服务商的配置
    const providerConfig = {
      ...currentConfig,
      model: aiConfig.model,
      apiKey: aiConfig.apiKey,
      proxyUrl: aiConfig.proxyUrl
    }
    
    // 保存当前服务商的配置，不包含customProviders
    await AIConfigService.saveConfig(aiConfig.provider, providerConfig)
    
    // 保存全局配置（当前选择的服务商和自定义服务商列表）
    const globalConfig = {
      provider: aiConfig.provider,
      customProviders: aiConfig.customProviders || []
    }
    
    // 保存全局配置到特殊的键名
    await AIConfigService.saveGlobalConfig(globalConfig)
    
    closeAIConfigModal()
    ElMessage.success('AI配置已保存')
  } catch (error) {
    console.error('保存AI配置失败:', error)
    ElMessage.error(error.message || '保存AI配置失败')
  }
}

const closeAIConfigModal = () => {
  emit('update:showAIConfigModal', false)
}

const updateModelOptions = async () => {
  const provider = AI_PROVIDERS.find(p => p.id === aiConfig.provider)
  if (provider) {
    modelOptions.value = provider.models
    isEditingCustomProvider.value = false
    
    // 如果当前选中的模型不在新的选项列表中，选择第一个模型
    if (!modelOptions.value.find(option => option.id === aiConfig.model)) {
      aiConfig.model = modelOptions.value[0]?.id || ''
    }
    
    // 加载当前服务商配置
    try {
      const providerConfig = await AIConfigService.loadProviderConfig(aiConfig.provider)
      
      // 更新API密钥
      if (providerConfig.apiKey !== undefined) {
        aiConfig.apiKey = providerConfig.apiKey
      }
      
      // 更新代理URL
      if (providerConfig.proxyUrl !== undefined) {
        aiConfig.proxyUrl = providerConfig.proxyUrl
      }
      
      // 检查是否有针对当前模型的保存配置
      const modelConfig = providerConfig.modelConfigs?.[aiConfig.model]
      
      if (modelConfig) {
        // 如果有模型特定配置，优先使用
        if (modelConfig.maxTokens !== undefined) {
          aiConfig.maxTokens = modelConfig.maxTokens
        }
        if (modelConfig.temperature !== undefined) {
          aiConfig.temperature = modelConfig.temperature
        }
        if (modelConfig.topP !== undefined) {
          aiConfig.topP = modelConfig.topP
        }
        
        // 如果至少有一个配置项，则提前返回
        if (modelConfig.maxTokens !== undefined || modelConfig.temperature !== undefined || modelConfig.topP !== undefined) {
          return
        }
      }
    } catch (error) {
      console.error("加载配置失败:", error)
    }
    
    // 如果没有保存的配置，使用模型默认值
    const currentModel = provider.models.find(m => m.id === aiConfig.model)
    
    // 设置maxTokens
    if (currentModel?.maxTokens) {
      aiConfig.maxTokens = currentModel.maxTokens
    } else {
      aiConfig.maxTokens = 2000
    }
    
    // 设置temperature和topP
    aiConfig.temperature = provider.defaultTemperature
    aiConfig.topP = provider.defaultTopP
  } else {
    // 查找自定义服务商
    const foundCustomProvider = aiConfig.customProviders?.find(p => p.name === aiConfig.provider)
    if (foundCustomProvider) {
      isEditingCustomProvider.value = true
      modelOptions.value = [{
        id: foundCustomProvider.model,
        name: foundCustomProvider.model
      }]
      
      // 加载自定义服务商配置
      try {
        const providerConfig = await AIConfigService.loadProviderConfig(aiConfig.provider)
        if (providerConfig.apiKey !== undefined) {
          aiConfig.apiKey = providerConfig.apiKey
        }
        if (providerConfig.proxyUrl !== undefined) {
          aiConfig.proxyUrl = providerConfig.proxyUrl
        }
      } catch (error) {
        console.error("加载自定义服务商配置失败:", error)
      }
    } else {
      modelOptions.value = []
    }
  }

  // 加载当前服务商的配置
  await loadCurrentProviderConfig()
}

// 修改watch函数，使用新的modelConfigs结构
watch(() => aiConfig.model, async (newModel) => {
  if (newModel) {
    // 加载当前服务商配置
    try {
      const providerConfig = await AIConfigService.loadProviderConfig(aiConfig.provider)
      
      // 更新API密钥
      if (providerConfig.apiKey) {
        aiConfig.apiKey = providerConfig.apiKey
      }
      
      // 检查是否有针对当前模型的保存配置
      const modelConfig = providerConfig.modelConfigs?.[newModel]
      
      if (modelConfig) {
        // 如果有模型特定配置，优先使用
        if (modelConfig.maxTokens !== undefined) {
          aiConfig.maxTokens = modelConfig.maxTokens
        }
        if (modelConfig.temperature !== undefined) {
          aiConfig.temperature = modelConfig.temperature
        }
        if (modelConfig.topP !== undefined) {
          aiConfig.topP = modelConfig.topP
        }
        
        // 如果至少有一个配置项，则提前返回
        if (modelConfig.maxTokens !== undefined || modelConfig.temperature !== undefined || modelConfig.topP !== undefined) {
          return
        }
      }
    } catch (error) {
      console.error("加载配置失败:", error)
    }
    
    // 如果没有保存的配置，使用模型默认值
    const provider = AI_PROVIDERS.find(p => p.id === aiConfig.provider)
    if (provider) {
      const currentModel = provider.models.find(m => m.id === newModel)
      
      // 设置maxTokens
      if (currentModel?.maxTokens) {
        aiConfig.maxTokens = currentModel.maxTokens
      } else {
        aiConfig.maxTokens = 2000
      }
      
      // 设置temperature和topP
      aiConfig.temperature = provider.defaultTemperature
      aiConfig.topP = provider.defaultTopP
    }
  }
})

// 检查是否有未保存的修改
const hasUnsavedChanges = computed(() => {
  return Object.keys(promptConfig).some(key => promptConfig[key] !== tempPromptConfig[key])
})

const closeCustomProviderModal = () => {
  showCustomProviderModal.value = false
  // 重置表单
  customProvider.name = ''
  customProvider.apiDomain = ''
  customProvider.apiPath = ''
  customProvider.model = ''
  isEditingCustomProvider.value = false
}

const deleteCustomProvider = async () => {
  try {
    // 从自定义服务商列表中删除
    const index = aiConfig.customProviders?.findIndex(p => p.name === aiConfig.provider)
    if (index !== -1) {
      const providerName = aiConfig.provider
      aiConfig.customProviders?.splice(index, 1)
      
      // 删除服务商的配置文件
      await AIConfigService.deleteConfig(providerName)
      
      // 删除后切换到默认服务商
      aiConfig.provider = 'openai'
      await updateModelOptions()
      
      // 保存全局配置
      const globalConfig = {
        provider: aiConfig.provider,
        customProviders: aiConfig.customProviders || []
      }
      await AIConfigService.saveGlobalConfig(globalConfig)
      
      closeCustomProviderModal()
      ElMessage.success('自定义服务商已删除')
    }
  } catch (error) {
    console.error('删除自定义服务商失败:', error)
    ElMessage.error(error.message)
  }
}

const saveCustomProvider = async () => {
  if (!customProvider.name.trim()) {
    ElMessage.error('请输入服务商名称')
    return
  }
  if (!customProvider.apiDomain.trim()) {
    ElMessage.error('请输入API域名')
    return
  }
  if (!customProvider.apiPath.trim()) {
    ElMessage.error('请输入API路径')
    return
  }
  if (!customProvider.model.trim()) {
    ElMessage.error('请输入模型名称')
    return
  }
  
  // 创建新的自定义服务商配置
  const newProvider = {
    name: customProvider.name.trim(),
    apiDomain: customProvider.apiDomain.trim(),
    apiPath: customProvider.apiPath.trim(),
    model: customProvider.model.trim()
  }

  try {
    // 获取当前的自定义服务商列表
    const customProviders = await AIConfigService.getCustomProviders()
    
    // 添加新的自定义服务商
    customProviders.push(newProvider)
    
    // 更新aiConfig中的列表
    aiConfig.customProviders = customProviders
    
    // 保存全局配置
    const globalConfig = {
      provider: aiConfig.provider,
      customProviders: customProviders
    }
    
    // 使用新的saveGlobalConfig方法保存
    await AIConfigService.saveGlobalConfig(globalConfig)
    
    // 更新服务商选项
    await updateModelOptions()
    
    // 关闭弹窗
    closeCustomProviderModal()
    ElMessage.success('自定义服务商添加成功')
  } catch (error) {
    console.error('保存自定义服务商失败:', error.message)
    ElMessage.error(error.message)
  }
}

const closePromptConfigModal = () => {
  if (hasUnsavedChanges.value) {
    ElMessageBox.confirm('有未保存的修改，是否放弃修改？', '提示', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    }).then(() => {
      // 放弃修改，重置临时配置
      Object.keys(promptConfig).forEach(key => {
        tempPromptConfig[key] = promptConfig[key]
      })
      showPromptConfigModal.value = false
    }).catch(() => {
      // 用户点击取消按钮，不做任何操作
    })
  } else {
    showPromptConfigModal.value = false
  }
}

// 加载提示词配置
const loadPromptConfig = async () => {
  try {
    const config = await PromptConfigService.loadConfig()
    Object.assign(promptConfig, config)
  } catch (error) {
    console.error('加载提示词配置失败:', error)
    ElMessage.error(error.message || '加载提示词配置失败')

  }
}

const savePromptConfig = async () => {
  try {
    // 将临时配置同步到正式配置
    Object.keys(promptConfig).forEach(key => {
      promptConfig[key] = tempPromptConfig[key]
    })
    // 保存到文件
    await PromptConfigService.saveConfig(promptConfig)
    showPromptConfigModal.value = false
    ElMessage.success('提示词配置已保存')
  } catch (error) {
    console.error('保存提示词配置失败:', error)
    ElMessage.error(error.message || '保存提示词配置失败')
  }
}

const resetToDefault = () => {
  ElMessageBox.confirm('确定要恢复所有提示词为默认值吗？', '提示', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    // 重置所有提示词为默认值
    tempPromptConfig.bookNameAndDesc = defaultBookNameAndDescPrompt
    tempPromptConfig.settings = defaultSettingsPrompt
    tempPromptConfig.outline = defaultOutlinePrompt
    tempPromptConfig.chapterOutline = defaultChapterOutlinePrompt
    tempPromptConfig.chapter = defaultChapterPrompt
    tempPromptConfig.firstChapter = defaultFirstChapterPrompt
    tempPromptConfig.continue = defaultContinuePrompt
    tempPromptConfig.expand = defaultExpandPrompt
    tempPromptConfig.abbreviate = defaultAbbreviatePrompt
    tempPromptConfig.rewrite = defaultRewriteAbbreviatePrompt
    tempPromptConfig.updateSettings = defaultUpdateSettingsPrompt
  }).catch(() => {
    // 用户点击取消按钮，不做任何操作
  })
}

const insertVariable = (type: string, event: MouseEvent) => {
  const textarea = lastFocusedTextarea.value || getCurrentTextarea()
  const cursorPos = textarea.selectionStart
  const textBefore = textarea.value.substring(0, cursorPos)
  const textAfter = textarea.value.substring(textarea.selectionEnd)
  let variable = '${content}'
  switch (type) {
    case 'title':
      variable = '${title}'
      break
    case 'desc':
      variable = '${description}'
      break
    case 'settings':
      variable = '${settings}'
      break
    case 'outline':
      variable = '${outline}'
      break
    case 'chapterOutline':
      variable = '${chapterOutline}'
      break
    case 'chapter':
      variable = '${chapter}'
      break
    case 'content':
      variable = '${content}'
      break
    case 'previous':
      variable = '${previous}'
      break
  }
  // 根据当前文本区域更新对应的tempPromptConfig属性
  const newValue = textBefore + variable + textAfter
  if (textarea === bookNameDescTextarea.value) {
    tempPromptConfig.bookNameAndDesc = newValue
  } else if (textarea === settingsTextarea.value) {
    tempPromptConfig.settings = newValue
  } else if (textarea === outlineTextarea.value) {
    tempPromptConfig.outline = newValue
  } else if (textarea === chapterOutlineTextarea.value) {
    tempPromptConfig.chapterOutline = newValue
  } else if (textarea === chapterTextarea.value) {
    tempPromptConfig.chapter = newValue
  } else if (textarea === firstChapterTextarea.value) {
    tempPromptConfig.firstChapter = newValue
  } else if (textarea === continueTextarea.value) {
    tempPromptConfig.continue = newValue
  } else if (textarea === expandTextarea.value) {
    tempPromptConfig.expand = newValue
  } else if (textarea === abbreviateTextarea.value) {
    tempPromptConfig.abbreviate = newValue
  }

  // 更新文本区域的值和光标位置
  textarea.value = newValue
  textarea.focus()
  textarea.selectionStart = cursorPos + variable.length
  textarea.selectionEnd = cursorPos + variable.length
}

const getCurrentTextarea = (): HTMLTextAreaElement | undefined => {
  // 优先使用最后记录的焦点元素
  if (lastFocusedTextarea.value) {
    return lastFocusedTextarea.value
  }

  const activeElement = document.activeElement

  // 优先检查当前焦点元素是否是有效的文本区域
  if (activeElement instanceof HTMLTextAreaElement) {
    return activeElement
  }
  const textareas = document.getElementsByClassName('prompt-textarea')
  for (let i = 0; i < textareas.length; i++) {
    if (textareas[i] === activeElement) {
      return textareas[i] as HTMLTextAreaElement
    }
  }

  // 如果都不可用，返回第一个文本区域（如果存在）
  return bookNameDescTextarea.value || undefined
}

</script>

<style scoped>

.modal-overlay {
  @apply fixed inset-0 bg-black bg-opacity-50 z-40;
}

.modal {
  position: fixed !important;
  top: 50% !important;
  left: 50% !important;
  transform: translate(-50%, -50%) !important;
  background-color: white !important;
  border-radius: 0.5rem !important;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04) !important;
  z-index: 50 !important;
  width: 90% !important;
  max-width: 36rem !important;
  overflow: hidden !important;
  display: flex !important;
  flex-direction: column !important;
  max-height: 95vh !important;
}

.prompt-config-modal {
  @apply w-[800px] max-w-[90vw];
}

.modal-header {
  @apply flex justify-between items-center p-4 border-b border-gray-200;
}

.modal-title {
  @apply text-xl font-bold text-gray-800;
}

.modal-body {
  @apply p-6 overflow-y-auto flex-1 overflow-x-hidden;
}

.modal-footer {
  @apply flex justify-end gap-3 p-4 border-t border-gray-200;
}

.modal-close {
  @apply text-2xl text-gray-500 hover:text-gray-700;
}

.form-group {
  @apply mb-4;
}

.form-group label {
  @apply block text-sm font-medium text-gray-700 mb-1;
}

.form-select {
  @apply w-full p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500;
}

.form-input,
.form-textarea {
  @apply w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent box-border;
}

.form-textarea {
  @apply h-24 resize-none;
}

.cancel-btn {
  @apply px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-colors dark:bg-gray-600 dark:text-white dark:hover:bg-gray-700;
}

.save-btn {
  @apply px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors dark:bg-blue-700 dark:hover:bg-blue-800;
}

.delete-btn {
  @apply px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors dark:bg-red-700 dark:hover:bg-red-800;
}

.config-btn {
  @apply flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors;
}

.prompt-input-group {
  @apply relative;
}

.variable-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 16px;
  padding: 12px;
  background-color: #f8f9fa;
  border: 1px solid #e9ecef;
  border-radius: 6px;
}

.variable-toolbar button {
  padding: 6px 12px;
  border: 1px solid #dee2e6;
  border-radius: 4px;
  background-color: white;
  color: #495057;
  font-size: 0.9em;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  gap: 4px;
}

.variable-toolbar button:hover {
  background-color: #e9ecef;
  border-color: #ced4da;
  color: #212529;
}

.variable-toolbar button:active {
  background-color: #dee2e6;
  transform: translateY(1px);
}

.advanced-settings-btn {
  @apply w-full flex items-center justify-between px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors;
}

.arrow {
  @apply transition-transform duration-200;
}

.arrow-up {
  transform: rotate(180deg);
}

.advanced-settings {
  @apply mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200;
}

.slider-container {
  @apply flex items-center gap-4;
}

.slider {
  @apply flex-1;
}

.slider-value {
  @apply w-12 text-center text-gray-600;
}

.slider-description {
  @apply mt-1 text-sm text-gray-500;
}

</style>