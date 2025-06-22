// 移除全局声明，我们将在代码中进行运行时检查
import { Ref, ref } from 'vue';
import { ElMessage } from 'element-plus';
import AIService from '../services/aiService';
import { AIConfigService } from '../services/aiConfigService';
import { type Book } from '../services/bookConfigService';
import { replaceExpandPromptVariables, replaceRewritePromptVariables, replaceAbbreviatePromptVariables } from '../services/promptVariableService';


// 这个接口必须保持与FragmentPane中类似的定义，确保兼容
interface StreamingFragment {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  isGenerating?: boolean;
}

interface FloatingToolbarOptions {
  onContentSave: (chapterId: string, content: string) => void;
  onShowFragment?: (content: string, title: string) => void;
}

export default class FloatingToolbarController {
  private showFloatingToolbar: Ref<boolean> = ref(false);
  private toolbarStyle: Ref<{ top: string; left: string }> = ref({ top: '0px', left: '0px' });
  private selectedTextRange: Ref<any> = ref(null);
  private showRewriteInput: Ref<boolean> = ref(false);
  private rewriteContent: Ref<string> = ref('');
  private showFragmentCallback: (content: string, title: string) => void;
  // 使用Map存储多个流式生成的片段窗口信息，键为片段ID
  private streamingFragments: Map<string, StreamingFragment> = new Map();
  // 使用Map存储多个AI生成任务，键为片段ID
  private generationTasks: Map<string, { abort: () => void }> = new Map();
  // 使用Map存储每个片段的最后一次生成参数，键为片段ID
  private lastGenerationParams: Map<string, {
    type: 'expand' | 'condense' | 'rewrite';
    selectedText: string;
    chapterId?: string;
    bookId?: string;  
    rewritePrompt?: string;
  }> = new Map();

  constructor(options: FloatingToolbarOptions) {
    this.showFragmentCallback = options.onShowFragment || ((content: string, title: string) => {});
  }

  get showFloatingToolbarValue(): boolean {
    return this.showFloatingToolbar.value;
  }

  set showFloatingToolbarValue(value: boolean) {
    this.showFloatingToolbar.value = value;
  }

  get toolbarStyleValue(): { top: string; left: string } {
    return this.toolbarStyle.value;
  }

  get selectedTextRangeValue(): any {
    return this.selectedTextRange.value;
  }

  set selectedTextRangeValue(value: any) {
    this.selectedTextRange.value = value;
  }

  get showRewriteInputValue(): boolean {
    return this.showRewriteInput.value;
  }

  set showRewriteInputValue(value: boolean) {
    this.showRewriteInput.value = value;
  }

  get rewriteContentValue(): string {
    return this.rewriteContent.value;
  }

  set rewriteContentValue(value: string) {
    this.rewriteContent.value = value;
  }

  // 处理选择变化
  handleSelectionChange(range: any, oldRange: any, source: string, quill: any): void {
    // 如果点击在工具栏或输入框外，且当前有高亮状态，则移除高亮
    if (this.showRewriteInput.value) {
      const toolbar = document.querySelector('.floating-toolbar');
      const rewriteInput = document.querySelector('.rewrite-input');
      if ((!toolbar || !toolbar.contains(document.activeElement)) && 
          (!rewriteInput || !rewriteInput.contains(document.activeElement))) {
        this.cleanupRewriteState(quill);
      }
    }

    if (range && range.length > 0 && source === 'user') {
      const bounds = quill.getBounds(range.index, range.length);
      const editorRect = quill.container.getBoundingClientRect();
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

      // 计算工具栏的初始位置
      const toolbarWidth = 200; // 工具栏的大致宽度
      const initialLeft = editorRect.left + bounds.left + scrollLeft + (bounds.width / 2) - (toolbarWidth / 2);
      
      // 检查工具栏是否会超出编辑器右边界
      const rightBoundary = editorRect.right + scrollLeft;
      const adjustedLeft = Math.min(initialLeft, rightBoundary - toolbarWidth - 10); // 10px的边距

      // 计算工具栏的垂直位置，考虑编辑器滚动
      const toolbarTop = editorRect.top + bounds.top + scrollTop - 40;

      // 确保工具栏不会超出编辑器顶部和底部
      const minTop = editorRect.top + scrollTop;
      const maxTop = editorRect.bottom + scrollTop - 40;
      const adjustedTop = Math.max(minTop, Math.min(toolbarTop, maxTop));

      this.toolbarStyle.value = {
        top: `${adjustedTop}px`,
        left: `${adjustedLeft}px`
      };
      this.selectedTextRange.value = range;
      this.showFloatingToolbar.value = true;
    } else {
      const toolbar = document.querySelector('.floating-toolbar');
      const rewriteInput = document.querySelector('.rewrite-input');

      if ((!toolbar || !toolbar.contains(document.activeElement)) && 
          (!rewriteInput || !rewriteInput.contains(document.activeElement))) {
        this.showFloatingToolbar.value = false;
        this.showRewriteInput.value = false;
        this.rewriteContent.value = '';
        this.selectedTextRange.value = null;
      }
    }
  }

