// Server Manager — десктопное приложение (Electron).
// Окно — часть приложения: закрыл окно -> приложение вышло -> сервер остановлен.
const { app, BrowserWindow, shell } = require('electron');
const path = require('path');
const { spawn, execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const PORT = 8600;
let backend = null;
let win = null;

function killGameServer() {
    try { execSync('taskkill /IM majestic-server.exe /F', { stdio: 'ignore' }); } catch (e) { /* не запущен */ }
}

// полное выключение: сервер + бэкенд (со всем деревом процессов) + само приложение.
// /T обязателен — бэкенд спавнит exe сервера, без него дети остаются висеть
let shuttingDown = false;
function shutdownEverything() {
    if (shuttingDown) return;
    shuttingDown = true;
    killGameServer();
    if (backend && backend.pid) {
        try { execSync(`taskkill /PID ${backend.pid} /T /F`, { stdio: 'ignore' }); } catch (e) { /* уже умер */ }
        try { backend.kill('SIGKILL'); } catch (e) { /* пусто */ }
        backend = null;
    }
    killGameServer(); // добиваем, если сервер поднялся между вызовами
    app.exit(0);      // exit, а не quit: не ждём асинхронных обработчиков
}

// вторая копия приложения просто фокусирует первую
if (!app.requestSingleInstanceLock()) {
    app.quit();
} else {
    app.on('second-instance', () => {
        if (win) {
            if (win.isMinimized()) win.restore();
            win.focus();
        }
    });

    app.whenReady().then(async () => {
        // бэкенд менеджера — наш же launcher.mjs, запущенный как чистый node
        backend = spawn(process.execPath, [path.join(ROOT, 'manager', 'launcher.mjs')], {
            env: { ...process.env, MGR_NO_WINDOW: '1', ELECTRON_RUN_AS_NODE: '1' },
            cwd: ROOT,
            stdio: 'ignore',
        });

        win = new BrowserWindow({
            width: 1280,
            height: 960,
            backgroundColor: '#0b0b0d',
            icon: path.join(ROOT, 'manager', 'icon.ico'),
            title: 'Server Manager',
            autoHideMenuBar: true,
        });
        win.setMenuBarVisibility(false);
        // внешние ссылки (made by helik и т.п.) — в системный браузер, не в Electron
        win.webContents.setWindowOpenHandler(({ url }) => {
            shell.openExternal(url);
            return { action: 'deny' };
        });

        // бэкенду нужно мгновение на подъём — пробуем, пока не загрузится
        const url = `http://127.0.0.1:${PORT}/?t=${Date.now()}`;
        const tryLoad = (attempt = 0) => {
            win.loadURL(url).catch(() => {
                if (attempt < 20) setTimeout(() => tryLoad(attempt + 1), 300);
            });
        };
        win.webContents.on('did-fail-load', () => {
            setTimeout(() => tryLoad(), 400);
        });
        setTimeout(() => tryLoad(), 600);
    });

    // любой путь выхода ведёт в одно место: крестик, QUIT, Alt+F4, выход из сессии
    app.on('window-all-closed', shutdownEverything);
    app.on('before-quit', shutdownEverything);
    process.on('exit', () => { try { killGameServer(); } catch (e) { /* пусто */ } });
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
        try { process.on(sig, shutdownEverything); } catch (e) { /* пусто */ }
    }
}
