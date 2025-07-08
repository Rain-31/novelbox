import { type Book, type Chapter } from './bookConfigService'
import { PromptConfigService } from './promptConfigService'
import * as DefaultPrompts from '../constants'

/**
 * 查找指定章节编号的前一章内容
 * @param chapters 章节数组
 * @param targetChapterNumber 目标章节编号
 * @returns 前一章内容
 */
export const findPreviousChapterContent = (chapters: Chapter[], targetChapterNumber: number): string => {
  let previousContent = ''
  const searchChapters = (chapters: Chapter[]) => {
    for (const chapter of chapters) {
      if (chapter.detailOutline && parseInt(chapter.detailOutline.chapterNumber) === targetChapterNumber - 1) {
        previousContent = chapter.content || ''
        return
      }
      if (chapter.children) {
        searchChapters(chapter.children)
      }
    }
  }
  searchChapters(chapters)
  return previousContent
}

/**
 * 替换提示词中的变量
 * @param book 当前书籍
 * @param chapterNumber 章节编号
 * @param detailContent 章节细纲内容
 * @returns 替换后的提示词
 */
export const replacePromptVariables = async (book: Book, chapterNumber: number, detailContent: string): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('chapterOutline') || DefaultPrompts.defaultChapterOutlinePrompt
    const content = `第${chapterNumber}章\n${detailContent}`
    const previousContent = findPreviousChapterContent(book.content || [], chapterNumber)

    return promptConfig
        .replace('${content}', content)
        .replace('${title}', book.title)
        .replace('${description}', book.description || '')
        .replace('${settings}', book.setting || '')
        .replace('${outline}', book.plot || '')
        .replace('${previous}', previousContent)
}

/**
 * 查找当前打开的章节
 * @param chapters 章节数组
 * @returns 当前打开的章节
 */
export const findCurrentChapter = (chapters: Chapter[]): Chapter | undefined => {
  for (const ch of chapters) {
    if (ch.type === 'chapter' && ch.content) return ch
    if (ch.children) {
      const found = findCurrentChapter(ch.children)
      if (found) return found
    }
  }
}

/**
 * 替换设定更新提示词中的变量
 * @param book 当前书籍
 * @param settings 设定内容
 * @returns 替换后的提示词
 */
export const replaceUpdateSettingsPromptVariables = async (book: Book, settings: string): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('updateSettings') || DefaultPrompts.defaultUpdateSettingsPrompt
    const currentChapter = findCurrentChapter(book.content || [])
    if (!currentChapter) {
        throw new Error('请先打开一个章节')
    }

    return promptConfig
        .replace('${title}', book.title)
        .replace('${description}', book.description || '')
        .replace('${settings}', settings)
        .replace('${chapter}', currentChapter.content || '')
}

/**
 * 替换设定提示词中的变量
 * @param book 当前书籍
 * @param content 设定内容
 * @returns 替换后的提示词
 */
export const replaceSettingsPromptVariables = async (book: Book, content: string): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('settings') || DefaultPrompts.defaultSettingsPrompt
    return promptConfig
        .replace('${content}', content)
        .replace('${title}', book.title)
        .replace('${description}', book.description || '')
}

/**
 * 替换大纲提示词中的变量
 * @param book 当前书籍
 * @param content 大纲内容
 * @returns 替换后的提示词
 */
export const replaceOutlinePromptVariables = async (book: Book, content: string): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('outline') || DefaultPrompts.defaultOutlinePrompt
    return promptConfig
        .replace('${content}', content)
        .replace('${title}', book.title)
        .replace('${description}', book.description || '')
        .replace('${settings}', book.setting || '')
}

/**
 * 替换扩写提示词中的变量
 * @param book 当前书籍
 * @param chapter 当前章节
 * @param chapterContent 章节内容
 * @param selectedText 选中的文本
 * @returns 替换后的提示词
 */
export const replaceExpandPromptVariables = async (book: Book, chapter: Chapter, chapterContent: string, selectedText: string): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('expand') || DefaultPrompts.defaultExpandPrompt
    return promptConfig
        .replace('${title}', book.title)
        .replace('${settings}', book.setting || '')
        .replace('${chapterOutline}', chapter.detailOutline?.detailContent || '')
        .replace('${chapter}', chapterContent)
        .replace('${content}', selectedText)
}

/**
 * 替换改写提示词中的变量
 * @param book 当前书籍
 * @param chapter 当前章节
 * @param chapterContent 章节内容
 * @param selectedText 选中的文本
 * @param rewriteContent 改写指导内容
 * @returns 替换后的提示词
 */
export const replaceRewritePromptVariables = async (book: Book, chapter: Chapter, chapterContent: string, selectedText: string, rewriteContent: string): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('rewrite') || DefaultPrompts.defaultRewriteAbbreviatePrompt
    const content = `${selectedText}\n改写指导：${rewriteContent}`
    return promptConfig
        .replace('${title}', book.title)
        .replace('${settings}', book.setting || '')
        .replace('${chapterOutline}', chapter.detailOutline?.detailContent || '')
        .replace('${chapter}', chapterContent)
        .replace('${content}', content)
}

