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
import zlib from 'zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DLC_DIR = path.join(ROOT, 'resources', 'dlc');
const OFF_DIR = path.join(ROOT, 'resources', 'dlc_off'); // выключенные паки (вне wildcard)
const MANIFEST = path.join(ROOT, 'dlcmanager.json');
const TOML = path.join(ROOT, 'server.toml');
const UI = path.join(ROOT, 'manager', 'ui.html');
const FACIAL_META = path.join(ROOT, 'resources', 'game_data', 'common', 'data', 'effects', 'peds', 'facial_overlays.meta');
const PORT = Number(process.env.MGR_PORT) || 8600;

// версию зашивает publish.mjs при релизе; в рабочей копии остаётся 'dev'
const MANAGER_VERSION = '1.06';

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

// ---------------- Валидатор dlc.rpf перед стартом сервера ----------------
// Битый архив роняет exe до консоли, поэтому проверяем сами: заголовок RPF7,
// известное шифрование, оглавление в границах файла, наличие content/setup2
// (у нешифрованных). Битые паки переносим в dlc_off — сервер поднимется без них.
// Та же проверка живёт в resources/core/server (runtime-отчёт по смонтированным)

let validatorLines = [];
// NB: коды именно такие (сверено с CodeWalker и с живыми паками) —
// 0x0FEFFFFF это NG, а 0x0FFFFFF9 это AES, не наоборот
const RPF_ENC = { 0: 'NONE', 0x4e45504f: 'OPEN', 0x0fefffff: 'NG', 0x0ffffff9: 'AES' };

function validateDlcRpf(file) {
    let fd = null;
    try {
        fd = fs.openSync(file, 'r');
    } catch (e) {
        return { err: e.code === 'ENOENT' ? 'dlc.rpf not found' : `cannot open (${e.code})` };
    }
    try {
        const size = fs.fstatSync(fd).size;
        if (size < 32) return { err: 'file too small to be an archive' };
        const head = Buffer.alloc(16);
        fs.readSync(fd, head, 0, 16, 0);
        if (head.readUInt32LE(0) !== 0x52504637) return { err: 'bad magic — not an RPF7 archive' };
        const entryCount = head.readUInt32LE(4);
        const namesLen = head.readUInt32LE(8);
        const encName = RPF_ENC[head.readUInt32LE(12)];
        if (!encName) return { err: `unknown encryption 0x${head.readUInt32LE(12).toString(16)}` };
        if (!entryCount || entryCount > 200000) return { err: `implausible entry count (${entryCount})` };
        if (16 + entryCount * 16 + namesLen > size) return { err: 'TOC bigger than file — archive truncated' };
        if (encName === 'NONE' || encName === 'OPEN') {
            const names = Buffer.alloc(Math.min(namesLen, 8 * 1024 * 1024));
            fs.readSync(fd, names, 0, names.length, 16 + entryCount * 16);
            const heap = names.toString('latin1').toLowerCase();
            if (!heap.includes('content.xml')) return { err: 'no content.xml inside (not a dlc pack?)' };
            if (!heap.includes('setup2.xml')) return { err: 'no setup2.xml inside (not a dlc pack?)' };
        }
        return { enc: encName, entries: entryCount, size };
    } catch (e) {
        return { err: `read failed: ${e.message}` };
    } finally {
        try { if (fd !== null) fs.closeSync(fd); } catch (e) { /* пусто */ }
    }
}

// ---------------- Дешифровка содержимого rpf ----------------
// AES (0x0FFFFFF9 в терминах CodeWalker) — обычный AES-256-ECB, ключ 32 байта.
// NG (0x0FEFFFFF) — фирменный шифр Rockstar: 17 раундов по таблицам, ключ выбирается
// из 101 набора по joaat(имя файла)+размер. Оба ключа лежат в manager/keys
const KEYS_DIR = path.join(ROOT, 'manager', 'keys');
let cachedAesKey;
let cachedNg = null; // { keys: Buffer, tables: Uint32Array[17][16] }

