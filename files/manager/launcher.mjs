// Server Manager — локальный менеджер паков и запуска сервера.
// Запуск: manager.bat (node manager/launcher.mjs), UI на http://127.0.0.1:8600
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DLC_DIR = path.join(ROOT, 'resources', 'dlc');
const OFF_DIR = path.join(ROOT, 'resources', 'dlc_off'); // выключенные паки (вне wildcard)
const MANIFEST = path.join(ROOT, 'dlcmanager.json');
const TOML = path.join(ROOT, 'server.toml');
const UI = path.join(ROOT, 'manager', 'ui.html');
const FACIAL_META = path.join(ROOT, 'resources', 'game_data', 'common', 'data', 'effects', 'peds', 'facial_overlays.meta');
const PORT = Number(process.env.MGR_PORT) || 8600;

const manifest = fs.existsSync(MANIFEST)
    ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
    : { packs: {} };

// ---------------- Удалённые обновления ----------------
// update.json в корне: { "url": "https://host/path/manifest.json" }
// Манифест: { version, files: [{ path, sha256, size }] }, сами файлы
// лежат рядом с манифестом в files/<path>. Публикация: node manager/publish.mjs

// URL зашивается при публикации: node manager/publish.mjs --url https://.../manifest.json
// Получателю ничего вписывать не нужно. update.json (если есть) переопределяет.
const DEFAULT_UPDATE_URL = 'https://raw.githubusercontent.com/hel1k/local-server/main/manifest.json';

const UPDATE_CFG = path.join(ROOT, 'update.json');
let updateStatus = { state: 'off', detail: 'no update url' };

