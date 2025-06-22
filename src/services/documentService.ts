import { type Book, type Chapter } from './bookConfigService';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { FileStorageService } from './fileStorageService';
import { htmlToText } from 'html-to-text';

export class DocumentService {
    private static instance: DocumentService;

    public static getInstance(): DocumentService {
        if (!DocumentService.instance) {
            DocumentService.instance = new DocumentService();
        }
        return DocumentService.instance;
    }

    private processChapter(chapter: Chapter, level: number = 1): Paragraph[] {
        const paragraphs: Paragraph[] = [];

        // 添加章节标题
        paragraphs.push(
            new Paragraph({
                text: chapter.title,
                heading: level <= 3 ? (level as unknown as typeof HeadingLevel[keyof typeof HeadingLevel]) : HeadingLevel.HEADING_3,
                spacing: { before: 400, after: 200 }
            })
        );

        // 添加章节内容
        if (chapter.content) {
            // 将HTML内容转换为纯文本，保留缩进和空行
            const plainText = htmlToText(chapter.content, {
                wordwrap: false,
                preserveNewlines: true,
                selectors: [
                    { selector: 'p', options: { leadingLineBreaks: 2, trailingLineBreaks: 2 } },
                    { selector: 'br', format: 'lineBreak' }
                ]
            });
            
            // 分割文本为段落，保留空行
            const contentParagraphs = plainText.split('\n');
            let emptyLineCount = 0;
            
            contentParagraphs.forEach(p => {
                // 检查是否为空行
                if (p.trim() === '') {
                    emptyLineCount++;
                    // 只添加一个空行段落，避免多个连续空行
                    if (emptyLineCount === 1) {
                        paragraphs.push(
                            new Paragraph({
                                children: [new TextRun({ text: '', size: 24 })],
                                spacing: { before: 200, after: 200 }
                            })
                        );
                    }
                } else {
                    emptyLineCount = 0;
                    
                    // 检查是否有全角空格缩进（编辑器使用的是全角空格）
                    const fullWidthIndent = p.match(/^(　+)/);
                    // 检查是否有普通空格缩进
                    const normalIndent = p.match(/^( +)/);
                    
                    let indentLevel = 0;
                    let textContent = p;
                    
                    if (fullWidthIndent) {
                        // 全角空格缩进，每个全角空格算一级缩进
                        indentLevel = fullWidthIndent[0].length;
                        textContent = p.substring(fullWidthIndent[0].length);
                    } else if (normalIndent) {
                        // 普通空格缩进，每两个空格算一级缩进
                        indentLevel = Math.floor(normalIndent[0].length / 2);
                        textContent = p.substring(normalIndent[0].length);
                    }
                    
                    paragraphs.push(
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: textContent,
                                    size: 24
                                })
                            ],
                            spacing: { before: 200, after: 200 },
                            indent: indentLevel > 0 ? { firstLine: indentLevel * 240 } : undefined
                        })
                    );
                }
            });
        }

        // 处理子章节
        if (chapter.children) {
            chapter.children.forEach(child => {
                paragraphs.push(...this.processChapter(child, level + 1));
            });
        }

        return paragraphs;
    }

    public async exportToWord(book: Book, filePath: string): Promise<string> {
        try {
            const doc = new Document({
                sections: [
                    {
                        properties: {},
                        children: [
                            // 添加书名
                            new Paragraph({
                                text: book.title,
                                heading: HeadingLevel.TITLE,
                                spacing: { before: 400, after: 400 }
                            }),
                            // 添加简介
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: book.description || '',
                                        size: 24,
                                        italics: true
                                    })
                                ],
                                spacing: { before: 200, after: 400 }
                            }),
                            // 处理所有章节
                            ...(book.content || []).flatMap(chapter => 
                                this.processChapter(chapter)
                            )
                        ]
                    }
                ]
            });

            // 生成文档
            const buffer = await Packer.toBlob(doc);

            // 保存文件
            await FileStorageService.writeBlobFile(filePath, buffer);

            return filePath;
        } catch (error) {
            console.error('导出Word文档失败:', error);
            throw new Error('导出Word文档失败:' + error);
        }
    }
}