function aesKey() {
    if (cachedAesKey !== undefined) return cachedAesKey;
    try { cachedAesKey = fs.readFileSync(path.join(KEYS_DIR, 'gtav_aes_key.dat')); } catch (e) { cachedAesKey = null; }
    return cachedAesKey;
}

function aesDecrypt(buf) {
    const key = aesKey();
    if (!key || key.length !== 32) return null;
    const blockLen = buf.length & ~15;
    if (!blockLen) return buf;
    const dec = crypto.createDecipheriv('aes-256-ecb', key, null);
    dec.setAutoPadding(false);
    return Buffer.concat([dec.update(buf.subarray(0, blockLen)), dec.final(), buf.subarray(blockLen)]);
}

function ngData() {
    if (cachedNg !== null) return cachedNg.keys ? cachedNg : null;
    cachedNg = {};
    try {
        const keys = fs.readFileSync(path.join(KEYS_DIR, 'gtav_ng_key.dat'));
        const tb = fs.readFileSync(path.join(KEYS_DIR, 'gtav_ng_decrypt_tables.dat'));
        if (keys.length < 101 * 272 || tb.length < 17 * 16 * 256 * 4) return null;
        const tables = [];
        let off = 0;
        for (let r = 0; r < 17; r++) {
            const round = [];
            for (let t = 0; t < 16; t++) {
                const tbl = new Uint32Array(256);
                for (let i = 0; i < 256; i++) { tbl[i] = tb.readUInt32LE(off); off += 4; }
                round.push(tbl);
            }
            tables.push(round);
        }
        cachedNg = { keys, tables };
        return cachedNg;
    } catch (e) {
        return null;
    }
}

function joaat(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
        h = (h + str.charCodeAt(i)) >>> 0;
        h = (h + ((h << 10) >>> 0)) >>> 0;
        h ^= h >>> 6;
    }
    h = (h + ((h << 3) >>> 0)) >>> 0;
    h ^= h >>> 11;
    h = (h + ((h << 15) >>> 0)) >>> 0;
    return h >>> 0;
}

// NG: ключ подбирается по имени файла и его полному размеру
function ngDecrypt(buf, name, fileLen) {
    const ng = ngData();
    if (!ng) return null;
    const idx = ((joaat(String(name).toLowerCase()) + fileLen + 61) >>> 0) % 101;
    const key = new Uint32Array(68);
    for (let i = 0; i < 68; i++) key[i] = ng.keys.readUInt32LE(idx * 272 + i * 4);

    const put = (b, x) => {
        for (let i = 0; i < 4; i++) {
            b[i * 4] = x[i] & 0xff;
            b[i * 4 + 1] = (x[i] >>> 8) & 0xff;
            b[i * 4 + 2] = (x[i] >>> 16) & 0xff;
            b[i * 4 + 3] = (x[i] >>> 24) & 0xff;
        }
    };
    const roundA = (b, k, tb) => put(b, [
        tb[0][b[0]] ^ tb[1][b[1]] ^ tb[2][b[2]] ^ tb[3][b[3]] ^ k[0],
        tb[4][b[4]] ^ tb[5][b[5]] ^ tb[6][b[6]] ^ tb[7][b[7]] ^ k[1],
        tb[8][b[8]] ^ tb[9][b[9]] ^ tb[10][b[10]] ^ tb[11][b[11]] ^ k[2],
        tb[12][b[12]] ^ tb[13][b[13]] ^ tb[14][b[14]] ^ tb[15][b[15]] ^ k[3],
    ]);
    const roundB = (b, k, tb) => put(b, [
        tb[0][b[0]] ^ tb[7][b[7]] ^ tb[10][b[10]] ^ tb[13][b[13]] ^ k[0],
        tb[1][b[1]] ^ tb[4][b[4]] ^ tb[11][b[11]] ^ tb[14][b[14]] ^ k[1],
        tb[2][b[2]] ^ tb[5][b[5]] ^ tb[8][b[8]] ^ tb[15][b[15]] ^ k[2],
        tb[3][b[3]] ^ tb[6][b[6]] ^ tb[9][b[9]] ^ tb[12][b[12]] ^ k[3],
    ]);

    const out = Buffer.from(buf);
    for (let bi = 0; bi + 16 <= out.length; bi += 16) {
        const b = out.subarray(bi, bi + 16);
        roundA(b, key.subarray(0, 4), ng.tables[0]);
        roundA(b, key.subarray(4, 8), ng.tables[1]);
        for (let r = 2; r < 16; r++) roundB(b, key.subarray(r * 4, r * 4 + 4), ng.tables[r]);
        roundA(b, key.subarray(64, 68), ng.tables[16]);
    }
    return out;
}

