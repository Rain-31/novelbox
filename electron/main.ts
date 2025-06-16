import { app, BrowserWindow, ipcMain, dialog, Menu, shell, globalShortcut } from 'electron'
import { enable } from '@electron/remote/main'
import * as path from 'path'
import * as fs from 'fs/promises';

// 存储片段窗口的映射表
const fragmentWindows = new Map<string, BrowserWindow>();

// 存储等待发送的片段数据
const pendingFragmentData = new Map<number, any>();

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../dist/electron/preload.js' : './preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    frame: true,
    titleBarStyle: 'default',
    icon: path.join(__dirname, '../public/icon.ico')
  })

  // 监听主窗口关闭事件，同时关闭所有片段窗口
  win.on('close', () => {
    // 关闭所有片段窗口
    fragmentWindows.forEach((window) => {
      window.close();
    });
  })

  // 监听主窗口最小化事件
  win.on('minimize', () => {
    // 最小化所有片段窗口
    fragmentWindows.forEach((window) => {
      if (!window.isDestroyed() && window.isVisible()) {
        window.minimize();
      }
    });
  });

  // 监听主窗口恢复事件
  win.on('restore', () => {
    // 恢复所有片段窗口
    fragmentWindows.forEach((window) => {
      if (!window.isDestroyed() && window.isMinimized()) {
        window.restore();
      }
    });
  });

  // 监听主窗口显示事件
  win.on('show', () => {
    // 显示所有片段窗口
    fragmentWindows.forEach((window) => {
      if (!window.isDestroyed() && !window.isVisible()) {
        window.show();
      }
    });
  });

  // 注册F12快捷键
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // 检查localStorage中是否有工作区数据
  win.webContents.on('did-finish-load', async () => {
    const workspacePath = await win.webContents.executeJavaScript('localStorage.getItem("workspacePath")');
    const hasWorkspace = workspacePath !== null;
    const dirExists = hasWorkspace ? await fs.access(workspacePath).then(() => true).catch(() => false) : false;

    if (!hasWorkspace || !dirExists) {
      const { canceled, filePaths } = await dialog.showOpenDialog({
        title: '选择工作区目录',
        properties: ['openDirectory']
      });

      if (!canceled && filePaths.length > 0) {
        const workspacePath = filePaths[0].replace(/\\/g, '\\\\');
        win.webContents.send('workspace-changed', workspacePath);
        win.webContents.executeJavaScript(`
          localStorage.setItem('workspacePath', '${workspacePath.replace(/\\/g, '\\\\')}');
          window.location.reload();
        `);
      }
    }
  });

  if (process.env.VITE_DEV_SERVER_URL) {
    win.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    // 设置CSP头
    win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["default-src 'self' 'unsafe-inline' 'unsafe-eval' data: file: http: https: app:"]
        }
      });
    });

    // 使用file://协议加载本地文件
    win.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  enable(win.webContents)
}

// 创建应用菜单
function createMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    // { role: 'appMenu' }
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about', label: '关于' },
        { type: 'separator' },
        { role: 'services', label: '服务' },
        { type: 'separator' },
        { role: 'hide', label: '隐藏' },
        { role: 'hideOthers', label: '隐藏其他' },
        { role: 'unhide', label: '显示全部' },
        { type: 'separator' },
        { role: 'quit', label: '退出' }
      ]
    }] : []),
    // { role: 'fileMenu' }
    {
      label: '文件',
      submenu: [
        {
          label: '更换工作区',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              // 直接调用IPC处理函数
              win.webContents.send('trigger-change-workspace');
            }
          }
        },
        {
          label: 'AI配置',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send('open-ai-settings');
            }
          }
        },
        {
          label: '全局设置',
          click: () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send('open-settings');
            }
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close', label: '关闭' } : { role: 'quit', label: '退出' }
      ]
    },
    {
      role: 'help',
      label: '帮助',
      submenu: [
        {
          label: '关于',
          click: async () => {
            const win = BrowserWindow.getFocusedWindow();
            if (win) {
              win.webContents.send('open-about-page');
            }
          }
        },
        {
          label: '访问官网',
          click: async () => {
            await shell.openExternal('https://github.com/Rain-31/novelbox');
          }
        },
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  createMenu();

  // 注册F12快捷键
  globalShortcut.register('F12', () => {
    const win = BrowserWindow.getFocusedWindow();
    if (win) {
      win.webContents.toggleDevTools();
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
})

app.on('window-all-closed', () => {
  // 关闭所有片段窗口
  fragmentWindows.forEach((window) => {
    window.close();
  });
  
  if (process.platform !== 'darwin') {
    app.quit();
  }
})

// 确保应用退出时关闭所有窗口
app.on('before-quit', () => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.destroy(); // 使用destroy强制关闭
    }
  });
})

// 在应用退出时注销所有快捷键
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

