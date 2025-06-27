import { ref } from 'vue';
import Delta from 'quill-delta';
import { ElMessage, ElMessageBox } from 'element-plus';
import AIService from '../services/aiService';
import { replaceChapterPromptVariables, replaceFirstChapterPromptVariables } from '../services/promptVariableService';
import type { Book, Chapter } from '../services/bookConfigService';
import { AIConfigService } from '../services/aiConfigService';

interface AIChapterGenerateOptions {
  onContentSave: (chapterId: string, content: string) => void;
}

export class AIChapterGenerateController {
  private isGenerating = ref(false);
  private generationTask = ref<{ cancel?: () => void; error?: string; text?: string } | null>(null);
  private options: AIChapterGenerateOptions;
  private buttonObserver: MutationObserver | null = null;

  constructor(options: AIChapterGenerateOptions) {
    this.options = options;
  }

  get isGeneratingValue() {
    return this.isGenerating.value;
  }

  /**
   * 初始化AI生成按钮文本
   */
  initGenerateButton() {
    // 立即尝试设置按钮文本
    this.setButtonContent();
    
    // 如果按钮不存在，设置DOM观察器来监听按钮何时出现
    if (!document.querySelector('.ql-ai-generate') && !this.buttonObserver) {
      this.buttonObserver = new MutationObserver((mutations) => {
        const button = document.querySelector('.ql-ai-generate');
        if (button) {
          button.setAttribute('data-content', 'AI生成');
          // 找到按钮后停止观察
          this.buttonObserver?.disconnect();
          this.buttonObserver = null;
        }
      });
      
      // 开始观察DOM变化
      this.buttonObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
  
  /**
   * 设置按钮内容
   */
  private setButtonContent() {
    const button = document.querySelector('.ql-ai-generate');
    if (button) {
      button.setAttribute('data-content', 'AI生成');
      return true;
    }
    return false;
  }

  /**
   * 处理AI生成章节内容
   */
  async handleAIGenerate(editor: any, currentChapter: Chapter | null, currentBook: Book | null) {
    const button = document.querySelector('.ql-ai-generate');
    
    // 如果正在生成，则取消生成
    if (this.isGenerating.value) {
      this.generationTask.value?.cancel?.();
      this.isGenerating.value = false;
      button?.setAttribute('data-content', 'AI生成');
      return;
    }
    
    // 更新按钮文本
    button?.setAttribute('data-content', '停止生成');

    // 检查章节和书籍信息
    if (!currentChapter?.id) return;

    if (!currentBook) {
      ElMessage.error('无法获取当前书籍信息');
      return;
    }

    this.isGenerating.value = true;

    try {
      // 获取AI配置
      const aiConfig = await AIConfigService.getCurrentProviderConfig();
      const aiService = new AIService(aiConfig);

      // 检查是否为第1章
      const chapterNumber = parseInt(currentChapter.detailOutline?.chapterNumber || '0');
      let prompt = '';
      
      if (chapterNumber === 1) {
        // 如果是第1章，询问用户是否使用首章提示词
        try {
          const useFirstChapterPrompt = await ElMessageBox.confirm('检测到当前是第1章，是否使用小说首章提示词来生成章节？', '提示', {
            confirmButtonText: '是',
            cancelButtonText: '否',
            type: 'info'
          }).then(() => true).catch(() => false);
          
          if (useFirstChapterPrompt) {
            // 用户选择使用首章提示词
            prompt = await replaceFirstChapterPromptVariables(currentBook, currentChapter);
          } else {
            // 用户选择不使用首章提示词，使用普通章节提示词
            prompt = await replaceChapterPromptVariables(currentBook, currentChapter);
          }
        } catch (error) {
          // 如果对话框出错，默认使用普通章节提示词
          prompt = await replaceChapterPromptVariables(currentBook, currentChapter);
        }
      } else {
        // 非第1章，使用普通章节提示词
        prompt = await replaceChapterPromptVariables(currentBook, currentChapter);
      }

      let generatedText = '';

      // 执行AI生成
      this.generationTask.value = await aiService.generateText(prompt, (text: string, error?: string, complete?: boolean) => {
        if (error) {
          ElMessage.error(`AI生成失败：${error}`);
          this.isGenerating.value = false;
          this.generationTask.value = null;
          this.initGenerateButton();
          return;
        }
        
        if (complete) {
          this.isGenerating.value = false;
          this.generationTask.value = null;
          ElMessage.success('AI生成完成');
          if (currentChapter?.id) {
            this.options.onContentSave(currentChapter.id, editor.root.innerHTML);
          }
          this.initGenerateButton();
        }
        
        generatedText += text;
        if (!complete) {
          const currentLength = editor.getLength() - 1;
          editor.updateContents(new Delta().retain(currentLength).insert(text), 'user');
          
          // 设置选区位置并滚动到可见区域
          const newPosition = currentLength + text.length;
          editor.setSelection(newPosition, 0);
          editor.scrollIntoView();
        }
      });

    } catch (error: any) {
      ElMessage.error(error.message);
      this.isGenerating.value = false;
      button?.setAttribute('data-content', 'AI生成');
      return;
    }
  }
}

export default AIChapterGenerateController; 