// Достаём текстовые файлы из rpf по имени: парсим оглавление RPF7 (OPEN/NONE/AES/NG),
// сжатые записи разжимаем (xml в паках часто хранится deflate'ом — сырой греп слепой)
function readRpfTextEntries(rpfPath, nameRe) {
    const out = [];
    let fd = null;
    try { fd = fs.openSync(rpfPath, 'r'); } catch (e) { return out; }
    try {
        const fileLen = fs.fstatSync(fd).size;
        const head = Buffer.alloc(16);
        if (fs.readSync(fd, head, 0, 16, 0) !== 16) return out;
        if (head.readUInt32LE(0) !== 0x52504637) return out;
        const entryCount = head.readUInt32LE(4);
        const namesLen = head.readUInt32LE(8);
        const enc = head.readUInt32LE(12);
        const kind = RPF_ENC[enc];
        if (!kind) return out;
        if (!entryCount || entryCount > 200000) return out;
        let toc = Buffer.alloc(entryCount * 16);
        fs.readSync(fd, toc, 0, toc.length, 16);
        let names = Buffer.alloc(namesLen);
        fs.readSync(fd, names, 0, namesLen, 16 + toc.length);
        if (kind === 'AES') {
            toc = aesDecrypt(toc);
            names = aesDecrypt(names);
        } else if (kind === 'NG') {
            // ключ выбирается по имени архива и его полному размеру
            const base = path.basename(rpfPath);
            toc = ngDecrypt(toc, base, fileLen);
            names = ngDecrypt(names, base, fileLen);
        }
        if (!toc || !names) return out;
        const cstr = (off) => {
            let end = off;
            while (end < names.length && names[end] !== 0) end++;
            return names.toString('latin1', off, end);
        };
        for (let i = 0; i < entryCount; i++) {
            const lo = toc.readUInt32LE(i * 16);
            const hi = toc.readUInt32LE(i * 16 + 4);
            if (hi === 0x7fffff00) continue;       // папка
            if ((hi & 0x80000000) !== 0) continue; // resource
            const name = cstr(lo & 0xffff);
            if (!nameRe.test(name)) continue;
            const packed = ((lo >>> 16) | ((hi & 0xff) << 16)) >>> 0;
            const offset = ((hi >>> 8) & 0xffffff) * 512;
            const rawSize = toc.readUInt32LE(i * 16 + 8);
            const encFlag = toc.readUInt32LE(i * 16 + 12);
            const len = packed || rawSize;
            if (!len || len > 32 * 1024 * 1024) continue;
            const raw = Buffer.alloc(len);
            fs.readSync(fd, raw, 0, len, offset);
            // варианты содержимого: как есть / расшифрованное — берём первый, что распакуется
            const variants = [raw];
            if (encFlag !== 0 || kind === 'NG' || kind === 'AES') {
                const d = kind === 'NG' ? ngDecrypt(raw, name, rawSize) : aesDecrypt(raw);
                if (d) variants.unshift(d);
            }
            for (const v of variants) {
                try {
                    const text = (packed ? zlib.inflateRawSync(v) : v).toString('latin1');
                    if (/<\w/.test(text)) { out.push({ name, text }); break; }
                } catch (e) { /* не этот вариант */ }
            }
        }
    } catch (e) { /* пусто */ } finally {
        try { if (fd !== null) fs.closeSync(fd); } catch (e) { /* пусто */ }
    }
    return out;
}

