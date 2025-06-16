/**
 * 与主进程通信的API定义
 */
interface ElectronAPI {
  saveFileAs: (defaultPath: string) => Promise<{ canceled: boolean, filePath: string | undefined }>;
  onWorkspaceChanged: (callback: (workspacePath: string) => void) => void;
  
  setProxy: (config: { http_proxy: string }) => void;
  removeProxy: () => void;
  
  // 设置相关
  onOpenSettings: (callback: () => void) => void;
  changeWorkspace: (fromSettings?: boolean) => Promise<{ success: boolean, path?: string, error?: {message: string, code: string} }>;
  onTriggerChangeWorkspace: (callback: () => void) => void;
  
  // 应用操作
  minimizeWindow: () => void;
  maximizeWindow: () => void;
  closeWindow: () => void;
  
  // AI配置
  onOpenAISettings: (callback: () => void) => void;
  getVersion: () => Promise<string>;
  onOpenAboutPage: (callback: () => void) => void;
  
  // 系统操作
  openExternal: (url: string) => void;
  
  // 片段编辑窗口操作
  createFragmentWindow: (fragment: any) => Promise<{ success: boolean, message: string, error?: {message: string, code: string} }>;
  closeFragmentWindow: (fragmentId: string) => void;
  minimizeFragmentWindow: (fragmentId: string) => void;
  saveFragmentContent: (fragment: any) => Promise<{ success: boolean, message: string, error?: {message: string, code: string} }>;
  onFragmentSaved: (callback: (fragment: any) => void) => void;
  onFragmentData: (callback: (fragment: any) => void) => void;
  startDrag: () => void;
  closeCurrentWindow: () => void;
  
  // 新增：通知主进程渲染进程已准备好接收片段数据
  requestFragmentData: (windowId: number) => Promise<{ success: boolean, message: string, error?: {message: string, code: string} }>;
  
  // 新增：获取当前窗口ID
  getCurrentWindowId: () => Promise<{ success: boolean, id?: number, message?: string }>;
}

interface Window {
  electronAPI: ElectronAPI;
  electron: {
    ipcRenderer: {
      invoke(channel: string, ...args: any[]): Promise<any>
    }
  };
} 