  // 清理改写状态
  cleanupRewriteState(quill: any): void {
    const toolbar = document.querySelector('.floating-toolbar');
    toolbar?.classList.remove('show-rewrite');
    
    // 移除高亮效果
    if (this.selectedTextRange.value) {
      if (quill) {
        quill.formatText(this.selectedTextRange.value.index, this.selectedTextRange.value.length, {
          'background': false,
          'color': false,
        });
        // 保持选中状态
        quill.setSelection(this.selectedTextRange.value.index, this.selectedTextRange.value.length, 'user');
      }
    }
    
    this.rewriteContent.value = '';
    this.showRewriteInput.value = false;
  }

  // 处理改写输入框获得焦点
  handleRewriteInputFocus(quill: any): void {
    if (!this.selectedTextRange.value) return;

    quill.formatText(this.selectedTextRange.value.index, this.selectedTextRange.value.length, {
      'background': 'rgba(51, 103, 209)',
      'color': '#fff',
    });

    setTimeout(() => {
      const input = document.querySelector('.rewrite-input') as HTMLInputElement;
      if (input) {
        input.focus();
      }
    }, 0);
  }

  // 停止指定片段ID的生成任务，如果未指定则尝试停止所有任务
  async stopGeneration(fragmentId?: string): Promise<void> {
    
    // 如果指定了片段ID，只停止该片段的生成任务
    if (fragmentId) {
      const task = this.generationTasks.get(fragmentId);
      if (task) {
        try {
          task.abort();
          this.generationTasks.delete(fragmentId);
          
          // 更新片段状态
          const fragment = this.streamingFragments.get(fragmentId);
          if (fragment) {
            fragment.isGenerating = false;
            const title = fragment.title.replace('（生成中...）', '（已停止）');
            
            // 更新片段窗口
            if (window.electronAPI) {
              try {
                fragment.title = title;
                await window.electronAPI.updateFragmentContent(fragment);
              } catch (error) {
                console.error('更新片段窗口失败:', error);
              }
            } else {
              this.showFragmentCallback(fragment.content, title);
            }
          } else {
            console.log(`没有找到ID为 ${fragmentId} 的片段`);
          }
          
          ElMessage.info('已停止AI生成');
          return;
        } catch (error) {
          console.error('停止生成任务时出错:', error);
        }
      } else {
        console.log(`没有找到ID为 ${fragmentId} 的活跃生成任务`);
        
        // 检查片段是否存在，如果存在但没有活跃任务，可能是已经完成的任务
        const fragment = this.streamingFragments.get(fragmentId);
        if (fragment && fragment.isGenerating) {
          // 更新片段状态为非生成状态
          fragment.isGenerating = false;
          if (fragment.title.includes('（生成中...）')) {
            fragment.title = fragment.title.replace('（生成中...）', '');
            
            // 更新片段窗口
            if (window.electronAPI) {
              try {
                await window.electronAPI.updateFragmentContent(fragment);
              } catch (error) {
                console.error('更新片段窗口失败:', error);
              }
            } else {
              this.showFragmentCallback(fragment.content, fragment.title);
            }
          }
        }
        
        ElMessage.info('没有正在进行的AI生成任务');
      }
    } else {
      // 如果没有指定片段ID，尝试停止所有生成任务
      if (this.generationTasks.size > 0) {
        const promises: Promise<void>[] = [];
        
        // 为每个活跃任务创建停止Promise
        this.generationTasks.forEach((task, id) => {
          promises.push(this.stopGeneration(id));
        });
        
        // 等待所有任务停止
        await Promise.all(promises);
        ElMessage.info(`已停止所有AI生成任务`);
      } else {
        console.log('没有活跃的生成任务可停止');
        ElMessage.info('没有正在进行的AI生成任务');
      }
    }
  }