// nameHash из setup2.xml — ИМЕННО он должен попасть в dlcWhitelist (движок
// вайтлистит extracontent по nameHash, а не по имени папки пака)
function scanSetupNameHashes(rpfPath) {
    const found = [];
    for (const { text } of readRpfTextEntries(rpfPath, /setup2\.xml$/i)) {
        // с маленькой буквы: <nameHash> у SSetupData (NameHash групп — не то)
        for (const m of text.matchAll(/<nameHash>\s*(\w+)\s*<\/nameHash>/g)) found.push(m[1]);
    }
    return found;
}

// декорации (тату + hair-подложки) из overlays.xml пака
function scanPackDecorations(rpfPath) {
    const rows = [];
    for (const { name, text } of readRpfTextEntries(rpfPath, /overlays\.xml$/i)) {
        const collection = name.replace(/\.xml$/i, '');
        // gender бывает GENDER_MALE (ваниль) и просто MALE (кастомные паки)
        for (const m of text.matchAll(
            /<nameHash>(\w+)<\/nameHash>[\s\S]{0,500}?<zone>ZONE_(\w+)<\/zone>\s*<type>TYPE_TATTOO<\/type>[\s\S]{0,300}?<gender>(?:GENDER_)?(\w+)<\/gender>/g,
        )) {
            rows.push({
                c: collection,
                n: m[1],
                z: m[2],
                g: m[3] === 'MALE' ? 'm' : m[3] === 'FEMALE' ? 'f' : 'u',
                h: /hair/i.test(m[1]) ? 1 : 0,
            });
        }
    }
    return rows;
}

// Перед КАЖДЫМ стартом: проверяем паки, чиним dlcWhitelist в server.toml под
// реальный состав папки и складываем каталог декораций в dlccatalog.json —
// серверу и клиенту остаётся только прочитать готовое
const BASE_WHITELIST_END = 'patch2023_02'; // последняя запись базовой игры

function writeWhitelist(packNames) {
    try {
        let toml = fs.readFileSync(TOML, 'utf8');
        const m = toml.match(/dlcWhitelist\s*=\s*\[([\s\S]*?)\]/);
        if (!m) return false;
        const entries = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
        const endIdx = entries.indexOf(BASE_WHITELIST_END);
        const base = endIdx >= 0 ? entries.slice(0, endIdx + 1) : entries;
        const merged = [...new Set([...base, ...packNames])];
        const block = 'dlcWhitelist = [\n' + merged.map((n) => `  "${n}"`).join(',\n') + '\n]';
        const next = toml.replace(m[0], block);
        if (next !== toml) fs.writeFileSync(TOML, next);
        return true;
    } catch (e) {
        return false;
    }
}

