import * as alt from 'alt-server';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';

const SPAWN_POS = new alt.Vector3(-75.26, -818.72, 326.18);
const SPAWN_HEADING = 235;
const MODELS = { m: 'mp_m_freemode_01', f: 'mp_f_freemode_01' };
const RESPAWN_DELAY_MS = 5000;

const genders = new Map();          // player.id -> 'm' | 'f'
const personalVehicles = new Map(); // player.id -> alt.Vehicle
const spawnedObjects = new Map();   // player.id -> alt.Object[]

// ---------------- Сохранение одежды (outfits.json в корне) ----------------
// { "Ник": { gender: 'm', m: {comps, props}, f: {...} } }

const OUTFITS_PATH = 'outfits.json';
let outfits = {};
try {
    outfits = JSON.parse(fs.readFileSync(OUTFITS_PATH, 'utf8'));
} catch (e) { /* файла ещё нет */ }

let outfitSaveTimer = null;
function persistOutfits() {
    if (outfitSaveTimer) alt.clearTimeout(outfitSaveTimer);
    outfitSaveTimer = alt.setTimeout(() => {
        outfitSaveTimer = null;
        try {
            fs.writeFileSync(OUTFITS_PATH, JSON.stringify(outfits, null, 2));
        } catch (e) {
            log(`outfits save failed: ${e.message}`);
        }
    }, 500);
}

const ALL_WEAPONS = [
    'weapon_pistol', 'weapon_combatpistol', 'weapon_appistol', 'weapon_microsmg',
    'weapon_smg', 'weapon_assaultrifle', 'weapon_carbinerifle', 'weapon_specialcarbine',
    'weapon_pumpshotgun', 'weapon_assaultshotgun', 'weapon_sniperrifle', 'weapon_heavysniper',
    'weapon_rpg', 'weapon_minigun', 'weapon_grenade', 'weapon_knife', 'weapon_bat',
    'weapon_pistol_mk2', 'weapon_smg_mk2', 'weapon_assaultrifle_mk2', 'weapon_carbinerifle_mk2',
    'weapon_specialcarbine_mk2', 'weapon_pumpshotgun_mk2', 'weapon_heavysniper_mk2',
    'weapon_combatmg_mk2', 'weapon_marksmanrifle_mk2', 'weapon_revolver_mk2',
];

function log(msg) {
    alt.log(`[core] ${msg}`);
}

function chat(player, text) {
    if (player && player.valid) player.emit('chat:msg', text);
}

function spawnPlayer(player, pos = SPAWN_POS) {
    player.model = MODELS[genders.get(player.id) ?? 'm'];
    player.spawn(pos, 0);
    player.rot = new alt.Vector3(0, 0, SPAWN_HEADING);
    player.health = 200;
}

// телепорт вместе с транспортом, если игрок за рулём/внутри
function teleportPlayer(player, x, y, z) {
    const target = new alt.Vector3(x, y, z);
    if (player.vehicle && player.vehicle.valid) {
        player.vehicle.pos = target;
    } else {
        player.pos = target;
    }
}

function posInFront(player, dist = 4) {
    const rad = (player.rot.z * Math.PI) / 180;
    return new alt.Vector3(
        player.pos.x - Math.sin(rad) * dist,
        player.pos.y + Math.cos(rad) * dist,
        player.pos.z,
    );
}

function spawnVehicleFor(player, model) {
    const old = personalVehicles.get(player.id);
    if (old && old.valid) old.destroy();

    const pos = posInFront(player);
    try {
        const veh = new alt.Vehicle(model, pos.x, pos.y, pos.z, 0, 0, player.rot.z);
        veh.numberPlateText = 'DEV';
        personalVehicles.set(player.id, veh);
        player.setIntoVehicle(veh, 1);
        chat(player, `* Vehicle: ${model}`);
    } catch (e) {
        chat(player, `* Unknown vehicle model: ${model}`);
    }
}

// при остановке ресурса/сервера дописываем всё, что висит в 500мс-дебаунсе
alt.on('resourceStop', () => {
    try {
        if (outfitSaveTimer) fs.writeFileSync(OUTFITS_PATH, JSON.stringify(outfits, null, 2));
    } catch (e) { /* пусто */ }
    try {
        if (layoutSaveTimer) fs.writeFileSync(LAYOUT_PATH, JSON.stringify(hudLayouts, null, 2));
    } catch (e) { /* пусто */ }
});