function sha256File(file) {
    return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

// кастом-режим (update.json {"custom": true}): получатель пишет свои фичи —
// апдейты не трогают его код, но файлы платформы Majestic обновляются всегда
const PLATFORM_PREFIXES = ['server/', 'modules/', 'data/'];
const isPlatformFile = (rel) => PLATFORM_PREFIXES.some((p) => rel.startsWith(p));

// apply=false — только проверить и показать «доступно обновление» (мигает в шапке),
// apply=true — скачать и применить (кнопка UPDATE NOW в окне патч-ноутов)
async function checkUpdates(apply = false) {
    let cfg = null;
    try { cfg = JSON.parse(fs.readFileSync(UPDATE_CFG, 'utf8')); } catch (e) { /* нет конфига */ }
    // дев-режим: update.json {"disabled": true} — апдейтер не трогает локальные
    // файлы (иначе он откатывает свежие правки до последнего релиза)
    if (cfg && cfg.disabled) {
        updateStatus = { state: 'off', detail: 'dev mode — updates disabled locally' };
        return;
    }
    const customMode = !!(cfg && cfg.custom);
    const updateUrl = (cfg && cfg.url) || DEFAULT_UPDATE_URL;
    if (!updateUrl) {
        updateStatus = { state: 'off', detail: 'updates not configured' };
        return;
    }
    updateStatus = { state: 'checking', custom: customMode, detail: 'downloading manifest...' };
    try {
        // ?t= пробивает CDN-кэш raw.githubusercontent (иначе манифест может
        // приезжать пятиминутной давности, а файлы — протухшими, с битым sha)
        const bust = (u) => u + (u.includes('?') ? '&' : '?') + 't=' + Date.now();
        const res = await fetch(bust(updateUrl), { cache: 'no-store' });
        if (!res.ok) throw new Error(`manifest: HTTP ${res.status}`);
        const man = await res.json();
        const base = updateUrl.replace(/[^/]*$/, '');
        const version = man.version ?? null;
        const notes = man.notes ?? null;

        // сверяем хэши — что устарело; в кастом-режиме код получателя не трогаем
        const pending = [];
        for (const f of man.files ?? []) {
            const rel = String(f.path).replace(/\\/g, '/');
            if (rel.includes('..') || path.isAbsolute(rel)) continue; // защита путей
            if (customMode && !isPlatformFile(rel)) continue;
            const target = path.resolve(ROOT, rel);
            if (!target.startsWith(ROOT)) continue;
            let localHash = null;
            try { localHash = sha256File(target); } catch (e) { /* файла нет */ }
            if (localHash !== f.sha256) pending.push({ rel, sha256: f.sha256, target });
        }

        if (!pending.length) {
            updateStatus = { state: 'ok', version, notes, custom: customMode, changed: [], detail: 'up to date' };
            return;
        }
        if (!apply) {
            updateStatus = {
                state: 'available',
                version, notes, custom: customMode,
                pending: pending.map((p) => p.rel),
                detail: `v${version} available — ${pending.length} ${customMode ? 'platform ' : ''}file(s)`,
            };
            return;
        }

        // среди обновлений бинарники сервера — сначала гасим процесс,
        // иначе Windows не даст заменить запущенный exe/dll
        if (pending.some((p) => p.rel.startsWith('server/') || p.rel.startsWith('modules/'))) {
            try { execSync('taskkill /IM majestic-server.exe /F', { stdio: 'ignore' }); } catch (e) { /* не запущен */ }
        }

        const changed = [];
        for (const { rel, sha256, target } of pending) {
            updateStatus = { state: 'applying', version, notes, detail: `downloading ${rel}...` };
            const r2 = await fetch(bust(base + 'files/' + rel), { cache: 'no-store' });
            if (!r2.ok) throw new Error(`${rel}: HTTP ${r2.status}`);
            const tmp = target + '.tmpdl';
            fs.mkdirSync(path.dirname(target), { recursive: true });
            await pipeline(Readable.fromWeb(r2.body), fs.createWriteStream(tmp));
            if (sha256File(tmp) !== sha256) {
                fs.rmSync(tmp, { force: true });
                throw new Error(`${rel}: hash mismatch`);
            }
            fs.renameSync(tmp, target);
            changed.push(rel);
        }

        const managerChanged = changed.some((p) => p.startsWith('manager/'));
        updateStatus = {
            state: 'applied',
            version, notes, custom: customMode, changed,
            detail: managerChanged
                ? `updated ${changed.length} file(s) — QUIT and relaunch the manager to apply`
                : `updated ${changed.length} file(s) — restart server to apply`,
        };
    } catch (e) {
        updateStatus = { state: 'error', detail: e.message };
    }
}

function saveManifest() {
    fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2));
}

// dlcName/fullDlcName вытаскиваем сканом первых 64МБ rpf (метаданные в начале)
function scanDlcNames(file) {
    try {
        const fd = fs.openSync(file, 'r');
        const size = Math.min(fs.fstatSync(fd).size, 64 * 1024 * 1024);
        const buf = Buffer.alloc(size);
        fs.readSync(fd, buf, 0, size, 0);
        fs.closeSync(fd);
        const text = buf.toString('latin1');
        const names = new Set();
        for (const m of text.matchAll(/<dlcName>([\w]{1,64})<\/dlcName>/g)) names.add(m[1]);
        for (const m of text.matchAll(/<fullDlcName>([\w]{1,96})<\/fullDlcName>/g)) names.add(m[1]);
        return [...names];
    } catch (e) {
        return [];
    }
}

function updateWhitelist(add) {
    try {
        let toml = fs.readFileSync(TOML, 'utf8');
        const m = toml.match(/dlcWhitelist\s*=\s*\[([\s\S]*?)\]/);
        if (!m) return false;
        const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        const merged = [...new Set([...existing, ...add])];
        const block = 'dlcWhitelist = [\n' + merged.map((n) => `  "${n}"`).join(',\n') + '\n]';
        toml = toml.replace(m[0], block);
        fs.writeFileSync(TOML, toml);
        return true;
    } catch (e) {
        return false;
    }
}