function validatePacksBeforeStart() {
    validatorLines = [];
    let dirs = [];
    try {
        dirs = fs.readdirSync(DLC_DIR).filter((n) => {
            try { return fs.statSync(path.join(DLC_DIR, n)).isDirectory(); } catch (e) { return false; }
        });
    } catch (e) { /* папки нет */ }

    const whitelist = [];
    const decorations = [];

    for (const name of dirs) {
        const rpf = path.join(DLC_DIR, name, 'dlc.rpf');
        const v = validateDlcRpf(rpf);
        if (v.err) {
            // выключаем, иначе сервер не стартует вообще
            try {
                fs.mkdirSync(OFF_DIR, { recursive: true });
                let target = path.join(OFF_DIR, name);
                if (fs.existsSync(target)) target += '_' + Date.now();
                fs.renameSync(path.join(DLC_DIR, name), target);
                validatorLines.push(`[validator] ERROR READING: ${name} — ${v.err} -> pack DISABLED so the server can start`);
            } catch (e) {
                validatorLines.push(`[validator] ERROR READING: ${name} — ${v.err} (failed to disable: ${e.message}) — SERVER MAY NOT START`);
            }
            continue;
        }
        // имя папки + dlcName из rpf + nameHash из setup2 — движку нужен именно nameHash
        const setupNames = scanSetupNameHashes(rpf);
        const names = [...new Set([name, ...scanDlcNames(rpf), ...setupNames])];
        whitelist.push(...names);
        const deco = scanPackDecorations(rpf);
        decorations.push(...deco);
        // реестр менеджера держим в согласии с реальностью
        const known = manifest.packs[name];
        manifest.packs[name] = {
            category: known?.category ?? 'other',
            whitelist: names,
            addedAt: known?.addedAt ?? new Date().toISOString(),
        };
        const extra = [
            setupNames.length ? `dlc: ${setupNames.join(', ')}` : null,
            deco.length ? `${deco.length} decorations` : null,
        ].filter(Boolean).join(', ');
        validatorLines.push(
            `[validator] pack OK: ${name} (${v.enc}, ${v.entries} entries, ${(v.size / 1e6).toFixed(1)} MB${extra ? ', ' + extra : ''})`,
        );
    }

    // подчищаем реестр от папок, которых больше нет
    for (const known of Object.keys(manifest.packs)) {
        if (!dirs.includes(known)) delete manifest.packs[known];
    }
    saveManifest();

    writeWhitelist(whitelist);
    // каталог декораций — серверу (он его просто читает, без крипто)
    try {
        fs.writeFileSync(path.join(ROOT, 'dlccatalog.json'), JSON.stringify({ decorations }));
    } catch (e) { /* пусто */ }
    validatorLines.push(
        `[validator] server.toml: ${whitelist.length} dlc name(s) whitelisted; decorations catalog: ${decorations.length}`,
    );
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
            return send(200, { packs: listPacks(), running: isServerRunning(), facialMeta: meta, update: updateStatus, uiVersion, manager: MANAGER_VERSION });
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
                // строки валидатора — всегда шапкой над серверным логом
                return send(200, { lines: [...validatorLines, ...lines.slice(-(40 - validatorLines.length))] });
            } catch (e) {
                return send(200, { lines: [...validatorLines] });
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
                // движок вайтлистит по nameHash из setup2 — он может отличаться от имени папки
                const setupNames = scanSetupNameHashes(target);
                const wl = [...new Set([packName, ...names, ...setupNames])];
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
                // сначала валидатор: битый dlc.rpf валит exe ЦЕЛИКОМ ещё до консоли
                // («unknown encryption dlc.rpf» и смерть) — такие паки выключаем сами
                validatePacksBeforeStart();
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
// окне браузер троттлит до ~1/мин). Нет опросов 90с — окна нет, гасимся.
// NB: работает и под Electron (раньше отключалось по MGR_NO_WINDOW — из-за этого
// осиротевший бэкенд висел в процессах вечно). Отключить можно MGR_NO_WATCHDOG=1
let lastHeartbeat = Date.now();
setInterval(() => {
    if (process.env.MGR_NO_WATCHDOG) return;
    if (Date.now() - lastHeartbeat > 90000) shutdownAll('no heartbeat from window');
}, 15000);

// смерть по любому пути (kill, Ctrl+C, закрытие Electron) уносит сервер с собой
function killServerNow() {
    try { execSync('taskkill /IM majestic-server.exe /F', { stdio: 'ignore' }); } catch (e) { /* пусто */ }
}
process.on('exit', killServerNow);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
    try { process.on(sig, () => { killServerNow(); process.exit(0); }); } catch (e) { /* пусто */ }
}

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
