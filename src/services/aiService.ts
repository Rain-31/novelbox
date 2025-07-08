import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AxiosError } from 'axios';
import axios from 'axios';
import { ProviderConfig } from './aiConfigService';


interface AIResponse {
  text: string;
  error?: string;
}

type StreamCallback = (text: string, error?: string, complete?: boolean) => void;

interface StreamAIResponse {
  cancel: () => void;
  error?: string;
  text?: string;
}

// 定义消息类型
export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// 为Anthropic定义兼容的消息类型
type AnthropicMessageRole = 'user' | 'assistant';
interface AnthropicMessage {
  role: AnthropicMessageRole;
  content: string;
}

class AIService {
  private config: ProviderConfig;
  private openaiClient?: OpenAI;
  private anthropicClient?: Anthropic;
  private geminiClient?: GoogleGenerativeAI;
  private deepseekClient?: OpenAI;
  private minimaxClient?: OpenAI;
  private minimaxApiKey?: string;
  private minimaxBaseUrl: string = 'https://api.minimaxi.com/v1';

  constructor(config: ProviderConfig) {
    this.config = config;

    // 设置代理
    const useSystemProxy = localStorage.getItem('useSystemProxy');
    // 如果useSystemProxy未设置或为'true'，则使用系统代理
    if (useSystemProxy !== 'false') {
      window.electronAPI.setProxy({ http_proxy: 'system' });
    } else if (config.proxyUrl) {
      // 如果明确禁用系统代理但AI配置中有代理URL，使用AI配置的代理
      window.electronAPI.setProxy({ http_proxy: config.proxyUrl });
    } else {
      // 都没有设置，则不使用代理
      window.electronAPI.removeProxy();
    }

    switch (this.config.provider) {
      case 'openai':
        this.openaiClient = new OpenAI({
          apiKey: config.apiKey,
          baseURL: 'https://api.openai.com/v1',
          dangerouslyAllowBrowser: true,
        });
        break;
      case 'anthropic':
        this.anthropicClient = new Anthropic({
          apiKey: config.apiKey,
          baseURL: 'https://api.anthropic.com',
          dangerouslyAllowBrowser: true,
        });
        break;
      case 'gemini':
        this.geminiClient = new GoogleGenerativeAI(config.apiKey);
        break;
      case 'deepseek':
        this.deepseekClient = new OpenAI({
          apiKey: config.apiKey,
          baseURL: 'https://api.deepseek.com',
          dangerouslyAllowBrowser: true,
        });
        break;
      case 'minimax':
        // 不使用OpenAI SDK，而是保存API密钥用于自定义实现
        this.minimaxApiKey = config.apiKey;
        break;
      default:
        // 自定义服务商不需要初始化SDK客户端
        break;
    }
  }

  // 获取当前模型的配置
  private getModelConfig() {
    const modelConfig = this.config.modelConfigs?.[this.config.model];
    return {
      temperature: modelConfig?.temperature ?? 0.7,
      maxTokens: modelConfig?.maxTokens ?? 25000,
      topP: modelConfig?.topP ?? 0.95
    };
  }

  private async generateWithOpenAI(prompt: string, stream?: StreamCallback, signal?: AbortSignal, messages?: ChatMessage[]): Promise<string> {
    if (!this.openaiClient) throw new Error('AI client not initialized');

    const { temperature, maxTokens, topP } = this.getModelConfig();

    // 如果提供了messages，使用它们；否则创建单一用户消息
    const chatMessages = messages || [{ role: 'user', content: prompt }];

    if (stream) {
      const response = await this.openaiClient.chat.completions.create({
        model: this.config.model,
        messages: chatMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stream: true
      }, { signal: signal });

      let fullText = '';
      try {
        for await (const chunk of response) {
          if (signal?.aborted) break;
          const content = chunk.choices[0]?.delta?.content || '';
          fullText += content;
          stream(content);
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          stream('', '已中止生成');
          return fullText;
        } else if (error instanceof Error) {
          stream('', error.message);
        }
      } finally {
        if (!signal?.aborted) {
          stream('', undefined, true);
        }
      }
      return fullText;
    } else {
      const response = await this.openaiClient.chat.completions.create({
        model: this.config.model,
        messages: chatMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP
      });
      return response.choices[0]?.message?.content || '';
    }
  }