function listPacks() {
    const packs = [];
    for (const [dir, enabled] of [[DLC_DIR, true], [OFF_DIR, false]]) {
        if (!fs.existsSync(dir)) continue;
        for (const name of fs.readdirSync(dir)) {
            const rpf = path.join(dir, name, 'dlc.rpf');
            if (!fs.existsSync(rpf)) continue;
            const meta = manifest.packs[name] ?? {};
            packs.push({
                name,
                enabled,
                size: fs.statSync(rpf).size,
                category: meta.category ?? 'other',
                whitelist: meta.whitelist ?? [],
            });
        }
    }
    return packs.sort((a, b) => a.name.localeCompare(b.name));
}

function isServerRunning() {
    try {
        const out = execSync('tasklist /FI "IMAGENAME eq majestic-server.exe" /FO CSV /NH', { encoding: 'utf8' });
        return out.includes('majestic-server.exe');
    } catch (e) {
        return false;
    }
}

const validName = (n) => typeof n === 'string' && /^[a-z0-9_]{1,64}$/.test(n);

// отложенное выключение: окно закрыли -> через 5с стоп сервера и выход;
// любой живой запрос страницы отменяет (значит, это был reload)
let shutdownTimer = null;

function scheduleShutdown() {
    if (shutdownTimer) clearTimeout(shutdownTimer);
    shutdownTimer = setTimeout(() => {
        console.log('window closed — stopping server and exiting');
        try { execSync('taskkill /IM majestic-server.exe /F', { stdio: 'ignore' }); } catch (e) { /* пусто */ }
        process.exit(0);
    }, 5000);
}

function cancelShutdown() {
    if (shutdownTimer) {
        clearTimeout(shutdownTimer);
        shutdownTimer = null;
    }
}