// 设置代理
ipcMain.on('set_proxy', (event, arg) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    const { http_proxy } = arg;
    
    // 处理系统代理
    if (http_proxy === 'system') {
      // 使用系统代理设置
      win.webContents.session.setProxy({ mode: 'system' })
        .then(() => {
          event.sender.send('proxy_status', { success: true });
        })
        .catch((error) => {
          console.error('设置系统代理失败:', error);
          event.sender.send('proxy_status', { success: false, error });
        });
    } else {
      // 使用自定义代理
      win.webContents.session.setProxy({ proxyRules: http_proxy })
        .then(() => {
          event.sender.send('proxy_status', { success: true });
        })
        .catch((error) => {
          console.error('设置代理失败:', error);
          event.sender.send('proxy_status', { success: false, error });
        });
    }
  }
});

// 移除代理
ipcMain.on('remove_proxy', (event) => {
  const win = BrowserWindow.getFocusedWindow();
  if (win) {
    win.webContents.session.setProxy({})
      .then(() => {
        event.sender.send('proxy_status', { success: true });
      })
      .catch((error) => {
        console.error('移除代理失败:', error);
        event.sender.send('proxy_status', { success: false, error });
      });
  }
});

// 导出文件
ipcMain.handle('save-file-as', async (_event, defaultPath: string) => {
  try {
    const { canceled, filePath: savePath } = await dialog.showSaveDialog({
      title: '导出文件',
      defaultPath: defaultPath || path.join(app.getPath('documents'), '未命名.docx'),
      filters: [
        { name: 'Word文档', extensions: ['docx'] },
        { name: '所有文件', extensions: ['*'] }
      ]
    });

    if (canceled || !savePath) {
      return { success: false, message: '导出文件已取消' };
    }

    return { success: true, filePath: savePath };
  } catch (error) {
    console.error('导出文件失败:', error);
    return { success: false, message: `导出文件失败: ${error}` };
  }
});

// 窗口控制
ipcMain.on('minimize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) win.minimize();
});

ipcMain.on('maximize-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  }
});

ipcMain.on('close-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    // 确保窗口关闭前清理相关资源
    win.webContents.session.clearCache();
    win.close();
  }
});

// 文件操作相关的 IPC 处理程序