/**
 * 替换缩写提示词中的变量
 * @param book 当前书籍
 * @param chapter 当前章节
 * @param chapterContent 章节内容
 * @param selectedText 选中的文本
 * @returns 替换后的提示词
 */
export const replaceAbbreviatePromptVariables = async (book: Book, chapter: Chapter, chapterContent: string, selectedText: string): Promise<string> => {
    if (!chapter.detailOutline?.detailContent) {
        throw new Error('请先编写本章细纲')
    }
    const promptConfig = await PromptConfigService.getPromptByName('abbreviate') || DefaultPrompts.defaultAbbreviatePrompt
    return promptConfig
        .replace('${title}', book.title)
        .replace('${settings}', book.setting || '')
        .replace('${chapterOutline}', chapter.detailOutline.detailContent)
        .replace('${chapter}', chapterContent)
        .replace('${content}', selectedText)
}

/**
 * 替换章节生成提示词中的变量
 * @param book 当前书籍
 * @param chapters 章节数组
 * @param currentChapterId 当前章节ID
 * @returns 替换后的提示词
 */
export const replaceChapterPromptVariables = async (book: Book, currentChapter: any): Promise<string> => {
    if (!currentChapter?.detailOutline?.detailContent) {
        throw new Error('请先编写本章细纲');
    }

    const promptConfig = await PromptConfigService.getPromptByName('chapter') || DefaultPrompts.defaultChapterPrompt;
    const chapterNumber = parseInt(currentChapter.detailOutline.chapterNumber);
    const previousContent = findPreviousChapterContent(book.content || [], chapterNumber);

    return promptConfig
        .replace('${title}', book.title)
        .replace('${description}', book.description || '')
        .replace('${settings}', book.setting || '')
        .replace('${outline}', book.plot || '')
        .replace('${chapterOutline}', currentChapter.detailOutline.detailContent || '')
        .replace('${previous}', previousContent);
}

/**
 * 替换续写提示词中的变量
 * @param book 当前书籍
 * @param chapter 当前章节
 * @param chapterContent 章节内容
 * @param continuePrompt 续写指导内容
 * @returns 替换后的提示词
 */
export const replaceContinuePromptVariables = async (book: Book, chapter: any, chapterContent: string, continuePrompt: string): Promise<string> => {
    if (!chapter?.detailOutline?.detailContent) {
        throw new Error('请先编写本章细纲');
    }

    const promptConfig = await PromptConfigService.getPromptByName('continue') || DefaultPrompts.defaultContinuePrompt;

    return promptConfig
        .replace('${title}', book.title)
        .replace('${description}', book.description || '')
        .replace('${settings}', book.setting || '')
        .replace('${outline}', book.plot || '')
        .replace('${chapterOutline}', chapter.detailOutline.detailContent || '')
        .replace('${chapter}', chapterContent)
        .replace('${content}', continuePrompt || '');
}

/**
 * 替换书名简介生成提示词中的变量
 * @param content 用户输入的内容
 * @returns 替换后的提示词
 */
export const replaceBookNameAndDescPromptVariables = async (content: string): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('bookNameAndDesc') || DefaultPrompts.defaultBookNameAndDescPrompt;
    return promptConfig.replace('${content}', content || '');
}

/**
 * 替换校对提示词中的变量
 * @param content 章节内容
 * @returns 替换后的提示词
 */
export const replaceProofreadPromptVariables = async (content: string): Promise<string> => {
    const promptConfig = DefaultPrompts.defaultProofreadPrompt;
    return promptConfig.replace('${content}', content);
}

/**
 * 替换首章生成提示词中的变量
 * @param book 当前书籍
 * @param currentChapter 当前章节
 * @returns 替换后的提示词
 */
export const replaceFirstChapterPromptVariables = async (book: Book, currentChapter: Chapter): Promise<string> => {
    const promptConfig = await PromptConfigService.getPromptByName('firstChapter') || DefaultPrompts.defaultFirstChapterPrompt;
    
    if (!currentChapter?.detailOutline?.detailContent) {
        throw new Error('请先编写本章细纲');
    }
    
    return promptConfig
        .replace('${title}', book.title)
        .replace('${description}', book.description || '')
        .replace('${settings}', book.setting || '')
        .replace('${outline}', book.plot || '')
        .replace('${chapterOutline}', currentChapter.detailOutline.detailContent || '');
}

/**
 * 将聊天消息转换为多轮对话格式
 * @param messages 聊天消息数组
 * @returns 转换后的多轮对话消息数组
 */
export const convertChatMessagesToMultiTurn = (messages: any[]): { role: 'user' | 'assistant' | 'system'; content: string }[] => {
    if (!messages || messages.length === 0) {
        return [];
    }

    return messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}