const httpServer = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const send = (code, data, type = 'application/json') => {
        // no-store: иначе Edge кэширует страницу и показывает старый интерфейс
        res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store' });
        res.end(type === 'application/json' ? JSON.stringify(data) : data);
    };

    try {
        // страница жива — отменяем отложенное выключение и обновляем heartbeat
        if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/state')) {
            cancelShutdown();
            lastHeartbeat = Date.now();
        }

        if (req.method === 'GET' && url.pathname === '/') {
            // вшиваем версию интерфейса: страница сама перезагрузится,
            // если на диске появился более новый ui.html
            const html = fs.readFileSync(UI, 'utf8');
            const uiv = crypto.createHash('sha256').update(html).digest('hex').slice(0, 12);
            return send(200, html.replace('__UIV__', uiv), 'text/html; charset=utf-8');
        }

        // шрифты интерфейса — те же woff2, что использует игровой HUD
        if (req.method === 'GET' && url.pathname.startsWith('/fonts/')) {
            const fname = url.pathname.slice('/fonts/'.length);
            if (!/^[\w.-]+\.woff2$/.test(fname)) return send(404, { ok: false });
            const fp = path.join(ROOT, 'resources', 'core', 'ui', 'fonts', fname);
            if (!fs.existsSync(fp)) return send(404, { ok: false });
            res.writeHead(200, { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=86400' });
            return res.end(fs.readFileSync(fp));
        }

        if (req.method === 'GET' && url.pathname === '/state') {
            let meta = null;
            try {
                const txt = fs.readFileSync(FACIAL_META, 'utf8');
                meta = { size: txt.length, items: (txt.match(/<Item>/g) || []).length };
            } catch (e) { /* меты нет */ }
            let uiVersion = null;
            try {
                uiVersion = crypto.createHash('sha256').update(fs.readFileSync(UI, 'utf8')).digest('hex').slice(0, 12);
            } catch (e) { /* пусто */ }
            return send(200, { packs: listPacks(), running: isServerRunning(), facialMeta: meta, update: updateStatus, uiVersion });
        }

        // кастом-режим: свой код вместо моих апдейтов (платформа обновляется всегда)
        if (req.method === 'POST' && url.pathname === '/custommode') {
            const on = url.searchParams.get('on') === '1';
            let cfg = {};
            try { cfg = JSON.parse(fs.readFileSync(UPDATE_CFG, 'utf8')); } catch (e) { /* нет файла */ }
            if (on) cfg.custom = true;
            else delete cfg.custom;
            if (Object.keys(cfg).length) fs.writeFileSync(UPDATE_CFG, JSON.stringify(cfg, null, 2));
            else fs.rmSync(UPDATE_CFG, { force: true });
            checkUpdates();
            return send(200, { ok: true, custom: on });
        }

        // применить доступное обновление (кнопка UPDATE NOW)
        if (req.method === 'POST' && url.pathname === '/update/apply') {
            checkUpdates(true);
            return send(200, { ok: true });
        }

        // ручная проверка обновлений
        if (req.method === 'POST' && url.pathname === '/update/check') {
            checkUpdates();
            return send(200, { ok: true });
        }

        // удалить facial_overlays.meta (кнопка DELETE в секции Makeup)
        if (req.method === 'POST' && url.pathname === '/meta/delete') {
            try { fs.rmSync(FACIAL_META, { force: true }); } catch (e) { /* нет файла */ }
            return send(200, { ok: true });
        }

        // заливка facial_overlays.meta (секция Makeup) — просто заменяет текущую
        if (req.method === 'POST' && url.pathname === '/meta') {
            let body = '';
            req.setEncoding('utf8');
            req.on('data', (c) => { body += c; });
            req.on('end', () => {
                if (!body.includes('<CPedFacialOverlays>')) {
                    return send(400, { ok: false, error: 'not a CPedFacialOverlays meta file' });
                }
                try {
                    fs.mkdirSync(path.dirname(FACIAL_META), { recursive: true });
                    fs.writeFileSync(FACIAL_META, body);
                    send(200, { ok: true, items: (body.match(/<Item>/g) || []).length });
                } catch (e) {
                    send(500, { ok: false, error: e.message });
                }
            });
            return;
        }

        // выключить менеджер (и сервер вместе с ним)
        if (req.method === 'POST' && url.pathname === '/quit') {
            send(200, { ok: true });
            try { execSync('taskkill /IM majestic-server.exe /F', { stdio: 'ignore' }); } catch (e) { /* не запущен */ }
            setTimeout(() => process.exit(0), 200);
            return;
        }

        // окно закрыто крестиком: страница шлёт маячок перед смертью.
        // Ждём 5с — если это была перезагрузка страницы, она успеет вернуться
        if (req.method === 'POST' && url.pathname === '/window-closed') {
            scheduleShutdown();
            return send(200, { ok: true });
        }

        if (req.method === 'GET' && url.pathname === '/log') {
            try {
                const lines = fs.readFileSync(path.join(ROOT, 'server.log'), 'utf8').split(/\r?\n/);
                return send(200, { lines: lines.slice(-40) });
            } catch (e) {
                return send(200, { lines: [] });
            }
        }

        if (req.method === 'POST' && url.pathname === '/upload') {
            const category = String(url.searchParams.get('category') || 'other');
            const packName = String(url.searchParams.get('name') || 'pack')
                .replace(/\.rpf$/i, '')
                .replace(/[^a-zA-Z0-9_]/g, '_')
                .toLowerCase()
                .slice(0, 64) || 'pack';
            const dir = path.join(DLC_DIR, packName);
            fs.mkdirSync(dir, { recursive: true });
            const target = path.join(dir, 'dlc.rpf');
            const ws = fs.createWriteStream(target);
            req.pipe(ws);
            ws.on('finish', () => {
                const names = scanDlcNames(target);
                const wl = [...new Set([packName, ...names])];
                updateWhitelist(wl);
                manifest.packs[packName] = { category, whitelist: wl, addedAt: new Date().toISOString() };
                saveManifest();
                send(200, { ok: true, name: packName, whitelist: wl });
            });
            ws.on('error', (e) => send(500, { ok: false, error: e.message }));
            return;
        }

        // переименование папки пака (rpf внутри не трогаем)
        if (req.method === 'POST' && url.pathname === '/rename') {
            const name = url.searchParams.get('name');
            const to = url.searchParams.get('to');
            if (!validName(name) || !validName(to)) return send(400, { ok: false, error: 'bad name' });
            if (name === to) return send(200, { ok: true });
            const from = fs.existsSync(path.join(DLC_DIR, name)) ? DLC_DIR
                : (fs.existsSync(path.join(OFF_DIR, name)) ? OFF_DIR : null);
            if (!from) return send(404, { ok: false, error: 'pack not found' });
            if (fs.existsSync(path.join(DLC_DIR, to)) || fs.existsSync(path.join(OFF_DIR, to))) {
                return send(400, { ok: false, error: `"${to}" already exists` });
            }
            fs.renameSync(path.join(from, name), path.join(from, to));

            // в вайтлисте меняем имя папки, dlcName-имена из rpf сохраняем
            const rec = manifest.packs[name] ?? { category: 'other', whitelist: [name] };
            const wl = [...new Set([to, ...(rec.whitelist ?? []).filter((n) => n !== name)])];
            try {
                let toml = fs.readFileSync(TOML, 'utf8');
                const m = toml.match(/dlcWhitelist\s*=\s*\[([\s\S]*?)\]/);
                if (m) {
                    const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]).filter((n) => n !== name);
                    const merged = [...new Set([...existing, ...wl])];
                    toml = toml.replace(m[0], 'dlcWhitelist = [\n' + merged.map((n) => `  "${n}"`).join(',\n') + '\n]');
                    fs.writeFileSync(TOML, toml);
                }
            } catch (e) { /* пусто */ }
            delete manifest.packs[name];
            manifest.packs[to] = { ...rec, whitelist: wl };
            saveManifest();
            return send(200, { ok: true });
        }

        if (req.method === 'POST' && url.pathname === '/toggle') {
            const name = url.searchParams.get('name');
            if (!validName(name)) return send(400, { ok: false, error: 'bad name' });
            const from = fs.existsSync(path.join(DLC_DIR, name)) ? DLC_DIR : OFF_DIR;
            const to = from === DLC_DIR ? OFF_DIR : DLC_DIR;
            fs.mkdirSync(to, { recursive: true });
            fs.renameSync(path.join(from, name), path.join(to, name));
            return send(200, { ok: true });
        }

        if (req.method === 'POST' && url.pathname === '/delete') {
            const name = url.searchParams.get('name');
            if (!validName(name)) return send(400, { ok: false, error: 'bad name' });
            for (const dir of [DLC_DIR, OFF_DIR]) {
                const p = path.join(dir, name);
                if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
            }
            // вычищаем и вайтлист-записи этого пака
            const wl = manifest.packs[name]?.whitelist ?? [name];
            try {
                let toml = fs.readFileSync(TOML, 'utf8');
                const m = toml.match(/dlcWhitelist\s*=\s*\[([\s\S]*?)\]/);
                if (m) {
                    const existing = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
                    const kept = existing.filter((n) => !wl.includes(n));
                    toml = toml.replace(m[0], 'dlcWhitelist = [\n' + kept.map((n) => `  "${n}"`).join(',\n') + '\n]');
                    fs.writeFileSync(TOML, toml);
                }
            } catch (e) { /* пусто */ }
            delete manifest.packs[name];
            saveManifest();
            return send(200, { ok: true });
        }

        if (req.method === 'POST' && url.pathname === '/server/start') {
            if (!isServerRunning()) {
                // exe живёт в server/release, но рабочая папка — корень:
                // оттуда читаются server.toml, resources/, data/, modules/
                const proc = spawn(path.join(ROOT, 'server', 'release', 'x64_win32', 'majestic-server.exe'), [], {
                    cwd: ROOT,
                    detached: true,
                    stdio: 'ignore',
                });
                proc.unref();
            }
            return send(200, { ok: true });
        }

        if (req.method === 'POST' && url.pathname === '/server/stop') {
            try { execSync('taskkill /IM majestic-server.exe /F', { stdio: 'ignore' }); } catch (e) { /* пусто */ }
            return send(200, { ok: true });
        }

        send(404, { error: 'not found' });
    } catch (e) {
        send(500, { error: e.message });
    }
});

