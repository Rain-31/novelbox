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
  wasStopped?: boolean;
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
            fragment.wasStopped = true;
            
            // 更新片段窗口
            if (window.electronAPI) {
              try {
                // 创建一个新对象发送，确保所有属性都被复制
                const updateData = {
                  id: fragment.id,
                  title: fragment.title,
                  content: fragment.content,
                  createdAt: fragment.createdAt,
                  updatedAt: fragment.updatedAt,
                  isGenerating: fragment.isGenerating,
                  wasStopped: fragment.wasStopped
                };
                
                await window.electronAPI.updateFragmentContent(updateData);
              } catch (error) {
                console.error('更新片段窗口失败:', error);
              }
            } else {
              this.showFragmentCallback(fragment.content, fragment.title);
            }
          } else {
            console.log(`没有找到ID为 ${fragmentId} 的片段`);
          }
          
          return;
        } catch (error) {
          console.error('停止生成任务时出错:', error);
        }
      } else {
        // 检查片段是否存在，如果存在但没有活跃任务，可能是已经完成的任务
        const fragment = this.streamingFragments.get(fragmentId);
        if (fragment && fragment.isGenerating) {
          // 更新片段状态为非生成状态
          fragment.isGenerating = false;
          
          // 更新片段窗口
          if (window.electronAPI) {
            try {
              // 创建一个新对象发送，确保所有属性都被复制
              const updateData = {
                id: fragment.id,
                title: fragment.title,
                content: fragment.content,
                createdAt: fragment.createdAt,
                updatedAt: fragment.updatedAt,
                isGenerating: fragment.isGenerating,
                wasStopped: fragment.wasStopped
              };
              
              await window.electronAPI.updateFragmentContent(updateData);
            } catch (error) {
              console.error('更新片段窗口失败:', error);
            }
          } else {
            this.showFragmentCallback(fragment.content, fragment.title);
          }
        }
        
        ElMessage.info('没有正在进行的AI生成任务');
      }
    } else {
      // 如果没有指定片段ID，尝试停止所有生成任务
      if (this.generationTasks.size > 0) {
        console.log(`尝试停止所有生成任务: ${this.generationTasks.size}个`);
        
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
      fragment.wasStopped = false;
      
      // 更新片段窗口状态
      if (window.electronAPI) {
        try {
          // 创建一个新对象发送，确保所有属性都被复制
          const updateData = {
            id: fragment.id,
            title: fragment.title,
            content: fragment.content,
            createdAt: fragment.createdAt,
            updatedAt: fragment.updatedAt,
            isGenerating: fragment.isGenerating,
            wasStopped: fragment.wasStopped
          };
          
          await window.electronAPI.updateFragmentContent(updateData);
        } catch (error) {
          console.error('更新片段窗口失败:', error);
        }
      }

      // 清空内容准备重新生成
      fragment.content = '';
      
      // 获取AI配置
      const aiConfig = await AIConfigService.getCurrentProviderConfig();
      const aiService = new AIService(aiConfig);
      
      // 根据上次的生成类型重新生成
      try {
        let prompt = '';
        
        // 根据类型准备提示词
        switch (params.type) {
          case 'expand':
            prompt = await replaceExpandPromptVariables(
              currentBook,
              currentChapter,
              quill.getText(),
              params.selectedText
            );
            break;
          case 'condense':
            prompt = await replaceAbbreviatePromptVariables(
              currentBook,
              currentChapter,
              quill.getText(),
              params.selectedText
            );
            break;
          case 'rewrite':
            if (params.rewritePrompt) {
              prompt = await replaceRewritePromptVariables(
                currentBook,
                currentChapter,
                quill.getText(),
                params.selectedText,
                params.rewritePrompt
              );
            } else {
              ElMessage.error('无法重新生成，缺少改写提示');
              return;
            }
            break;
        }
        
        // 创建包含提示词和占位AI回复的初始内容
        const initialContent = `用户: ${prompt}\n\nAI: 正在生成回复...`;

        // 更新片段窗口显示提示词和占位回复
        const title = params.type === 'expand' ? '扩写内容' :
                     params.type === 'condense' ? '缩写内容' : '改写内容';
        this.showStreamingFragment(initialContent, title, true, false, fragmentId);

        // 定义回调函数
        let content = '';
        const streamCallback = (text: string, error?: string, complete?: boolean) => {
          if (error) {
            ElMessage.error(`AI生成失败：${error}`);
            // 更新为错误消息
            const errorContent = `用户: ${prompt}\n\nAI: 生成失败，请重试`;
            this.showStreamingFragment(errorContent, title, false, true, fragmentId);
            return;
          }

          // 累积内容
          content += text;

          // 构建完整的对话内容：提示词 + AI回复
          const fullContent = `用户: ${prompt}\n\nAI: ${content}`;

          // 更新片段窗口内容
          this.showStreamingFragment(fullContent, title, false, complete || false, fragmentId);

          // 如果生成完成，清理任务
          if (complete) {
            this.cleanupGenerationTask(fragmentId);
          }
        };
        
        // 开始生成
        const response = await aiService.generateText(prompt, streamCallback);
        
        // 保存任务引用，以便可以取消
        if ('cancel' in response) {
          this.generationTasks.set(fragmentId, { abort: response.cancel });
        }
        
      } catch (error) {
        console.error('发送AI请求失败:', error);
        ElMessage.error('发送AI请求失败');
        
        // 更新状态
        fragment.isGenerating = false;
        fragment.wasStopped = true;
        
        // 更新片段窗口
        if (window.electronAPI) {
          try {
            await window.electronAPI.updateFragmentContent({
              ...fragment,
              isGenerating: false,
              wasStopped: true
            });
          } catch (err) {
            console.error('更新片段窗口失败:', err);
          }
        }
      }
    } else {
      ElMessage.error('重新生成需要指定片段ID');
    }
  }

  // 创建或更新流式片段窗口
  private async showStreamingFragment(content: string, baseTitle: string, isFirst: boolean = false, isComplete: boolean = false, fragmentId?: string): Promise<string> {
    // 如果提供了fragmentId且已存在，则更新该片段
    if (fragmentId && this.streamingFragments.has(fragmentId)) {
      const fragment = this.streamingFragments.get(fragmentId)!;
      fragment.content = content;
      fragment.title = baseTitle;
      fragment.updatedAt = new Date().toISOString();
      
      // 明确设置生成状态
      if (isComplete) {
        fragment.isGenerating = false;
        fragment.wasStopped = false;
      } else {
        fragment.isGenerating = true;
      }

      // 检查是否在Electron环境中
      if (window.electronAPI) {
        try {
          // 创建一个新对象发送，确保所有属性都被复制
          const updateData = {
            id: fragment.id,
            title: fragment.title,
            content: fragment.content,
            createdAt: fragment.createdAt,
            updatedAt: fragment.updatedAt,
            isGenerating: fragment.isGenerating,
            wasStopped: fragment.wasStopped,
            // 添加标记，表示这个片段有生成参数
            hasLastGenerationParams: this.lastGenerationParams.has(fragment.id)
          };
          
          await window.electronAPI.updateFragmentContent(updateData);
        } catch (error) {
          console.error('更新流式片段窗口失败:', error);
          // 如果更新失败，使用回退方案
          this.showFragmentCallback(content, baseTitle);
        }
      } else {
        // 不在Electron环境中，使用标准回调
        this.showFragmentCallback(content, baseTitle);
      }
      
      return fragment.id;
    } 
    // 否则创建新片段
    else {
      const newId = fragmentId || `streaming-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      
      const fragment: StreamingFragment = {
        id: newId,
        title: baseTitle,
        content: content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isGenerating: !isComplete,
        wasStopped: false
      };
      
      // 保存到片段Map中
      this.streamingFragments.set(fragment.id, fragment);

      // 检查是否在Electron环境中
      if (window.electronAPI) {
        try {
          // 直接使用electronAPI创建窗口，并添加标记表示这是AI生成的片段
          const fragmentWithMeta = {
            ...fragment,
            // 添加标记，表示这个片段有生成参数
            hasLastGenerationParams: this.lastGenerationParams.has(fragment.id)
          };
          
          await window.electronAPI.createFragmentWindow(fragmentWithMeta);
        } catch (error) {
          console.error('创建流式片段窗口失败:', error);
          ElMessage.error('创建片段窗口失败');
          // 如果创建窗口失败，使用回退方案
          this.showFragmentCallback(content, baseTitle);
        }
      } else {
        // 不在Electron环境中，使用标准回调
        this.showFragmentCallback(content, baseTitle);
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
      // 创建包含提示词和占位AI回复的初始内容
      const initialContent = `用户: ${prompt}\n\nAI: 正在生成扩写内容...`;

      // 显示包含提示词和占位回复的片段窗口或更新现有窗口
      const fragmentId = await this.showStreamingFragment(initialContent, '扩写内容', true, false, existingFragmentId);
      let content = '';

      // 保存生成参数用于重新生成
      const params = {
        type: 'expand' as const,
        selectedText,
        bookId: currentBook.id,
        chapterId: currentChapter?.id
      };

      this.lastGenerationParams.set(fragmentId, params);

      // 更新片段窗口，传递 hasLastGenerationParams 参数
      const fragment = this.streamingFragments.get(fragmentId);
      if (fragment && window.electronAPI) {
        try {
          await window.electronAPI.updateFragmentContent({
            ...fragment,
            hasLastGenerationParams: true
          });
        } catch (error) {
          console.error('更新片段窗口失败:', error);
        }
      }

      // 定义回调函数
      const streamCallback = (text: string, error?: string, complete?: boolean) => {
        if (error) {
          ElMessage.error(`AI扩写失败：${error}`);
          // 更新为错误消息
          const errorContent = `用户: ${prompt}\n\nAI: 扩写失败，请重试`;
          this.showStreamingFragment(errorContent, '扩写内容', false, true, fragmentId);
          return;
        }

        // 累积内容
        content += text;

        // 构建完整的对话内容：提示词 + AI回复
        const fullContent = `用户: ${prompt}\n\nAI: ${content}`;

        // 更新片段窗口内容
        this.showStreamingFragment(fullContent, '扩写内容', false, complete || false, fragmentId);

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

      // 创建包含提示词和占位AI回复的初始内容
      const initialContent = `用户: ${prompt}\n\nAI: 正在生成缩写内容...`;

      // 显示包含提示词和占位回复的片段窗口或更新现有窗口
      const fragmentId = await this.showStreamingFragment(initialContent, '缩写内容', true, false, existingFragmentId);
      let content = '';

      // 保存生成参数用于重新生成
      const params = {
        type: 'condense' as const,
        selectedText,
        bookId: currentBook.id,
        chapterId: currentChapter?.id
      };

      this.lastGenerationParams.set(fragmentId, params);

      // 更新片段窗口，传递 hasLastGenerationParams 参数
      const fragment = this.streamingFragments.get(fragmentId);
      if (fragment && window.electronAPI) {
        try {
          await window.electronAPI.updateFragmentContent({
            ...fragment,
            hasLastGenerationParams: true
          });
        } catch (error) {
          console.error('更新片段窗口失败:', error);
        }
      }

      // 定义回调函数
      const streamCallback = (text: string, error?: string, complete?: boolean) => {
        if (error) {
          ElMessage.error(`AI缩写失败：${error}`);
          // 更新为错误消息
          const errorContent = `用户: ${prompt}\n\nAI: 缩写失败，请重试`;
          this.showStreamingFragment(errorContent, '缩写内容', false, true, fragmentId);
          return;
        }

        // 累积内容
        content += text;

        // 构建完整的对话内容：提示词 + AI回复
        const fullContent = `用户: ${prompt}\n\nAI: ${content}`;

        // 更新片段窗口内容
        this.showStreamingFragment(fullContent, '缩写内容', false, complete || false, fragmentId);

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

        // 创建包含提示词和占位AI回复的初始内容
        const initialContent = `用户: ${prompt}\n\nAI: 正在生成改写内容...`;

        // 显示包含提示词和占位回复的片段窗口或更新现有窗口
        const fragmentId = await this.showStreamingFragment(initialContent, '改写内容', true, false, existingFragmentId);
        let content = '';

        // 保存生成参数用于重新生成
        const params = {
          type: 'rewrite' as const,
          selectedText,
          bookId: currentBook.id,
          chapterId: currentChapter?.id,
          rewritePrompt: rewriteContent
        };

        this.lastGenerationParams.set(fragmentId, params);

        // 更新片段窗口，传递 hasLastGenerationParams 参数
        const fragment = this.streamingFragments.get(fragmentId);
        if (fragment && window.electronAPI) {
          try {
            await window.electronAPI.updateFragmentContent({
              ...fragment,
              hasLastGenerationParams: true
            });
          } catch (error) {
            console.error('更新片段窗口失败:', error);
          }
        }

        // 定义回调函数
        const streamCallback = (text: string, error?: string, complete?: boolean) => {
          if (error) {
            ElMessage.error(`AI改写失败：${error}`);
            // 更新为错误消息
            const errorContent = `用户: ${prompt}\n\nAI: 改写失败，请重试`;
            this.showStreamingFragment(errorContent, '改写内容', false, true, fragmentId);
            return;
          }

          // 累积内容
          content += text;

          // 构建完整的对话内容：提示词 + AI回复
          const fullContent = `用户: ${prompt}\n\nAI: ${content}`;

          // 更新片段窗口内容
          this.showStreamingFragment(fullContent, '改写内容', false, complete || false, fragmentId);

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
      
      // 获取片段并更新状态
      const fragment = this.streamingFragments.get(fragmentId);
      if (fragment) {
        // 明确设置状态
        fragment.isGenerating = false;
        fragment.wasStopped = false;
        
        // 更新片段窗口
        if (window.electronAPI) {
          try {
            // 创建一个新对象发送，确保所有属性都被复制
            const updateData = {
              id: fragment.id,
              title: fragment.title,
              content: fragment.content,
              createdAt: fragment.createdAt,
              updatedAt: fragment.updatedAt,
              isGenerating: fragment.isGenerating,
              wasStopped: fragment.wasStopped
            };
            
            window.electronAPI.updateFragmentContent(updateData)
              .then(() => console.log(`窗口状态更新成功: ${fragmentId}`))
              .catch(error => console.error('更新片段窗口状态失败:', error));
          } catch (error) {
            console.error('更新片段窗口状态失败:', error);
          }
        }
      } else {
        console.log(`未找到片段: ${fragmentId}`);
      }
    } else {
      console.log(`未找到生成任务: ${fragmentId}`);
    }
  }
} 