// ---------------- Жизненный цикл ----------------

alt.on('playerConnect', (player) => {
    alt.log(`~lg~[core] >> CONNECTED: ${player.name} (id ${player.id}, ip ${player.ip})`);
    const saved = outfits[player.name];
    genders.set(player.id, saved?.gender === 'f' ? 'f' : 'm'); // дефолт — мужской пед
    spawnPlayer(player);
    chat(player, `* Welcome, ${player.name}. /help for commands, M for menu`);
});

alt.on('playerDisconnect', (player, reason) => {
    alt.log(`~ly~[core] << DISCONNECTED: ${player.name} (${reason})`);
    const veh = personalVehicles.get(player.id);
    if (veh && veh.valid) veh.destroy();
    personalVehicles.delete(player.id);
    for (const obj of spawnedObjects.get(player.id) ?? []) {
        if (obj.valid) obj.destroy();
    }
    spawnedObjects.delete(player.id);
    genders.delete(player.id);
});

alt.on('playerDeath', (player) => {
    alt.setTimeout(() => {
        if (player.valid) {
            spawnPlayer(player, player.pos);
            chat(player, '* Respawned');
        }
    }, RESPAWN_DELAY_MS);
});

// ---------------- Чат и команды ----------------

const commands = {
    help(player) {
        chat(player, '* Player: /gender /ped /heal /armor /god /anim /stopanim /ammo /weapon /guns /clearguns');
        chat(player, '* World: /veh /fix /delveh /tp /weather /time /object /clearobjects /noclip /freecam');
        chat(player, '* Dev: /debug /setclothes /setprop /reload — full list: CMDS button (bottom-right, ~ cursor)');
        chat(player, '* Keys: M menu, T chat, F3 repair, F4 tp to waypoint, F5 noclip, F6 copy coords, F7 photo mode');
    },

    gender(player, arg) {
        const cur = genders.get(player.id) ?? 'm';
        const next = arg === 'm' || arg === 'f' ? arg : cur === 'm' ? 'f' : 'm';
        genders.set(player.id, next);
        (outfits[player.name] ??= {}).gender = next;
        persistOutfits();
        spawnPlayer(player, player.pos);
        chat(player, next === 'm' ? '* Gender: male' : '* Gender: female');
    },

    veh(player, model = 'sultan') {
        spawnVehicleFor(player, String(model).toLowerCase());
    },

    fix(player) {
        if (!player.vehicle) return chat(player, '* You are not in a vehicle');
        player.vehicle.repair();
        chat(player, '* Vehicle repaired');
    },

    tp(player, x, y, z) {
        const [nx, ny, nz] = [Number(x), Number(y), Number(z)];
        if ([nx, ny, nz].some(Number.isNaN)) return chat(player, '* Usage: /tp x y z');
        teleportPlayer(player, nx, ny, nz);
    },

    debug(player) {
        player.emit('debug:open');
    },

    makeup(player) {
        player.emit('makeup:open');
    },

    setclothes(player, comp, drawable, texture = 0) {
        const [c, d, t] = [Number(comp), Number(drawable), Number(texture)];
        if ([c, d, t].some(Number.isNaN) || c < 0 || c > 11 || d < 0) {
            return chat(player, '* Usage: /setclothes comp(0-11) drawable [texture]');
        }
        player.emit('clothes:set', 'comp', c, d, t);
        chat(player, `* Clothes: comp ${c} -> ${d}/${t}`);
    },

    setprop(player, prop, drawable, texture = 0) {
        const [p, d, t] = [Number(prop), Number(drawable), Number(texture)];
        if ([p, d, t].some(Number.isNaN) || ![0, 1, 2, 6, 7].includes(p)) {
            return chat(player, '* Usage: /setprop prop(0,1,2,6,7) drawable [texture], -1 removes');
        }
        player.emit('clothes:set', 'prop', p, d, t);
        chat(player, `* Prop: ${p} -> ${d}/${t}`);
    },

    // перезапуск rpf/dlc-паков с диска (свежесобранную rpf кинул поверх — /reload).
    // Порядок: кик игроков -> рестарт -> ожидание пересборки -> автореконнект
    reload(player) {
        const result = reloadPacks(null);
        if (result) chat(player, `* ${result}`);
        else chat(player, '* Reloading packs — disconnecting first, auto-reconnect when ready...');
    },

    // ---- команды-альтернативы пунктам меню (M) ----

    ammo(player, count = 500) {
        player.emit('core:action', 'ammo', Number(count) || 500);
    },

    weapon(player, name) {
        const weapon = String(name ?? '').toLowerCase();
        if (!/^weapon_[a-z0-9_]+$/.test(weapon)) return chat(player, '* Usage: /weapon weapon_pistol');
        player.giveWeapon(alt.hash(weapon), 500, true);
        chat(player, `* Weapon: ${weapon.replace('weapon_', '')}`);
    },

    guns(player) {
        for (const w of ALL_WEAPONS) player.giveWeapon(alt.hash(w), 500, false);
        chat(player, `* Full arsenal given (${ALL_WEAPONS.length})`);
    },

    clearguns(player) {
        player.removeAllWeapons();
        chat(player, '* All weapons removed');
    },

    heal(player) {
        player.health = 200;
        chat(player, '* Health restored');
    },

    armor(player) {
        player.armour = 100;
        chat(player, '* Armor given');
    },

    god(player) {
        player.emit('core:action', 'god');
    },

    noclip(player) {
        player.emit('core:action', 'noclip');
    },

    freecam(player) {
        player.emit('core:action', 'freecam');
    },

    anim(player, name) {
        const scenario = String(name ?? '').toUpperCase();
        if (!/^[A-Z0-9_@]{3,64}$/.test(scenario)) return chat(player, '* Usage: /anim WORLD_HUMAN_SMOKING');
        player.emit('core:action', 'anim', scenario);
    },

    stopanim(player) {
        player.emit('core:action', 'stopanim');
    },

    weather(player, id) {
        const w = Number(id);
        if (Number.isNaN(w) || w < 0 || w > 14) return chat(player, '* Usage: /weather 0-14');
        for (const p of alt.Player.all) p.setWeather(w);
        chat(player, `* Weather: ${w}`);
    },

    time(player, hour) {
        const h = Number(hour);
        if (Number.isNaN(h) || h < 0 || h > 23) return chat(player, '* Usage: /time 0-23');
        for (const p of alt.Player.all) p.setDateTime(1, 1, 2026, h, 0, 0);
        chat(player, `* Time: ${h}:00`);
    },

    delveh(player) {
        const veh = player.vehicle ?? personalVehicles.get(player.id);
        if (!veh || !veh.valid) return chat(player, '* Nothing to delete');
        if (personalVehicles.get(player.id) === veh) personalVehicles.delete(player.id);
        veh.destroy();
        chat(player, '* Vehicle deleted');
    },

    ped(player, model) {
        const m = String(model ?? '').toLowerCase();
        if (!/^[a-z0-9_]{1,64}$/.test(m)) return chat(player, '* Usage: /ped a_m_y_skater_01');
        try {
            player.model = m;
            player.health = 200;
            chat(player, `* Ped: ${m}`);
        } catch (e) {
            chat(player, `* Unknown ped model: ${m}`);
        }
    },

    object(player, model) {
        const m = String(model ?? '').toLowerCase();
        if (!/^[a-z0-9_]{1,64}$/.test(m)) return chat(player, '* Usage: /object prop_barrel_02a');
        const pos = posInFront(player, 3);
        try {
            const obj = new alt.Object(m, pos, new alt.Vector3(0, 0, 0));
            const list = spawnedObjects.get(player.id) ?? [];
            list.push(obj);
            spawnedObjects.set(player.id, list);
            chat(player, `* Object: ${m}`);
        } catch (e) {
            chat(player, `* Failed to spawn object: ${m}`);
        }
    },

    clearobjects(player) {
        const list = spawnedObjects.get(player.id) ?? [];
        let n = 0;
        for (const obj of list) {
            if (obj.valid) {
                obj.destroy();
                n++;
            }
        }
        spawnedObjects.set(player.id, []);
        chat(player, `* Objects deleted: ${n}`);
    },
};