// 读取文件
ipcMain.handle('read-file', async (_event, filePath: string) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return { success: true, content };
  } catch (error: any) {
    console.error('读取文件失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 写入文件
ipcMain.handle('write-file', async (_event, { filePath, content }: { filePath: string; content: string }) => {
  try {
    // 确保目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true };
  } catch (error: any) {
    console.error('写入文件失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 写入二进制文件
ipcMain.handle('write-blob-file', async (_event, { filePath, buffer }: { filePath: string; buffer: Buffer }) => {
  try {
    // 确保目录存在
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    return { success: true };
  } catch (error: any) {
    console.error('写入二进制文件失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 列出目录内容
ipcMain.handle('list-files', async (_event, dirPath: string) => {
  try {
    const items = await fs.readdir(dirPath, { withFileTypes: true });
    return {
      success: true,
      items: items.map(item => ({
        name: item.name,
        type: item.isDirectory() ? 'directory' : 'file'
      }))
    };
  } catch (error: any) {
    console.error('列出目录内容失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 删除文件
ipcMain.handle('delete-file', async (_event, filePath: string) => {
  try {
    await fs.unlink(filePath);
    return { success: true };
  } catch (error: any) {
    console.error('删除文件失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 获取版本号
ipcMain.handle('get-version', () => {
  return app.getVersion();
});

// 选择并应用工作区目录
ipcMain.handle('change-workspace', async (event, fromSettings = false) => {
  try {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) {
      return { success: false, message: '无法获取窗口实例' };
    }

    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: '选择工作区目录',
      properties: ['openDirectory']
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, message: '用户取消选择' };
    }

    const workspacePath = filePaths[0];
    
    // 发送工作区变更事件
    win.webContents.send('workspace-changed', workspacePath);
    
    // 将工作区路径保存到localStorage并重新加载
    // 如果是从设置页面调用的，设置一个标记，以便重新加载后重新打开设置页面
    await win.webContents.executeJavaScript(`
      localStorage.setItem('workspacePath', '${workspacePath.replace(/\\/g, '\\\\')}');
      ${fromSettings ? "localStorage.setItem('reopenSettings', 'true');" : ""}
      window.location.reload();
    `);
    
    return { success: true, path: workspacePath };
  } catch (error: any) {
    console.error('更换工作区失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 打开外部链接
ipcMain.on('open-external', (_event, url: string) => {
  shell.openExternal(url);
});

// 创建片段编辑窗口
ipcMain.handle('create-fragment-window', async (_event, fragment: any) => {
  try {
    // 检查窗口是否已经存在
    if (fragmentWindows.has(fragment.id)) {
      const existingWindow = fragmentWindows.get(fragment.id);
      if (existingWindow && !existingWindow.isDestroyed()) {
        existingWindow.focus();
        return { success: true, message: '窗口已存在，已切换至该窗口' };
      }
    }
    
    // 确保片段有标题
    if (!fragment.title) {
      fragment.title = '新片段';
    }
    
    // 创建新窗口 - 极简样式
    const fragmentWindow = new BrowserWindow({
      width: 550,
      height: 350,
      frame: false, // 无边框窗口
      modal: false,
      show: false,
      backgroundColor: '#ffffff',
      // 设置关闭时的行为
      closable: true,
      alwaysOnTop: true, // 窗口始终保持在最前面
      webPreferences: {
        preload: path.join(__dirname, process.env.VITE_DEV_SERVER_URL ? '../dist/electron/preload.js' : './preload.js'),
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      },
    });
    
    // 存储窗口引用
    fragmentWindows.set(fragment.id, fragmentWindow);
    
    // 设置窗口标题
    fragmentWindow.setTitle(fragment.title);
    
    // 存储片段数据，等待渲染进程请求
    pendingFragmentData.set(fragmentWindow.id, fragment);
    
    // 获取主窗口
    const mainWindows = BrowserWindow.getAllWindows().filter(win => !fragmentWindows.has(win.id.toString()));
    const mainWindow = mainWindows.length > 0 ? mainWindows[0] : null;
    
    // 如果主窗口已最小化，则新创建的片段窗口也应该最小化
    if (mainWindow && mainWindow.isMinimized()) {
      fragmentWindow.once('ready-to-show', () => {
        fragmentWindow.minimize();
      });
    }
    
    // 加载页面
    if (process.env.VITE_DEV_SERVER_URL) {
      await fragmentWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL}#/fragment-editor`);
    } else {
      await fragmentWindow.loadFile(path.join(__dirname, '../../dist/index.html'), {
        hash: '/fragment-editor'
      });
    }
    
    // 显示窗口
    fragmentWindow.show();
    
    // 窗口关闭时清理引用
    fragmentWindow.on('closed', () => {
      if (fragmentWindows.has(fragment.id)) {
        fragmentWindows.delete(fragment.id);
      }
      pendingFragmentData.delete(fragmentWindow.id);
    });
    
    // 添加关闭事件处理
    fragmentWindow.on('close', () => {
      if (fragmentWindows.has(fragment.id)) {
        fragmentWindows.delete(fragment.id);
      }
      pendingFragmentData.delete(fragmentWindow.id);
    });
    
    return { success: true, message: '片段窗口已创建' };
  } catch (error: any) {
    console.error('创建片段窗口失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 新增：响应渲染进程请求片段数据
ipcMain.handle('request-fragment-data', (_event, windowId: number) => {
  try {
    // 获取为该窗口保存的片段数据
    const fragment = pendingFragmentData.get(windowId);
    
    if (!fragment) {
      return { success: false, message: '没有找到对应的片段数据' };
    }
    
    // 获取发出请求的窗口
    const win = BrowserWindow.fromId(windowId);
    if (!win) {
      return { success: false, message: '没有找到对应的窗口' };
    }
    
    // 发送片段数据到窗口
    win.webContents.send('fragment-data', fragment);
    
    return { success: true, message: '片段数据已发送' };
  } catch (error: any) {
    console.error('处理片段数据请求失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 获取当前窗口ID
ipcMain.handle('get-current-window-id', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) {
    return { success: false, message: '无法获取窗口ID' };
  }
  return { success: true, id: win.id };
});

// 关闭片段窗口
ipcMain.on('close-fragment-window', (_event, fragmentId: string) => {
  const fragmentWindow = fragmentWindows.get(fragmentId);
  if (fragmentWindow && !fragmentWindow.isDestroyed()) {
    fragmentWindow.close();
  }
});

// 关闭当前窗口
ipcMain.on('close-current-window', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) {
    win.close();
  } 
});

// 最小化片段窗口
ipcMain.on('minimize-fragment-window', (_event, fragmentId: string) => {
  const fragmentWindow = fragmentWindows.get(fragmentId);
  if (fragmentWindow && !fragmentWindow.isDestroyed()) {
    fragmentWindow.minimize();
  }
});

// 保存片段内容
ipcMain.handle('save-fragment-content', async (_event, fragment: any) => {
  try {
    // 将保存事件广播到主窗口，让主窗口进行数据存储
    BrowserWindow.getAllWindows().forEach(win => {
      // 排除片段窗口本身
      if (!fragmentWindows.has(fragment.id) || win !== fragmentWindows.get(fragment.id)) {
        win.webContents.send('fragment-saved', fragment);
      }
    });
    
    return { success: true, message: '片段已保存' };
  } catch (error: any) {
    console.error('保存片段失败:', error);
    return { 
      success: false, 
      error: {
        message: error.message,
        code: error.code
      }
    };
  }
});

// 处理窗口拖动
// 由于无边框窗口需要自定义拖动，我们使用CSS的-webkit-app-region: drag替代
// 在HTML元素上添加这个CSS属性即可实现拖动，不需要额外的JS处理
ipcMain.on('window-drag', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win) {
    win.moveTop(); // 确保窗口在最前面
  }
});