  // 重新生成指定片段ID的内容
  async regenerateContent(quill: any, currentChapter: any, currentBook: Book | null, fragmentId?: string): Promise<void> {
    // 如果指定了片段ID，只重新生成该片段
    if (fragmentId) {
      const params = this.lastGenerationParams.get(fragmentId);
      if (!params) {
        ElMessage.error(`无法重新生成片段 ${fragmentId}，没有找到上次生成的参数`);
        return;
      }

      // 先检查是否有真正活跃的任务
      const task = this.generationTasks.get(fragmentId);
      const fragment = this.streamingFragments.get(fragmentId);
      
      if (!fragment) {
        ElMessage.error(`无法找到片段 ${fragmentId}`);
        return;
      }
      
      // 只有当任务确实存在且片段处于生成状态时，才停止任务
      if (task && fragment.isGenerating) {
        await this.stopGeneration(fragmentId);
      } else if (fragment.isGenerating) {
        // 如果片段状态是生成中，但没有对应任务，直接更新状态
        fragment.isGenerating = false;
      }
      
      // 更新片段状态为生成中
      fragment.isGenerating = true;
      const currentTitle = fragment.title.replace('（已停止）', '');
      fragment.title = `${currentTitle}（生成中...）`;
      
      // 更新片段窗口状态
      if (window.electronAPI) {
        try {
          await window.electronAPI.updateFragmentContent(fragment);
        } catch (error) {
          console.error('更新片段窗口失败:', error);
        }
      }

      // 清空内容准备重新生成
      fragment.content = '';
      
      // 根据上次的生成类型重新生成
      switch (params.type) {
        case 'expand':
          await this.expandSelectedText(quill, currentChapter, currentBook, fragmentId);
          break;
        case 'condense':
          await this.condenseSelectedText(quill, currentChapter, currentBook, fragmentId);
          break;
        case 'rewrite':
          if (params.rewritePrompt) {
            this.rewriteContent.value = params.rewritePrompt;
            await this.rewriteSelectedText(quill, currentChapter, currentBook, fragmentId);
          } else {
            ElMessage.error('无法重新生成，缺少改写提示');
          }
          break;
      }
    } else {
      ElMessage.error('重新生成需要指定片段ID');
    }
  }

