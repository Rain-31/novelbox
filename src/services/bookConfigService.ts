import { FileStorageService } from './fileStorageService';
import { WorkspaceService } from './workspaceservice';
import { WorkspaceError } from '../errors/workspaceError';

export interface Chapter {
  id: string;
  title: string;
  type: 'volume' | 'chapter';
  detailOutline: {
    chapterNumber: string;
    detailContent: string;
  };
  content?: string;
  children?: Chapter[];
}

export interface Fragment {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface Book {
  id: string;
  title: string;
  description: string;
  setting: string;
  plot: string;
  content: Chapter[];
  fragments?: Fragment[];
  lastEdited: Date;
}

export class BookConfigService {
  private static getBooksDir(): string {
    const workspacePath = WorkspaceService.getWorkspacePath();
    return `${workspacePath}\\books`;
  }

  private static getBookPath(bookId: string): string {
    return `${this.getBooksDir()}\\${bookId}.json`;
  }

  static async saveBook(book: Book): Promise<void> {
    try {
      const bookPath = this.getBookPath(book.id);
      const bookData = {
        ...book,
        lastEdited: book.lastEdited.toISOString()
      };
      const bookStr = JSON.stringify(bookData, null, 2);
      await FileStorageService.writeFile(bookPath, bookStr);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new Error(`保存书籍失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async getBook(bookId: string): Promise<Book | null> {
    try {
      const bookPath = this.getBookPath(bookId);
      const bookStr = await FileStorageService.readFile(bookPath);
      const bookData = JSON.parse(bookStr);
      return {
        ...bookData,
        lastEdited: new Date(bookData.lastEdited)
      };
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      return null;
    }
  }

  static async listBooks(): Promise<Book[]> {
    try {
      const booksDir = this.getBooksDir();
      const files = await FileStorageService.listFiles(booksDir);
      const bookFiles = files.filter(file => file.name.endsWith('.json'));
      
      const books: Book[] = [];
      for (const file of bookFiles) {
        const bookId = file.name.replace('.json', '');
        const book = await this.getBook(bookId);
        if (book) {
          books.push(book);
        }
      }
      return books;
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      return [];
    }
  }

  static async deleteBook(bookId: string): Promise<void> {
    try {
      const bookPath = this.getBookPath(bookId);
      await FileStorageService.deleteFile(bookPath);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new Error(`删除书籍失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}