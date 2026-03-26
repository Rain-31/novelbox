import { FileStorageService } from './fileStorageService';
import { WorkspaceService } from './workspaceservice';
import { WorkspaceError } from '../errors/workspaceError';
import { defaultBookNameAndDescPrompt, defaultSettingsPrompt, defaultOutlinePrompt, defaultChapterOutlinePrompt, defaultChapterPrompt, defaultContinuePrompt, defaultExpandPrompt, defaultAbbreviatePrompt, defaultRewriteAbbreviatePrompt, defaultUpdateSettingsPrompt, defaultFirstChapterPrompt, defaultSettingsJsonPrompt, defaultUpdateSettingsJsonPrompt } from '../constants';

type PromptConfig = {
  bookNameAndDesc: string;
  settings: string;
  settingsJson: string;
  outline: string;
  chapterOutline: string;
  chapter: string;
  firstChapter: string;
  continue: string;
  expand: string;
  abbreviate: string;
  rewrite: string;
  updateSettings: string;
  updateSettingsJson: string;
};

export class PromptConfigService {
  private static getConfigPath(): string {
    const workspacePath = WorkspaceService.getWorkspacePath();
    return `${workspacePath}\\config\\promptconfig.json`;
  }

  static async getPromptByName(name: keyof PromptConfig): Promise<string> {
    const config = await this.loadConfig();
    if (!(name in config)) {
      return '';
    }
    return config[name];
  }

  static async saveConfig(config: PromptConfig): Promise<void> {
    try {
      const configPath = this.getConfigPath();
      const configStr = JSON.stringify(config, null, 2);
      await FileStorageService.writeFile(configPath, configStr);
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      throw new Error(`保存提示词配置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  static async loadConfig(): Promise<PromptConfig> {
    try {
      const configPath = this.getConfigPath();
      const configStr = await FileStorageService.readFile(configPath);
      return JSON.parse(configStr) as PromptConfig;
    } catch (error) {
      if (error instanceof WorkspaceError) {
        throw error;
      }
      return {
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
        settingsJson: defaultSettingsJsonPrompt,
        updateSettingsJson: defaultUpdateSettingsJsonPrompt,
      };
    }
  }
}