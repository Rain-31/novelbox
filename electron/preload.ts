import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  ipcRenderer: {
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
  }
});

contextBridge.exposeInMainWorld('electronAPI', {
  saveFileAs: (defaultPath: string) => ipcRenderer.invoke('save-file-as', defaultPath),
  onWorkspaceChanged: (callback: (workspacePath: string) => void) => ipcRenderer.on('workspace-changed', (_event, workspacePath) => callback(workspacePath)),
  
  setProxy: (config: { http_proxy: string }) => ipcRenderer.send('set_proxy', config),
  removeProxy: () => ipcRenderer.send('remove_proxy'),

  // 设置相关
  onOpenSettings: (callback: () => void) => ipcRenderer.on('open-settings', () => callback()),
  changeWorkspace: (fromSettings = false) => ipcRenderer.invoke('change-workspace', fromSettings),
  onTriggerChangeWorkspace: (callback: () => void) => ipcRenderer.on('trigger-change-workspace', () => callback()),

  // 应用操作
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // AI配置
  onOpenAISettings: (callback: () => void) => ipcRenderer.on('open-ai-settings', () => callback()),
  getVersion: () => ipcRenderer.invoke('get-version'),
  onOpenAboutPage: (callback: () => void) => ipcRenderer.on('open-about-page', () => callback()),
  
  // 系统操作
  openExternal: (url: string) => ipcRenderer.send('open-external', url),
  
  // 片段编辑窗口操作
  createFragmentWindow: (fragment: any) => ipcRenderer.invoke('create-fragment-window', fragment),
  closeFragmentWindow: (fragmentId: string) => ipcRenderer.send('close-fragment-window', fragmentId),
  minimizeFragmentWindow: (fragmentId: string) => ipcRenderer.send('minimize-fragment-window', fragmentId),
  saveFragmentContent: (fragment: any) => ipcRenderer.invoke('save-fragment-content', fragment),
  onFragmentSaved: (callback: (fragment: any) => void) => ipcRenderer.on('fragment-saved', (_event, fragment) => callback(fragment)),
  onFragmentData: (callback: (fragment: any) => void) => ipcRenderer.on('fragment-data', (_event, fragment) => callback(fragment)),
  startDrag: () => ipcRenderer.send('window-drag'),
  closeCurrentWindow: () => ipcRenderer.send('close-current-window'),
  
  // 新增：通知主进程渲染进程已准备好接收片段数据
  requestFragmentData: (windowId: number) => ipcRenderer.invoke('request-fragment-data', windowId),
  
  // 新增：获取当前窗口ID
  getCurrentWindowId: () => ipcRenderer.invoke('get-current-window-id')
});

// 监听来自主进程的菜单事件
ipcRenderer.on('menu-save-file-as', () => {
  document.dispatchEvent(new CustomEvent('menu-save-file-as'));
});