  private async generateWithAnthropic(prompt: string, stream?: StreamCallback, signal?: AbortSignal, messages?: ChatMessage[]): Promise<string> {
    if (!this.anthropicClient) throw new Error('Anthropic client not initialized');

    const { temperature, maxTokens, topP } = this.getModelConfig();

    // Anthropic只支持user和assistant角色，需要处理system消息
    let processedMessages;

    if (messages) {
      // 过滤出system消息
      const systemMessages = messages.filter(msg => msg.role === 'system');
      // 过滤出非system消息
      const nonSystemMessages = messages.filter(msg => msg.role !== 'system');

      // 如果有system消息，将其内容添加到第一条user消息前面
      if (systemMessages.length > 0) {
        const systemContent = systemMessages.map(msg => msg.content).join('\n\n');

        // 找到第一条user消息
        const firstUserIndex = nonSystemMessages.findIndex(msg => msg.role === 'user');

        if (firstUserIndex !== -1) {
          // 将system内容添加到第一条user消息前
          nonSystemMessages[firstUserIndex] = {
            ...nonSystemMessages[firstUserIndex],
            content: `${systemContent}\n\n${nonSystemMessages[firstUserIndex].content}`
          };
        } else {
          // 如果没有user消息，创建一个
          nonSystemMessages.unshift({
            role: 'user',
            content: systemContent
          });
        }
      }

      // 转换为Anthropic兼容的消息格式
      processedMessages = nonSystemMessages
        .filter(msg => msg.role === 'user' || msg.role === 'assistant')
        .map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }));
    } else {
      processedMessages = [{ role: 'user', content: prompt }];
    }

    if (stream) {
      const response = this.anthropicClient.messages.stream({
        model: this.config.model,
        messages: processedMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP
      }, { signal: signal });

      let fullText = '';
      try {
        response.on('text', (text) => {
          if (signal?.aborted) {
            response.controller.abort();
            return;
          }
          fullText += text;
          stream(text);
        });

        await response.finalMessage();
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          stream('', '已中止生成');
          return fullText;
        } else if (error instanceof Error) {
          stream('', error.message);
        }
      } finally {
        if (!signal?.aborted) {
          stream('', undefined, true);
        }
      }
      return fullText;
    } else {
      const response = await this.anthropicClient.messages.create({
        model: this.config.model,
        messages: processedMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP
      });
      return response.content[0]?.type === 'text' ? response.content[0].text : '';
    }
  }

  private async generateWithGemini(prompt: string, stream?: StreamCallback, signal?: AbortSignal, messages?: ChatMessage[]): Promise<string> {
    if (!this.geminiClient) throw new Error('Gemini client not initialized');

    const { temperature, maxTokens, topP } = this.getModelConfig();

    const model = this.geminiClient.getGenerativeModel({
      model: this.config.model,
      generationConfig: {
        temperature: temperature,
        maxOutputTokens: maxTokens,
        topP: topP
      }
    });

    try {
      // 统一处理单轮和多轮对话
      // 如果有messages参数，使用它；否则创建单个用户消息
      const chatMessages = messages || [{ role: 'user', content: prompt }];

      // 处理系统消息
      // 提取系统消息
      const systemMessages = chatMessages.filter(msg => msg.role === 'system');
      // 过滤出非系统消息
      const nonSystemMessages = chatMessages.filter(msg => msg.role !== 'system');

      // 系统指令内容
      let systemInstruction = '';
      if (systemMessages.length > 0) {
        systemInstruction = systemMessages.map(msg => msg.content).join('\n\n');
      }

      // 将ChatMessage格式转换为Gemini的聊天格式
      // Gemini API使用'user'和'model'作为角色，而不是'user'和'assistant'
      const geminiMessages = nonSystemMessages.map(msg => {
        // 创建适用于Gemini API的角色
        const geminiRole = msg.role === 'assistant' ? 'model' : 'user';

        return {
          role: geminiRole as any, // 使用类型断言解决类型不匹配问题
          parts: [{ text: msg.content }]
        };
      });

      // 创建聊天会话
      let history = geminiMessages.slice(0, -1); // 不包括最后一条消息
      
      // 确保历史记录中的第一条消息是用户角色
      if (history.length > 0 && history[0].role !== 'user') {
        // 如果第一条是模型消息，需要调整顺序或添加一个用户消息
        console.log('调整聊天历史：第一条消息必须是用户角色');
        
        // 方法1：如果只有一条模型消息，则不使用历史
        if (history.length === 1) {
          history = [];
        } 
        // 方法2：如果有多条消息，尝试重新排序，确保用户消息在前
        else {
          const userMessages = history.filter(msg => msg.role === 'user');
          const modelMessages = history.filter(msg => msg.role === 'model');
          
          if (userMessages.length > 0) {
            // 重新排序，确保用户消息在前
            history = [];
            for (let i = 0; i < Math.max(userMessages.length, modelMessages.length); i++) {
              if (i < userMessages.length) history.push(userMessages[i]);
              if (i < modelMessages.length) history.push(modelMessages[i]);
            }
          } else {
            // 如果没有用户消息，则不使用历史
            history = [];
          }
        }
      }
      
      const chatOptions: any = {
        history: history
      };

      // 如果有系统指令，添加到聊天选项中
      if (systemInstruction) {
        chatOptions.systemInstruction = systemInstruction;
      }

      const chatSession = model.startChat(chatOptions);

      // 获取最后一条消息
      const lastMessage = nonSystemMessages.length > 0
        ? nonSystemMessages[nonSystemMessages.length - 1]
        : { role: 'user', content: prompt };

      if (stream) {
        const response = await chatSession.sendMessageStream(lastMessage.content, { signal });
        let fullText = '';
        try {
          for await (const chunk of response.stream) {
            if (signal?.aborted) {
              break;
            }
            const content = chunk.text();
            fullText += content;
            stream(content);
          }
        } catch (error) {
          if (error instanceof Error && error.name === 'AbortError') {
            stream('', '已中止生成');
            return fullText;
          } else {
            stream('', error instanceof Error ? error.message : 'Stream error');
          }
        } finally {
          if (!signal?.aborted) {
            stream('', undefined, true);
          }
        }
        return fullText;
      } else {
        const response = await chatSession.sendMessage(lastMessage.content);
        return response.response.text();
      }
    } catch (error) {
      console.error('Gemini API错误:', error);

      if (error instanceof Error && error.name === 'AbortError') {
        stream('', '已中止生成');
        return '';
      } else {
        stream('', error instanceof Error ? error.message : 'Stream error');
      }
    } finally {
      if (!signal?.aborted) {
        stream('', undefined, true);
      }
    }
    return '';
  }

  private async generateWithDeepseek(prompt: string, stream?: StreamCallback, signal?: AbortSignal, messages?: ChatMessage[]): Promise<string> {
    if (!this.deepseekClient) throw new Error('AI client not initialized');

    const { temperature, maxTokens, topP } = this.getModelConfig();

    // 如果提供了messages，使用它们；否则创建单一用户消息
    const chatMessages = messages || [{ role: 'user', content: prompt }];

    if (stream) {
      const response = await this.deepseekClient.chat.completions.create({
        model: this.config.model,
        messages: chatMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP,
        stream: true
      }, { signal: signal });

      let fullText = '';
      try {
        for await (const chunk of response) {
          if (signal?.aborted) break;
          const content = chunk.choices[0]?.delta?.content || '';
          if (content) {
            fullText += content;
            stream(content);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          stream('', '已中止生成');
          return fullText;
        } else if (error instanceof Error) {
          stream('', error.message);
        }
      } finally {
        if (!signal?.aborted) {
          stream('', undefined, true);
        }
      }
      return fullText;
    } else {
      const response = await this.deepseekClient.chat.completions.create({
        model: this.config.model,
        messages: chatMessages,
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP
      });
      return response.choices[0]?.message?.content || '';
    }
  }

  private async generateWithMiniMax(prompt: string, stream?: StreamCallback, signal?: AbortSignal, messages?: ChatMessage[]): Promise<string> {
    if (!this.minimaxApiKey) throw new Error('MiniMax API key not initialized');

    const { temperature, maxTokens, topP } = this.getModelConfig();
    const baseURL = `${this.minimaxBaseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.minimaxApiKey}`
    };

    // 如果提供了messages，使用它们；否则创建单一用户消息
    const chatMessages = messages || [{ role: 'user', content: prompt }];

    const requestBody = {
      model: this.config.model,
      messages: chatMessages,
      temperature: temperature,
      max_tokens: maxTokens,
      top_p: topP
    };

    if (stream) {
      try {
        const response = await fetch(baseURL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            ...requestBody,
            stream: true
          }),
          signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP错误! 状态码: ${response.status}`;

          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.base_resp?.status_msg) {
              errorMessage += ` - ${errorJson.base_resp.status_msg}`;
            } else if (errorJson.error?.message) {
              errorMessage += ` - ${errorJson.error.message}`;
            } else {
              errorMessage += ` - ${errorText}`;
            }
          } catch {
            errorMessage += ` - ${errorText}`;
          }

          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is null');
        }

        let fullText = '';
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done || signal?.aborted) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                // 检查MiniMax特定的错误格式
                if (parsed.base_resp && parsed.base_resp.status_code !== 0) {
                  throw new Error(`MiniMax错误: ${parsed.base_resp.status_msg || parsed.base_resp.status_code}`);
                }

                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullText += content;
                  stream(content);
                }
              } catch (e) {
                console.error('解析响应数据失败:', e);
                if (e instanceof Error) {
                  stream('', e.message);
                }
              }
            }
          }
        }

        if (!signal?.aborted) {
          stream('', undefined, true);
        }
        return fullText;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          stream('', '已中止生成');
          return '';
        }
        if (error instanceof Error) {
          stream('', error.message);
        }
        throw error;
      }
    } else {
      try {
        const response = await axios.post(baseURL, requestBody, {
          headers,
          signal
        });

        // 检查MiniMax特定的错误格式
        if (response.data.base_resp && response.data.base_resp.status_code !== 0) {
          throw new Error(`MiniMax错误: ${response.data.base_resp.status_msg || response.data.base_resp.status_code}`);
        }

        // 检查是否有choices并且不为空
        if (!response.data.choices || response.data.choices.length === 0) {
          // 尝试从不同的响应格式获取内容
          if (response.data.reply) {
            return response.data.reply;
          }
          throw new Error('MiniMax API返回的响应中没有找到生成的内容');
        }

        return response.data.choices[0]?.message?.content || '';
      } catch (error) {
        if (error instanceof AxiosError) {
          const errorData = error.response?.data;
          if (errorData) {
            let errorMessage = `API错误: ${error.response?.status}`;
            if (errorData.base_resp?.status_msg) {
              errorMessage += ` - ${errorData.base_resp.status_msg}`;
            } else if (errorData.error?.message) {
              errorMessage += ` - ${errorData.error.message}`;
            } else {
              errorMessage += ` - ${JSON.stringify(errorData)}`;
            }
            throw new Error(errorMessage);
          }
        }
        throw error;
      }
    }
  }

  private async generateWithCustomProvider(prompt: string, stream?: StreamCallback, signal?: AbortSignal, messages?: ChatMessage[]): Promise<string> {
    const customProvider = this.config.customProviders?.find(p => p.name === this.config.provider);
    if (!customProvider) {
      throw new Error('自定义服务商配置未找到');
    }

    const { temperature, maxTokens, topP } = this.getModelConfig();

    // 处理域名前缀
    const domain = customProvider.apiDomain.startsWith('http://') || customProvider.apiDomain.startsWith('https://')
      ? customProvider.apiDomain
      : `https://${customProvider.apiDomain}`;

    // 处理API路径
    const path = customProvider.apiPath.startsWith('/')
      ? customProvider.apiPath
      : `/${customProvider.apiPath}`;

    const baseURL = `${domain}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json'
    };

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // 如果提供了messages，使用它们；否则创建单一用户消息
    const chatMessages = messages || [{ role: 'user', content: prompt }];

    if (stream) {
      try {
        const response = await fetch(baseURL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.config.model,
            messages: chatMessages,
            temperature: temperature,
            max_tokens: maxTokens,
            top_p: topP,
            stream: true
          }),
          signal
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP错误! 状态码: ${response.status}`;

          try {
            const errorJson = JSON.parse(errorText);
            if (errorJson.error?.message) {
              errorMessage += ` - ${errorJson.error.message}`;
            } else {
              errorMessage += ` - ${errorText}`;
            }
          } catch {
            errorMessage += ` - ${errorText}`;
          }

          throw new Error(errorMessage);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Response body is null');
        }

        let fullText = '';
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done || signal?.aborted) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n').filter(line => line.trim() !== '');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices[0]?.delta?.content || '';
                fullText += content;
                stream(content);
              } catch (e) {
                console.error('解析响应数据失败:', e);
              }
            }
          }
        }

        return fullText;
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          stream('', '已中止生成');
          return '';
        }
        throw error;
      }
    } else {
      try {
        const response = await axios.post(baseURL, {
          model: this.config.model,
          messages: chatMessages,
          temperature: temperature,
          max_tokens: maxTokens,
          top_p: topP
        }, {
          headers,
          signal
        });

        return response.data.choices[0]?.message?.content || '';
      } catch (error) {
        if (error instanceof AxiosError) {
          const errorData = error.response?.data;
          if (errorData) {
            let errorMessage = `API错误: ${error.response?.status}`;
            if (errorData.error?.message) {
              errorMessage += ` - ${errorData.error.message}`;
            } else {
              errorMessage += ` - ${JSON.stringify(errorData)}`;
            }
            throw new Error(errorMessage);
          }
        }
        throw error;
      }
    }
  }

  async generateText(promptOrMessages: string | ChatMessage[], stream?: StreamCallback): Promise<AIResponse | StreamAIResponse> {
    const abortController = new AbortController();
    let aborted = false;
    
    // 判断是字符串还是消息数组
    const isMessagesArray = Array.isArray(promptOrMessages);
    const prompt = isMessagesArray ? '' : promptOrMessages;
    const messages = isMessagesArray ? promptOrMessages : undefined;

    try {
      if (stream) {
        const streamProcess = (async () => {
          try {
            switch (this.config.provider) {
              case 'openai':
                await this.generateWithOpenAI(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal, messages);
                break;
              case 'anthropic':
                await this.generateWithAnthropic(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal, messages);
                break;
              case 'gemini':
                await this.generateWithGemini(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal, messages);
                break;
              case 'deepseek':
                await this.generateWithDeepseek(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal, messages);
                break;
              case 'minimax':
                await this.generateWithMiniMax(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal, messages);
                break;
              default:
                // 使用自定义服务商
                await this.generateWithCustomProvider(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal, messages);
            }
            stream('', undefined, true);
          } catch (error) {
            console.error('AI生成失败:', error);
            if (!aborted) stream('', error instanceof Error ? error.message : 'Request failed');
          }
        })();

        return {
          cancel: () => {
            aborted = true;
            abortController.abort();
            stream('', '已中止生成', true);
          }
        };
      }

      let text: string;
      switch (this.config.provider) {
        case 'openai':
          text = await this.generateWithOpenAI(prompt, undefined, undefined, messages);
          break;
        case 'anthropic':
          text = await this.generateWithAnthropic(prompt, undefined, undefined, messages);
          break;
        case 'gemini':
          text = await this.generateWithGemini(prompt, undefined, undefined, messages);
          break;
        case 'deepseek':
          text = await this.generateWithDeepseek(prompt, undefined, undefined, messages);
          break;
        case 'minimax':
          text = await this.generateWithMiniMax(prompt, undefined, undefined, messages);
          break;
        default:
          text = await this.generateWithCustomProvider(prompt, undefined, undefined, messages);
      }

      console.log('生成的文本:', text);

      if (!text) {
        throw new Error('AI返回数据格式错误');
      }

      return { text };
    } catch (error) {
      console.error('AI生成失败:', error);

      let errorMessage = '生成失败';
      if (error instanceof AxiosError && error.response?.data?.error?.message) {
        errorMessage = `API错误: ${error.response.data.error.message}`;
      } else if (error instanceof Error) {
        errorMessage = `请求错误: ${error.message}`;
      }

      return {
        text: '',
        error: errorMessage
      };
    }
  }
}

export default AIService;