// алиас на английское/русское написание
commands.armour = commands.armor;

// ---------------- Перезагрузка паков ----------------
// Событий старта ресурсов в JS нет, поэтому после рестарта ждём фиксированную
// паузу (крупный пак пересобирается ~5с). Клиент после кика обычно
// переподключается сам — дёргаем реконнект, только если не вернулся.

let reloadBusy = false;
let reloadGen = 0;
const RELOAD_SETTLE_MS = 8000;

// Кэш клиента на этой же машине: битые остатки пака после крашей дают
// старый контент и падения при листании. Чистим во время /reload, пока
// игрок кикнут и файлы не залочены.
function getClientCachePath() {
    try {
        const cfg = JSON.parse(fs.readFileSync(
            `${process.env.APPDATA}\\majestic-launcher\\Multiplayer\\majestic.json`, 'utf8'));
        return cfg.cachePath || null;
    } catch (e) {
        return null;
    }
}

function purgeClientPackCache(packNames) {
    const cachePath = getClientCachePath();
    if (!cachePath) return;
    let removed = 0;
    let locked = 0;
    try {
        for (const dir of fs.readdirSync(cachePath)) {
            const full = `${cachePath}\\${dir}`;
            let files;
            try { files = fs.readdirSync(full); } catch (e) { continue; }
            for (const f of files) {
                if (!packNames.some((n) => f.startsWith(`${n}.resource`))) continue;
                try {
                    fs.unlinkSync(`${full}\\${f}`);
                    removed++;
                } catch (e) {
                    locked++;
                }
            }
        }
    } catch (e) { /* пусто */ }
    if (removed) log(`client pack cache purged: ${removed} file(s)`);
    if (locked) log(`~ly~client cache locked (${locked} file(s)) — close the game fully if stale clothes persist`);
}

