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

  private async generateWithOpenAI(prompt: string, stream?: StreamCallback, signal?: AbortSignal): Promise<string> {
    if (!this.openaiClient) throw new Error('AI client not initialized');
    
    const { temperature, maxTokens, topP } = this.getModelConfig();

    if (stream) {
      const response = await this.openaiClient.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
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
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP
      });
      return response.choices[0]?.message?.content || '';
    }
  }

  private async generateWithAnthropic(prompt: string, stream?: StreamCallback, signal?: AbortSignal): Promise<string> {
    if (!this.anthropicClient) throw new Error('Anthropic client not initialized');

    const { temperature, maxTokens, topP } = this.getModelConfig();

    if (stream) {
      const response = this.anthropicClient.messages.stream({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
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
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP
      });
      return response.content[0]?.type === 'text' ? response.content[0].text : '';
    }
  }

  private async generateWithGemini(prompt: string, stream?: StreamCallback, signal?: AbortSignal): Promise<string> {
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

    if (stream) {
      const response = await model.generateContentStream(prompt, { signal });
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
      const response = await model.generateContent(prompt);
      const result = await response.response;
      return result.text();
    }
  }

  private async generateWithDeepseek(prompt: string, stream?: StreamCallback, signal?: AbortSignal): Promise<string> {
    if (!this.deepseekClient) throw new Error('AI client not initialized');

    const { temperature, maxTokens, topP } = this.getModelConfig();

    if (stream) {
      const response = await this.deepseekClient.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
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
      const response = await this.deepseekClient.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: prompt }],
        temperature: temperature,
        max_tokens: maxTokens,
        top_p: topP
      });
      return response.choices[0]?.message?.content || '';
    }
  }

  private async generateWithMiniMax(prompt: string, stream?: StreamCallback, signal?: AbortSignal): Promise<string> {
    if (!this.minimaxApiKey) throw new Error('MiniMax API key not initialized');
    
    const { temperature, maxTokens, topP } = this.getModelConfig();
    const baseURL = `${this.minimaxBaseUrl}/chat/completions`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.minimaxApiKey}`
    };

    const requestBody = {
      model: this.config.model,
      messages: [{ role: 'user', content: prompt }],
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
                fullText += content;
                stream(content);
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

  private async generateWithCustomProvider(prompt: string, stream?: StreamCallback, signal?: AbortSignal): Promise<string> {
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

    if (stream) {
      try {
        const response = await fetch(baseURL, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: this.config.model,
            messages: [{ role: 'user', content: prompt }],
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
          messages: [{ role: 'user', content: prompt }],
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

  async generateText(prompt: string, stream?: StreamCallback): Promise<AIResponse | StreamAIResponse> {
    const abortController = new AbortController();
    let aborted = false;

    try {
      if (stream) {
        const streamProcess = (async () => {
          try {
            switch (this.config.provider) {
              case 'openai':
                await this.generateWithOpenAI(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal);
                break;
              case 'anthropic':
                await this.generateWithAnthropic(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal);
                break;
              case 'gemini':
                await this.generateWithGemini(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal);
                break;
              case 'deepseek':
                await this.generateWithDeepseek(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal);
                break;
              case 'minimax':
                await this.generateWithMiniMax(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal);
                break;
              default:
                // 使用自定义服务商
                await this.generateWithCustomProvider(prompt, (text, error) => {
                  if (aborted) return;
                  stream(text, error);
                }, abortController.signal);
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
          text = await this.generateWithOpenAI(prompt);
          break;
        case 'anthropic':
          text = await this.generateWithAnthropic(prompt);
          break;
        case 'gemini':
          text = await this.generateWithGemini(prompt);
          break;
        case 'deepseek':
          text = await this.generateWithDeepseek(prompt);
          break;
        case 'minimax':
          text = await this.generateWithMiniMax(prompt);
          break;
        default:
          text = await this.generateWithCustomProvider(prompt);
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