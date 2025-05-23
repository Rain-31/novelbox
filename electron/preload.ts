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

  // 应用操作
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // AI配置
  onOpenAISettings: (callback: () => void) => ipcRenderer.on('open-ai-settings', () => callback())
});

// 监听来自主进程的菜单事件
ipcRenderer.on('menu-save-file-as', () => {
  document.dispatchEvent(new CustomEvent('menu-save-file-as'));
});