function getRestartFn() {
    if (alt.Resource && typeof alt.Resource.restart === 'function') {
        return (name) => alt.Resource.restart(name);
    }
    if (typeof alt.restartResource === 'function') {
        return (name) => alt.restartResource(name);
    }
    return null;
}

// names = null -> все не-js паки. Возвращает текст ошибки или null при старте.
function reloadPacks(names) {
    const restartFn = getRestartFn();
    if (!restartFn) return 'Resource restart API unavailable — restart the server';
    if (reloadBusy) return 'Reload already in progress — wait for it to finish';

    let packs;
    try {
        const all = (alt.Resource && alt.Resource.all) ? alt.Resource.all : [];
        packs = all.filter((r) => r.type !== 'js').map((r) => r.name);
    } catch (e) {
        return `Cannot enumerate resources: ${e.message}`;
    }
    if (names) packs = packs.filter((n) => names.includes(n));
    if (!packs.length) return 'No packs found to reload';

    reloadBusy = true;
    const gen = ++reloadGen;
    alt.emitAllClients('packs:prepareReload');

    alt.setTimeout(() => {
        // Кик ДО пересборки: alt:V пушит рестарт ресурса подключённым клиентам,
        // и горячая подмена rpf в живой сессии крашит игру (ZLib inflate error)
        for (const p of alt.Player.all) {
            try { p.kick('Packs reloading — reconnecting shortly'); } catch (e) { /* пусто */ }
        }

        alt.setTimeout(() => {
            if (gen !== reloadGen) return;
            // игрок кикнут — клиент отпустил файлы кэша, чистим их от старого пака
            purgeClientPackCache(packs);
            let ok = 0;
            for (const name of packs) {
                try {
                    restartFn(name);
                    ok++;
                    log(`pack restart requested: ${name}`);
                } catch (e) {
                    log(`pack restart failed: ${name}: ${e.message}`);
                }
            }
            log(ok ? `rebuilding ${ok} pack(s), settling ${RELOAD_SETTLE_MS / 1000}s...` : 'all pack restarts failed — bringing player back');

            alt.setTimeout(() => {
                reloadBusy = false;
                if (gen !== reloadGen) return;
                if (alt.Player.all.length > 0) {
                    // клиент вернулся сам — второй раз не дёргаем
                    log('player already reconnected on their own');
                    return;
                }
                tryClientReconnect();
            }, RELOAD_SETTLE_MS);
        }, 3000); // пауза после кика: клиент должен отпустить файлы кэша
    }, 300);

    return null;
}

