const { app, BrowserWindow, Menu, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
    const win = new BrowserWindow({
        width: 1280,
        height: 800,
        title: "PDF Editor Pro",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js') // 預留 preload 空間
        }
    });

    // 隱藏預設選單
    Menu.setApplicationMenu(null);

    // 判斷開發環境或生產環境
    const isDev = !app.isPackaged;

    if (isDev) {
        win.loadURL('http://localhost:5173');
        // win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
        // 僅在生產環境檢查更新
        autoUpdater.checkForUpdatesAndNotify();
    }
}

// 自動更新相關事件監聽
autoUpdater.on('update-available', () => {
    // 可以在這裡通知渲染進程，或者使用預設的通知
});

autoUpdater.on('update-downloaded', () => {
    dialog.showMessageBox({
        type: 'info',
        title: '更新已就緒',
        message: '新版本已下載完成，是否現在重啟並安裝？',
        buttons: ['現在安裝', '稍後提示']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

app.whenReady().then(() => {
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