function shutdownAll(reason) {
    console.log(`${reason} — stopping server and exiting`);
    try { execSync('taskkill /IM majestic-server.exe /F', { stdio: 'ignore' }); } catch (e) { /* пусто */ }
    process.exit(0);
}

function findBrowserExe() {
    const candidates = [
        `${process.env['ProgramFiles(x86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env.ProgramFiles}\\Microsoft\\Edge\\Application\\msedge.exe`,
        `${process.env.ProgramFiles}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env['ProgramFiles(x86)']}\\Google\\Chrome\\Application\\chrome.exe`,
        `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`,
    ];
    for (const c of candidates) {
        try { if (c && fs.existsSync(c)) return c; } catch (e) { /* пусто */ }
    }
    return null;
}

// watch=true: окно — наш дочерний процесс браузера с ОТДЕЛЬНЫМ профилем.
// Закрыл окно -> процесс умер -> глушим сервер. Надёжно на уровне ОС.
function openWindow(watch = true) {
    const url = `http://127.0.0.1:${PORT}/?t=${Date.now()}`;
    const browser = watch ? findBrowserExe() : null;

    if (browser) {
        const profile = path.join(ROOT, 'manager', '.winprofile');
        const child = spawn(browser, [
            `--app=${url}`,
            `--user-data-dir=${profile}`,
            '--window-size=1280,940',
            '--no-first-run',
            '--disable-features=Translate,msEdgeTranslate',
        ], { stdio: 'ignore' });
        const startedAt = Date.now();
        child.on('exit', () => {
            // мгновенный выход = делегирование уже открытому окну этого профиля,
            // тогда полагаемся на heartbeat; иначе окно реально закрыли
            if (Date.now() - startedAt < 5000) {
                console.log('window delegated to an existing browser instance');
                return;
            }
            shutdownAll('window closed');
        });
        return;
    }

    // фолбэк: системный браузер (закрытие ловится маячком + heartbeat)
    const flags = `--app=${url} --window-size=1280,940 --disable-features=Translate,msEdgeTranslate --no-first-run`;
    const attempts = [
        `start "" msedge ${flags}`,
        `start "" chrome ${flags}`,
        `start "" browser ${flags}`, // Яндекс.Браузер
        `start "" ${url}`,
    ];
    for (const cmd of attempts) {
        try {
            execSync(cmd, { shell: 'cmd.exe', stdio: 'ignore' });
            break;
        } catch (e) { /* пробуем следующий */ }
    }
}

// heartbeat-страховка: страница опрашивает /state каждые 2-3с (в свёрнутом
// окне браузер троттлит до ~1/мин). Нет опросов 3 минуты — окна нет, гасимся.
let lastHeartbeat = Date.now();
setInterval(() => {
    if (process.env.MGR_NO_WINDOW) return;
    if (Date.now() - lastHeartbeat > 180000) shutdownAll('no heartbeat from window');
}, 30000);

// одиночный инстанс: если порт занят живым менеджером — просто открываем окно
// (без watch: этот процесс сейчас умрёт, следить за окном должен основной)
httpServer.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
        if (!process.env.MGR_NO_WINDOW) openWindow(false);
        process.exit(0);
    } else {
        console.error(e);
        process.exit(1);
    }
});

httpServer.listen(PORT, '127.0.0.1', () => {
    console.log(`Server Manager: http://127.0.0.1:${PORT}`);
    checkUpdates(); // только проверка: если есть новое — в шапке замигает UPDATE
    if (!process.env.MGR_NO_WINDOW) openWindow();
});