// Автореконнект: клиент alt:V в debug-режиме слушает 127.0.0.1:9223 —
// сервер локальный, поэтому можем дёрнуть /reconnect сами
function tryClientReconnect(attempt = 1) {
    const req = http.request(
        { host: '127.0.0.1', port: 9223, path: '/reconnect', method: 'POST', timeout: 3000 },
        (res) => {
            log(`client auto-reconnect: HTTP ${res.statusCode}`);
            res.resume();
        },
    );
    req.on('error', (e) => {
        if (attempt < 3) {
            log(`auto-reconnect attempt ${attempt} failed (${e.message}), retrying in 3s...`);
            alt.setTimeout(() => tryClientReconnect(attempt + 1), 3000);
        } else {
            log(`client auto-reconnect unavailable (${e.message}) — reconnect manually via F8`);
        }
    });
    req.end();
}

alt.onClient('chat:send', (player, raw) => {
    const text = String(raw ?? '').trim();
    if (!text) return;

    if (text.startsWith('/')) {
        const [name, ...args] = text.slice(1).split(/\s+/);
        const cmd = commands[name.toLowerCase()];
        if (!cmd) {
            // красный алерт по центру экрана + строка в чат
            alt.emitClient(player, 'cmd:alert', `/${name} — command not found`);
            return chat(player, `* Unknown command: /${name}. /help for list`);
        }
        try {
            cmd(player, ...args);
        } catch (e) {
            log(`[cmd] /${name} error: ${e.message}`);
            alt.emitClient(player, 'cmd:alert', `/${name} — failed`);
        }
        return;
    }

    if (text.length > 256) return;
    log(`[chat] ${player.name}: ${text}`);
    alt.emitAllClients('chat:msg', `${player.name}: ${text}`);
});

// ---------------- События с клиента (клавиши) ----------------

alt.onClient('core:spawnVehicle', (player, model = 'sultan') => spawnVehicleFor(player, model));

alt.onClient('core:fixVehicle', (player) => commands.fix(player));

alt.onClient('core:teleport', (player, x, y, z) => {
    teleportPlayer(player, x, y, z);
    chat(player, '* Teleported to waypoint');
});

// ---------------- Раскладка панелек дебага (hudlayout.json) ----------------
// Хранится ГЛОБАЛЬНО, без привязки к нику — один конфиг на сервер

const LAYOUT_PATH = 'hudlayout.json';
let hudLayout = null;
let layoutSaveTimer = null;
try {
    const raw = JSON.parse(fs.readFileSync(LAYOUT_PATH, 'utf8'));
    if (raw && typeof raw === 'object') {
        const keys = Object.keys(raw);
        const looksGlobal = keys.some((k) => k.startsWith('comp-') || k.startsWith('prop-') || k === '__ts');
        if (looksGlobal) {
            hudLayout = raw;
        } else {
            // миграция со старого пер-никового формата — берём самую свежую запись
            let best = null;
            for (const k of keys) {
                const v = raw[k];
                if (!v || typeof v !== 'object') continue;
                if (!best || Number(v.__ts ?? 0) > Number(best.__ts ?? 0)) best = v;
            }
            hudLayout = best;
            if (hudLayout) persistLayouts();
        }
    }
} catch (e) { /* файла ещё нет */ }

function persistLayouts() {
    if (layoutSaveTimer) alt.clearTimeout(layoutSaveTimer);
    layoutSaveTimer = alt.setTimeout(() => {
        layoutSaveTimer = null;
        try {
            fs.writeFileSync(LAYOUT_PATH, JSON.stringify(hudLayout ?? {}, null, 2));
        } catch (e) {
            log(`layout save failed: ${e.message}`);
        }
    }, 500);
}

alt.onClient('layout:save', (player, layout) => {
    if (!layout || typeof layout !== 'object') return;
    if (JSON.stringify(layout).length > 8192) return;
    hudLayout = layout;
    persistLayouts();
});

alt.onClient('layout:request', (player) => {
    if (hudLayout) player.emit('layout:apply', hudLayout);
});

// ---------------- Одежда: сохранение и выдача ----------------