  // 创建或更新流式片段窗口
  private async showStreamingFragment(content: string, baseTitle: string, isFirst: boolean = false, isComplete: boolean = false, fragmentId?: string): Promise<string> {
    const title = isComplete ? baseTitle : `${baseTitle}（生成中...）`;
    
    // 如果提供了fragmentId且已存在，则更新该片段
    if (fragmentId && this.streamingFragments.has(fragmentId)) {
      const fragment = this.streamingFragments.get(fragmentId)!;
      fragment.content = content;
      fragment.title = title;
      fragment.updatedAt = new Date().toISOString();
      fragment.isGenerating = !isComplete;

      // 检查是否在Electron环境中
      if (window.electronAPI) {
        try {
          // 使用updateFragmentContent更新窗口内容
          await window.electronAPI.updateFragmentContent(fragment);
          
        } catch (error) {
          console.error('更新流式片段窗口失败:', error);
          // 如果更新失败，使用回退方案
          this.showFragmentCallback(content, title);
        }
      } else {
        // 不在Electron环境中，使用标准回调
        this.showFragmentCallback(content, title);
      }
      
      return fragment.id;
    } 
    // 否则创建新片段
    else {
      const newId = fragmentId || `streaming-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const fragment: StreamingFragment = {
        id: newId,
        title: title,
        content: content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isGenerating: !isComplete
      };
      
      // 保存到片段Map中
      this.streamingFragments.set(fragment.id, fragment);

      // 检查是否在Electron环境中
      if (window.electronAPI) {
        try {
          // 直接使用electronAPI创建窗口
          await window.electronAPI.createFragmentWindow(fragment);
        } catch (error) {
          console.error('创建流式片段窗口失败:', error);
          ElMessage.error('创建片段窗口失败');
          // 如果创建窗口失败，使用回退方案
          this.showFragmentCallback(content, title);
        }
      } else {
        // 不在Electron环境中，使用标准回调
        this.showFragmentCallback(content, title);
      }
      
      return fragment.id;
    }
  }

  // 扩写选中文本
  async expandSelectedText(quill: any, currentChapter: any, currentBook: Book | null, existingFragmentId?: string): Promise<void> {
    if (!this.selectedTextRange.value) return;
    const selectedText = quill.getText(this.selectedTextRange.value.index, this.selectedTextRange.value.length);

    if (!currentBook) {
      ElMessage.error('无法获取当前书籍信息');
      return;
    }

    // 获取当前章节的细纲
    const findChapterDetail = (chapters: any[]): any => {
      for (const ch of chapters) {
        if (ch.id === currentChapter?.id) return ch;
        if (ch.children) {
          const found = findChapterDetail(ch.children);
          if (found) return found;
        }
      }
    };

    const chapter = findChapterDetail(currentBook.content || []);
    if (!chapter?.detailOutline?.detailContent) {
      ElMessage.error('请先编写本章细纲');
      return;
    }

    const aiConfig = await AIConfigService.getCurrentProviderConfig();
    const aiService = new AIService(aiConfig);

    const prompt = await replaceExpandPromptVariables(
      currentBook,
      chapter,
      quill.getText(),
      selectedText
    );

    try {
      // 显示初始的空片段窗口或更新现有窗口
      const fragmentId = await this.showStreamingFragment('', '扩写内容', true, false, existingFragmentId);
      let content = '';
      
      // 保存生成参数用于重新生成
      this.lastGenerationParams.set(fragmentId, {
        type: 'expand',
        selectedText,
        bookId: currentBook.id,
        chapterId: currentChapter?.id
      });
      
      // 定义回调函数
      const streamCallback = (text: string, error?: string, complete?: boolean) => {
        if (error) {
          ElMessage.error(`AI扩写失败：${error}`);
          return;
        }
        
        // 累积内容
        content += text;
        
        // 更新片段窗口内容
        this.showStreamingFragment(content, '扩写内容', false, complete || false, fragmentId);
        
        // 如果生成完成，清理任务
        if (complete) {
          this.cleanupGenerationTask(fragmentId);
        }
      };
      
      // 使用流式请求 - AIService内部会创建自己的AbortController
      const response = await aiService.generateText(prompt, streamCallback);
      
      // 保存生成任务的cancel函数，以便后续可以调用停止生成
      if ('cancel' in response) {
        this.generationTasks.set(fragmentId, {
          abort: () => {
            response.cancel();
          }
        });
      }
      
      if ('error' in response && response.error) {
        ElMessage.error(`AI扩写失败：${response.error}`);
        console.error('AI扩写失败:', response.error);
      }
    } catch (error) {
      console.error('AI扩写失败:', error);
      ElMessage.error('AI扩写失败，请检查网络连接和API配置');
    }
  }

  // 缩写选中文本
  async condenseSelectedText(quill: any, currentChapter: any, currentBook: Book | null, existingFragmentId?: string): Promise<void> {
    if (!this.selectedTextRange.value) return;
    const selectedText = quill.getText(this.selectedTextRange.value.index, this.selectedTextRange.value.length);

    if (!currentBook) {
      ElMessage.error('无法获取当前书籍信息');
      return;
    }

    const aiConfig = await AIConfigService.getCurrentProviderConfig();
    const aiService = new AIService(aiConfig);

    try {
      const prompt = await replaceAbbreviatePromptVariables(
        currentBook,
        currentChapter,
        quill.getText(),
        selectedText
      );

      // 显示初始的空片段窗口或更新现有窗口
      const fragmentId = await this.showStreamingFragment('', '缩写内容', true, false, existingFragmentId);
      let content = '';
      
      // 保存生成参数用于重新生成
      this.lastGenerationParams.set(fragmentId, {
        type: 'condense',
        selectedText,
        bookId: currentBook.id,
        chapterId: currentChapter?.id
      });
      
      // 定义回调函数
      const streamCallback = (text: string, error?: string, complete?: boolean) => {
        if (error) {
          ElMessage.error(`AI缩写失败：${error}`);
          return;
        }
        
        // 累积内容
        content += text;
        
        // 更新片段窗口内容
        this.showStreamingFragment(content, '缩写内容', false, complete || false, fragmentId);
        
        // 如果生成完成，清理任务
        if (complete) {
          this.cleanupGenerationTask(fragmentId);
        }
      };
      
      // 使用流式请求 - AIService内部会创建自己的AbortController
      const response = await aiService.generateText(prompt, streamCallback);
      
      // 保存生成任务的cancel函数，以便后续可以调用停止生成
      if ('cancel' in response) {
        this.generationTasks.set(fragmentId, {
          abort: () => {
            response.cancel();
          }
        });
      }
      
      if ('error' in response && response.error) {
        ElMessage.error(`AI缩写失败：${response.error}`);
        console.error('AI缩写失败:', response.error);
      }
    } catch (error) {
      console.error('AI缩写失败:', error);
      ElMessage.error('AI缩写失败，请检查网络连接和API配置');
    }
  }

  // 改写选中文本
  async rewriteSelectedText(quill: any, currentChapter: any, currentBook: Book | null, existingFragmentId?: string): Promise<void> {
    if (!this.selectedTextRange.value) return;
    const { index: tempIndex, length: tempLength } = this.selectedTextRange.value;

    if (this.rewriteContent.value) {
      if (!currentBook) {
        ElMessage.error('无法获取当前书籍信息');
        return;
      }

      const aiConfig = await AIConfigService.getCurrentProviderConfig();
      const aiService = new AIService(aiConfig);


      const rewriteContent = this.rewriteContent.value;
      const selectedText = quill.getText(tempIndex, tempLength);
      const prompt = await replaceRewritePromptVariables(
        currentBook,
        currentChapter,
        quill.getText(),
        selectedText,
        rewriteContent
      );

      try {
        // 先清除高亮效果
        quill.formatText(tempIndex, tempLength, {
          'background': false,
          'color': false,
        });
        
        quill.setSelection(tempIndex, tempLength, 'user');

        // 显示初始的空片段窗口或更新现有窗口
        const fragmentId = await this.showStreamingFragment('', '改写内容', true, false, existingFragmentId);
        let content = '';
        
        // 保存生成参数用于重新生成
        this.lastGenerationParams.set(fragmentId, {
          type: 'rewrite',
          selectedText,
          bookId: currentBook.id,
          chapterId: currentChapter?.id,
          rewritePrompt: rewriteContent
        });
        
        // 定义回调函数
        const streamCallback = (text: string, error?: string, complete?: boolean) => {
          if (error) {
            ElMessage.error(`AI改写失败：${error}`);
            return;
          }
          
          // 累积内容
          content += text;
          
          // 更新片段窗口内容
          this.showStreamingFragment(content, '改写内容', false, complete || false, fragmentId);
          
          // 如果生成完成，清理任务
          if (complete) {
            this.cleanupGenerationTask(fragmentId);
          }
        };
        
        // 使用流式请求 - AIService内部会创建自己的AbortController
        const response = await aiService.generateText(prompt, streamCallback);
        
        // 保存生成任务的cancel函数，以便后续可以调用停止生成
        if ('cancel' in response) {
          this.generationTasks.set(fragmentId, {
            abort: () => {
              response.cancel();
            }
          });
        }
        
        if ('error' in response && response.error) {
          ElMessage.error(`AI改写失败：${response.error}`);
          console.error('AI改写失败:', response.error);
        }
      } catch (error) {
        console.error('AI改写失败:', error);
        ElMessage.error('AI改写失败，请检查网络连接和API配置');
      }
    } else {
      this.showRewriteInput.value = !this.showRewriteInput.value
      if (this.showRewriteInput.value) {
        const selection = quill.getSelection()
        if (selection) {
          const toolbar = document.querySelector('.floating-toolbar');
          if (toolbar) {
            // 获取工具栏和编辑器的位置信息
            const toolbarRect = toolbar.getBoundingClientRect();
            const editorRect = quill.container.getBoundingClientRect();
            const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
            
            // 计算展开后的工具栏宽度（包含输入框）
            const expandedToolbarWidth = 430; // 展开后的工具栏宽度
            const rightBoundary = editorRect.right + scrollLeft;
            const currentLeft = parseFloat(this.toolbarStyle.value.left);
            
            // 如果展开后会超出右边界，则向左调整位置
            if (currentLeft + expandedToolbarWidth > rightBoundary) {
              const newLeft = rightBoundary - expandedToolbarWidth - 10; // 10px的边距
              // 使用 requestAnimationFrame 确保在下一帧渲染前调整位置
              requestAnimationFrame(() => {
                this.toolbarStyle.value.left = `${newLeft}px`;
                // 在位置调整后再添加展开类
                requestAnimationFrame(() => {
                  toolbar.classList.add('show-rewrite');
                });
              });
            } else {
              toolbar.classList.add('show-rewrite');
            }
          }
        }
      } else {
        this.cleanupRewriteState(quill);
      }
    }
  }

  // 添加一个新方法来清理已完成的生成任务
  private cleanupGenerationTask(fragmentId: string): void {
    if (this.generationTasks.has(fragmentId)) {
      this.generationTasks.delete(fragmentId);
    }
  }
} 