// клиент просит свой сохранённый аутфит после каждого спавна
alt.onClient('outfit:request', (player) => {
    const g = genders.get(player.id) ?? 'm';
    const outfit = outfits[player.name]?.[g];
    if (outfit) player.emit('outfit:apply', outfit);
});

alt.onClient('outfit:save', (player, outfit) => {
    if (!outfit || typeof outfit !== 'object') return;
    if (JSON.stringify(outfit).length > 4096) return;
    // пол берём из payload (клиент снял его с модели в момент сбора):
    // серверный genders мог уже смениться /gender'ом, пока сейв летел
    const g = outfit.gender === 'f' || outfit.gender === 'm'
        ? outfit.gender
        : (genders.get(player.id) ?? 'm');
    const rec = outfits[player.name] ??= {};
    rec.gender = genders.get(player.id) ?? g;
    rec[g] = outfit;
    persistOutfits();
});

alt.onClient('outfit:reset', (player) => {
    const g = genders.get(player.id) ?? 'm';
    const rec = outfits[player.name];
    if (rec && rec[g]) {
        delete rec[g];
        persistOutfits();
    }
    chat(player, '* Outfit reset to default');
});

// Кладём текст в буфер Windows через clip.exe — сервер локальный,
// это тот же ПК, где сидит игрок (execCommand из WebView не работает)
alt.onClient('core:copyCoords', (player, text) => {
    const t = String(text ?? '').slice(0, 256);
    if (!t) return;
    try {
        const proc = spawn('clip');
        proc.on('error', () => chat(player, '* Failed to write clipboard'));
        proc.stdin.write(t);
        proc.stdin.end();
    } catch (e) {
        chat(player, '* Failed to write clipboard');
    }
});

// ---------------- Меню (M) ----------------

alt.onClient('menu:heal', (player) => {
    player.health = 200;
    chat(player, '* Health restored');
});

alt.onClient('menu:armour', (player) => {
    player.armour = 100;
    chat(player, '* Armor given');
});

alt.onClient('menu:gender', (player, g) => commands.gender(player, g));

alt.onClient('menu:pedmodel', (player, model) => {
    const m = String(model ?? '').toLowerCase();
    if (!/^[a-z0-9_]{1,64}$/.test(m)) return;
    try {
        player.model = m;
        player.health = 200;
        chat(player, `* Ped: ${m}`);
    } catch (e) {
        chat(player, `* Unknown ped model: ${m}`);
    }
});

alt.onClient('menu:tp', (player, x, y, z) => {
    const [nx, ny, nz] = [Number(x), Number(y), Number(z)];
    if ([nx, ny, nz].some(Number.isNaN)) return;
    teleportPlayer(player, nx, ny, nz);
    chat(player, `* Teleported to: ${nx.toFixed(1)}, ${ny.toFixed(1)}, ${nz.toFixed(1)}`);
});

alt.onClient('menu:weather', (player, id) => {
    const w = Number(id);
    if (Number.isNaN(w) || w < 0 || w > 14) return;
    for (const p of alt.Player.all) p.setWeather(w);
    log(`${player.name} set weather ${w}`);
});

alt.onClient('menu:time', (player, hour) => {
    const h = Number(hour);
    if (Number.isNaN(h) || h < 0 || h > 23) return;
    for (const p of alt.Player.all) p.setDateTime(1, 1, 2026, h, 0, 0);
    log(`${player.name} set time ${h}:00`);
});

alt.onClient('menu:weapon', (player, name) => {
    const weapon = String(name ?? '').toLowerCase();
    if (!/^weapon_[a-z0-9_]+$/.test(weapon)) return;
    player.giveWeapon(alt.hash(weapon), 500, true);
    chat(player, `* Weapon: ${weapon.replace('weapon_', '')}`);
});

alt.onClient('menu:weaponAll', (player) => {
    for (const w of ALL_WEAPONS) player.giveWeapon(alt.hash(w), 500, false);
    chat(player, `* Full arsenal given (${ALL_WEAPONS.length})`);
});

alt.onClient('menu:weaponsClear', (player) => {
    player.removeAllWeapons();
    chat(player, '* All weapons removed');
});

alt.onClient('menu:vehicle', (player, model) => {
    const m = String(model ?? '').toLowerCase();
    if (!/^[a-z0-9_]{1,32}$/.test(m)) return;
    spawnVehicleFor(player, m);
});

alt.onClient('menu:vehRepair', (player) => commands.fix(player));

alt.onClient('menu:vehDelete', (player) => {
    const veh = player.vehicle ?? personalVehicles.get(player.id);
    if (!veh || !veh.valid) return chat(player, '* Nothing to delete');
    if (personalVehicles.get(player.id) === veh) personalVehicles.delete(player.id);
    veh.destroy();
    chat(player, '* Vehicle deleted');
});

alt.onClient('menu:object', (player, model) => {
    const m = String(model ?? '').toLowerCase();
    if (!/^[a-z0-9_]{1,64}$/.test(m)) return;
    const pos = posInFront(player, 3);
    try {
        const obj = new alt.Object(m, pos, new alt.Vector3(0, 0, 0));
        const list = spawnedObjects.get(player.id) ?? [];
        list.push(obj);
        spawnedObjects.set(player.id, list);
        chat(player, `* Object: ${m}`);
    } catch (e) {
        chat(player, `* Failed to spawn object: ${m}`);
    }
});

alt.onClient('menu:objectsClear', (player) => {
    const list = spawnedObjects.get(player.id) ?? [];
    let n = 0;
    for (const obj of list) {
        if (obj.valid) {
            obj.destroy();
            n++;
        }
    }
    spawnedObjects.set(player.id, []);
    chat(player, `* Objects deleted: ${n}`);
});

// ---------------- Консоль сервера ----------------

alt.on('consoleCommand', (cmd, ...args) => {
    switch (cmd) {
        case 'players': {
            log(`online: ${alt.Player.all.length}`);
            for (const p of alt.Player.all) log(`  [${p.id}] ${p.name} ${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(1)}, ${p.pos.z.toFixed(1)}`);
            break;
        }
        case 'veh': {
            const [model = 'sultan', id] = args;
            const target = id !== undefined ? alt.Player.all.find((p) => p.id === Number(id)) : alt.Player.all[0];
            if (!target) return log('player not found');
            spawnVehicleFor(target, model);
            break;
        }
        case 'tp': {
            const [id, x, y, z] = args.map(Number);
            const target = alt.Player.all.find((p) => p.id === id);
            if (!target) return log('player not found');
            teleportPlayer(target, x, y, z);
            break;
        }
        case 'weather': {
            const w = Number(args[0] ?? 0);
            for (const p of alt.Player.all) p.setWeather(w);
            log(`weather: ${w}`);
            break;
        }
        case 'time': {
            const h = Number(args[0] ?? 12);
            for (const p of alt.Player.all) p.setDateTime(1, 1, 2026, h, 0, 0);
            log(`time: ${h}:00`);
            break;
        }
        case 'reload': {
            // тот же безопасный путь, что и /reload из чата: кик -> рестарт ->
            // реконнект (горячий своп rpf под игроками крашит клиент)
            const name = args[0];
            const result = reloadPacks(name ? [name] : null);
            log(result ? `reload: ${result}` : `reload started${name ? `: ${name}` : ' (all packs)'}`);
            break;
        }
        default:
            log(`unknown command: ${cmd}. available: players, veh, tp, weather, time, reload`);
    }
});

// ---------------- Отчёт о загруженных паках ----------------
// Через секунду после старта перечисляем все ресурсы (js, dlc, rpf и т.д.):
// зелёные — загрузились, красные — объявлены в server.toml, но не поднялись

alt.setTimeout(() => {
    try {
        const resources = alt.Resource.all;
        let ok = 0;
        let failed = 0;
        for (const r of resources) {
            // у rpf/dlc-ресурсов isStarted не выставляется — смотрим только valid
            const started = r.type === 'js' ? (r.isStarted !== false && r.valid !== false) : r.valid !== false;
            if (started) {
                ok++;
                alt.log(`~lg~[core] pack OK: ${r.name} (type: ${r.type})`);
            } else {
                failed++;
                alt.log(`~lr~[core] pack FAILED: ${r.name} (type: ${r.type})`);
            }
        }
        alt.log(`~lc~[core] packs: ${resources.length} total, ${ok} ok, ${failed} failed`);
    } catch (e) {
        log(`resource report unavailable: ${e.message}`);
    }
}, 1000);

log('core resource started');
