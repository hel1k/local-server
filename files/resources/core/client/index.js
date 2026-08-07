import * as alt from 'alt-client';
import * as native from 'natives';

const view = new alt.WebView('http://resource/ui/hud.html');
let uiOpen = false;

const ped = () => alt.Player.local.scriptID;

function localMsg(text) {
    view.emit('chat:msg', text);
}

// ---------------- Сервер -> HUD ----------------

alt.onServer('chat:msg', (text) => view.emit('chat:msg', text));
alt.onServer('cmd:alert', (text) => view.emit('cmd:alert', text));
alt.onServer('debug:open', () => openUI('debug'));

// ---------------- Открытие/закрытие интерфейса ----------------

let currentScreen = null;
let controlsDisabled = false;

function openUI(screen, arg = null) {
    if (uiOpen) return;
    uiOpen = true;
    currentScreen = screen;
    // меню не блокирует управление (можно рулить с открытым меню),
    // чат — блокирует, чтобы WASD не дёргал перса при наборе текста
    if (screen === 'chat') {
        alt.toggleGameControls(false);
        controlsDisabled = true;
    }
    view.focus();
    view.emit('ui:open', screen, arg);
}

view.on('ui:closed', () => {
    uiOpen = false;
    currentScreen = null;
    if (!cursorShown) view.unfocus(); // при видимом курсоре фокус нужен для кликов
    if (controlsDisabled) {
        alt.toggleGameControls(true);
        controlsDisabled = false;
    }
});

// Единственная точка управления курсором: alt.showCursor ведёт счётчик,
// и повторное скрытие кидает "Cursor state can't go < 0" — гасим дубли.
// При курсоре фокусируем webview — иначе клики не доходят до страницы.
// cursorOwner: 'user' — включён тильдой, 'ui' — доской; UI не гасит пользовательский
let cursorOwner = null;

function setCursor(show) {
    const next = Boolean(show);
    if (cursorShown === next) return;
    cursorShown = next;
    try {
        alt.showCursor(next);
    } catch (e) { /* счётчик уже в нуле */ }
    if (next) view.focus();
    else if (!uiOpen) view.unfocus();
}

view.on('ui:cursor', (show) => {
    if (show) {
        if (!cursorShown) {
            setCursor(true);
            cursorOwner = 'ui';
        }
    } else if (cursorOwner !== 'user') {
        setCursor(false);
        cursorOwner = null;
    }
});

// пока виден курсор — глушим атаки/прицел, обзор камеры (1, 2) и колесо
// выбора оружия/радио (14-17, 37, 81-85, 99, 100): скролл по UI не должен
// открывать игровые кружки
const CURSOR_BLOCKED_CONTROLS = [
    1, 2, 14, 15, 16, 17, 24, 25, 37, 47, 58, 68, 69, 70,
    81, 82, 83, 84, 85, 91, 92, 99, 100, 106, 122,
    140, 141, 142, 143, 257, 263, 264, 331,
];
alt.everyTick(() => {
    if (!cursorShown) return;
    for (const c of CURSOR_BLOCKED_CONTROLS) native.disableControlAction(0, c, true);
});

// при наборе текста в поле UI глушим управление игрой и клавиши-бинды;
// обратно включаем только если сами выключали
let uiTyping = false;
view.on('ui:typing', (typing) => {
    uiTyping = Boolean(typing);
    if (currentScreen === 'chat') return; // там управлением владеет openUI
    if (uiTyping) {
        alt.toggleGameControls(false);
        controlsDisabled = true;
    } else if (controlsDisabled) {
        alt.toggleGameControls(true);
        controlsDisabled = false;
    }
});

view.on('chat:send', (text) => alt.emitServer('chat:send', text));

// ---------------- Действия из меню ----------------

const SERVER_ACTIONS = [
    'weather', 'time', 'weapon', 'weaponAll', 'weaponsClear',
    'vehicle', 'vehRepair', 'vehDelete', 'object', 'objectsClear',
    'heal', 'armour', 'gender', 'pedmodel',
];

// патроны для оружия в руках (нативом, чисто клиентский дев-инструмент)
function giveAmmo(count) {
    const w = currentWeapon();
    if (!w) {
        localMsg('* Take a weapon in hands first');
        return;
    }
    const n = Math.max(1, Math.min(Number(count) || 500, 9999));
    try { native.setPedAmmo(ped(), w, n, false); }
    catch (e) { try { native.setPedAmmo(ped(), w, n); } catch (e2) { /* пусто */ } }
    localMsg(`* Ammo: ${n}`);
}

// команды, которые исполняются на клиенте (/god /noclip /freecam /anim /ammo...)
alt.onServer('core:action', (type, value) => {
    switch (type) {
        case 'god': toggleGodmode(); break;
        case 'noclip': toggleNoclip(); break;
        case 'freecam': toggleFreecam(); break;
        case 'anim': playAnim({ type: 'scenario', a: String(value ?? '') }); break;
        case 'stopanim': stopAnim(); break;
        case 'ammo': giveAmmo(value); break;
    }
});

view.on('menu:action', (type, value) => {
    switch (type) {
        case 'noclip':
            toggleNoclip();
            break;
        case 'godmode':
            toggleGodmode();
            break;
        case 'ammo':
            giveAmmo(value);
            break;
        case 'freecam':
            toggleFreecam();
            break;
        case 'anim':
            playAnim(value);
            break;
        case 'animStop':
            stopAnim();
            break;
        case 'tpWaypoint':
            tpToWaypoint();
            break;
        case 'tp':
            if (Array.isArray(value) && value.length === 3) {
                alt.emitServer('menu:tp', Number(value[0]), Number(value[1]), Number(value[2]));
            }
            break;
        default:
            if (SERVER_ACTIONS.includes(type)) alt.emitServer(`menu:${type}`, value);
    }
});

// копирование в системный буфер идёт через сервер (он на этом же ПК),
// потому что execCommand в WebView не достаёт до буфера Windows
view.on('clip:copy', (text) => alt.emitServer('core:copyCoords', String(text)));

// ---------------- Анимации ----------------

let animActive = false;

async function playAnim(v) {
    if (!v) return;
    native.clearPedTasks(ped());
    if (v.type === 'scenario') {
        native.taskStartScenarioInPlace(ped(), v.a, 0, true);
    } else {
        native.requestAnimDict(v.a);
        for (let i = 0; i < 50 && !native.hasAnimDictLoaded(v.a); i++) {
            await alt.Utils.wait(20);
        }
        if (native.hasAnimDictLoaded(v.a)) {
            native.taskPlayAnim(ped(), v.a, v.b, 8.0, -8.0, -1, 1, 0, false, false, false);
        }
    }
    animActive = true;
    view.emit('hud:mode', 'anim', true);
}

function stopAnim() {
    native.clearPedTasks(ped());
    animActive = false;
    view.emit('hud:mode', 'anim', false);
}

// ---------------- Координаты в HUD ----------------

alt.setInterval(() => {
    const p = alt.Player.local;
    if (!p || !p.valid) return;
    let heading = 0;
    try {
        heading = native.getEntityHeading(p.scriptID);
    } catch (e) { /* пусто */ }
    view.emit('hud:coords', p.pos.x, p.pos.y, p.pos.z, heading);
}, 100);

// FPS/frametime/ping — каждый кадр (быстрее некуда).
// Загрузку GPU/CPU/ОЗУ клиент alt:V не отдаёт — таких API/нативов нет.
const hasGetFps = typeof alt.getFps === 'function';
const hasGetPing = typeof alt.getPing === 'function';

alt.everyTick(() => {
    let fps;
    if (hasGetFps) {
        fps = alt.getFps();
    } else {
        const ft = native.getFrameTime();
        fps = ft > 0 ? 1 / ft : 0;
    }
    const ping = hasGetPing ? alt.getPing() : -1;
    view.emit('hud:fps', fps, ping);
});

// ---------------- Бессмертие ----------------

let godmode = false;

function toggleGodmode() {
    godmode = !godmode;
    native.setEntityInvincible(ped(), godmode);
    localMsg(godmode ? '* God mode ON' : '* God mode OFF');
}

// ---------------- Noclip ----------------
// F5 — вкл/выкл (пед невидим), WASD — полёт за камерой,
// Space — вверх, Ctrl — вниз, Shift — скорость (3 уровня)

// метров за тик: cinematic (~1.5 м/с) / slow / normal / fast
const NOCLIP_SPEEDS = [0.025, 0.2, 1.0, 4.0];
let noclip = false;
let noclipSpeed = 2;
let noclipTick = null;

function speedLabel() {
    return `${noclipSpeed + 1}/${NOCLIP_SPEEDS.length}`;
}

function toggleNoclip() {
    noclip = !noclip;

    if (noclip) {
        native.clearPedTasksImmediately(ped());
        native.freezeEntityPosition(ped(), true);
        native.setEntityCollision(ped(), false, false);
        native.setEntityInvincible(ped(), true);
        native.setEntityVisible(ped(), false, false); // перс исчезает
        noclipTick = alt.everyTick(noclipMove);
        view.emit('hud:mode', 'noclip', true);
        localMsg(`* Noclip ON (speed ${speedLabel()}, Shift to cycle)`);
    } else {
        if (noclipTick !== null) {
            alt.clearEveryTick(noclipTick);
            noclipTick = null;
        }
        native.freezeEntityPosition(ped(), false);
        native.setEntityCollision(ped(), true, true);
        native.setEntityInvincible(ped(), godmode); // не сбрасываем бессмертие из меню
        native.setEntityVisible(ped(), true, false);
        view.emit('hud:mode', 'noclip', false);
        localMsg('* Noclip OFF');
    }
}

function noclipMove() {
    const speed = NOCLIP_SPEEDS[noclipSpeed];
    const camRot = native.getGameplayCamRot(2);
    const radZ = (camRot.z * Math.PI) / 180;
    const radX = (camRot.x * Math.PI) / 180;

    const fwd = {
        x: -Math.sin(radZ) * Math.cos(radX),
        y: Math.cos(radZ) * Math.cos(radX),
        z: Math.sin(radX),
    };
    const right = { x: Math.cos(radZ), y: Math.sin(radZ) };

    let dx = 0, dy = 0, dz = 0;

    if (native.isControlPressed(0, 32)) { dx += fwd.x; dy += fwd.y; dz += fwd.z; }   // W
    if (native.isControlPressed(0, 33)) { dx -= fwd.x; dy -= fwd.y; dz -= fwd.z; }   // S
    if (native.isControlPressed(0, 34)) { dx -= right.x; dy -= right.y; }            // A
    if (native.isControlPressed(0, 35)) { dx += right.x; dy += right.y; }            // D
    if (native.isControlPressed(0, 22)) dz += 1;                                     // Space
    if (native.isControlPressed(0, 36)) dz -= 1;                                     // Ctrl

    if (dx === 0 && dy === 0 && dz === 0) return;

    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const pos = alt.Player.local.pos;
    native.setEntityCoordsNoOffset(
        ped(),
        pos.x + (dx / len) * speed,
        pos.y + (dy / len) * speed,
        pos.z + (dz / len) * speed,
        false, false, false,
    );
}

// ---------------- Браузер одежды (/debug) ----------------
// Нативы перечисляют все дравейблы, включая DLC и аддон-паки.
// Применение локальное + аутфит сохраняется на сервере (outfits.json).

const COMPS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const PROPS = [0, 1, 2, 6, 7];

function getPropIndex(comp) {
    try { return native.getPedPropIndex(ped(), comp, 0); }
    catch (e) { return native.getPedPropIndex(ped(), comp); }
}

function setPropIndex(comp, drawable, texture) {
    if (drawable < 0) {
        try { native.clearPedProp(ped(), comp, 0); }
        catch (e) { native.clearPedProp(ped(), comp); }
        return;
    }
    try { native.setPedPropIndex(ped(), comp, drawable, texture, true, 0); }
    catch (e) { native.setPedPropIndex(ped(), comp, drawable, texture, true); }
}

function catInfo(kind, comp) {
    if (kind === 'comp') {
        const drawable = native.getPedDrawableVariation(ped(), comp);
        const texture = native.getPedTextureVariation(ped(), comp);
        const drawables = native.getNumberOfPedDrawableVariations(ped(), comp);
        const textures = native.getNumberOfPedTextureVariations(ped(), comp, drawable);
        return { kind, comp, drawable, texture, drawables, textures };
    }
    const drawable = getPropIndex(comp);
    const texture = drawable >= 0 ? native.getPedPropTextureIndex(ped(), comp) : 0;
    const drawables = native.getNumberOfPedPropDrawableVariations(ped(), comp);
    const textures = drawable >= 0 ? native.getNumberOfPedPropTextureVariations(ped(), comp, drawable) : 0;
    return { kind, comp, drawable, texture, drawables, textures };
}

function debugInfo(kind, comp) {
    view.emit('debug:info', catInfo(kind, comp));
}

view.on('debug:select', (kind, comp) => debugInfo(kind, comp));

// данные сразу по всем категориям — для доски панелек
view.on('debug:selectAll', () => {
    const list = [];
    for (const c of COMPS) list.push(catInfo('comp', c));
    for (const p of PROPS) list.push(catInfo('prop', p));
    view.emit('debug:infoAll', list);
});

view.on('debug:set', (kind, comp, drawable, texture) => {
    // пользователь сам меняет слот — защита сейва этого слота больше не нужна
    if (kind === 'comp') fallbackComps.delete(comp);
    else fallbackProps.delete(comp);

    let applied = true;
    if (kind === 'comp') {
        native.setPedComponentVariation(ped(), comp, drawable, texture, 2);
        applied = native.getPedDrawableVariation(ped(), comp) === drawable;
    } else {
        setPropIndex(comp, drawable, texture);
        applied = getPropIndex(comp) === drawable;
    }
    // отчёт по ЗАПРОШЕННОМУ индексу — листание не залипает на битых айди,
    // невалидные просто помечаются в UI восклицательным знаком
    const info = catInfo(kind, comp);
    info.drawable = drawable;
    info.texture = texture;
    info.applied = applied;
    if (kind === 'comp' && drawable >= 0) {
        info.textures = native.getNumberOfPedTextureVariations(ped(), comp, drawable);
    }
    view.emit('debug:info', info);
    scheduleOutfitSave();
});

// перед перезапуском паков: сначала ФЛАШИМ несохранённые правки одежды
// (иначе последние 500мс правок теряются), потом снимаем вещи пака
// (иначе выгрузка rpf крашит игру) и глушим автосохранение до респавна
alt.onServer('packs:prepareReload', () => {
    if (outfitTimer) {
        alt.clearTimeout(outfitTimer);
        outfitTimer = null;
        alt.emitServer('outfit:save', collectOutfit());
    }
    outfitSuppress = true; // долетающие debug:set не должны сохранить раздетого педа
    view.emit('ui:forceClose');
    native.setPedDefaultComponentVariation(ped());
    for (const p of PROPS) setPropIndex(p, -1, 0);
});

// прямое применение с сервера (/setclothes, /setprop)
alt.onServer('clothes:set', (kind, comp, drawable, texture) => {
    if (kind === 'comp') {
        native.setPedComponentVariation(ped(), comp, drawable, texture, 2);
    } else {
        setPropIndex(comp, drawable, texture);
    }
    scheduleOutfitSave();
});

// раскладка панелек дебага хранится на сервере (localStorage WebView ненадёжен)
view.on('layout:save', (layout) => alt.emitServer('layout:save', layout));
view.on('ui:ready', () => alt.emitServer('layout:request'));
alt.onServer('layout:apply', (layout) => view.emit('layout:apply', layout));

view.on('debug:reset', () => {
    // отменяем висящий автосейв, иначе он через 500мс перезапишет reset
    if (outfitTimer) {
        alt.clearTimeout(outfitTimer);
        outfitTimer = null;
    }
    fallbackComps.clear();
    fallbackProps.clear();
    faceState = defaultFace();
    native.setPedDefaultComponentVariation(ped());
    for (const p of PROPS) setPropIndex(p, -1, 0);
    applyFace();
    alt.emitServer('outfit:reset');
    const list = [];
    for (const c of COMPS) list.push(catInfo('comp', c));
    for (const p of PROPS) list.push(catInfo('prop', p));
    view.emit('debug:infoAll', list);
});

// ---------------- Creator: внешность freemode-педа ----------------

function defaultFace() {
    return {
        shapeFirst: 0, shapeSecond: 0, skinFirst: 0, skinSecond: 0,
        shapeMix: 0.5, skinMix: 0.5, features: {},
        hair: 0, hairColor: 0, hairHighlight: 0,
        eyebrows: 0, eyebrowsColor: 0,
        beard: -1, beardColor: 0, eyeColor: 0,
        overlays: {}, // макияж и кожные слои: { id: { i, o, c1, c2 } }
    };
}

// какие оверлеи красятся makeup-палитрой (тип 2)
const MAKEUP_COLOR_TYPE = { 4: 2, 5: 2, 8: 2 };
const MAKEUP_OVERLAY_IDS = [0, 3, 4, 5, 6, 7, 8, 9];

let faceState = defaultFace();

// имя натива черт лица гуляет между билдами — подбираем доступный
const faceFeatureFn =
    typeof native.setPedFaceFeature === 'function' ? native.setPedFaceFeature
        : typeof native.setPedMicroMorphValue === 'function' ? native.setPedMicroMorphValue
            : typeof native.setPedMicroMorph === 'function' ? native.setPedMicroMorph
                : null;
if (!faceFeatureFn) alt.log('[core] face feature native not found in this build — sliders disabled');

function applyFace() {
    const f = faceState;
    const p = ped();
    // каждая часть отдельно, чтобы сбой одной не ломал остальные
    try {
        native.setPedHeadBlendData(p, f.shapeFirst, f.shapeSecond, 0, f.skinFirst, f.skinSecond, 0, f.shapeMix, f.skinMix, 0, false);
    } catch (e) { /* пусто */ }
    if (faceFeatureFn) {
        try {
            for (let i = 0; i < 20; i++) faceFeatureFn(p, i, Number(f.features[i] ?? 0));
        } catch (e) { /* пусто */ }
    }
    try { native.setPedComponentVariation(p, 2, f.hair, 0, 2); } catch (e) { /* пусто */ }
    try { native.setPedHairTint(p, f.hairColor, f.hairHighlight); }
    catch (e) { try { native.setPedHairColor(p, f.hairColor, f.hairHighlight); } catch (e2) { /* пусто */ } }
    try {
        native.setPedHeadOverlay(p, 1, f.beard < 0 ? 255 : f.beard, 1.0);
        native.setPedHeadOverlayColor(p, 1, 1, f.beardColor, f.beardColor);
        native.setPedHeadOverlay(p, 2, f.eyebrows < 0 ? 255 : f.eyebrows, 1.0);
        native.setPedHeadOverlayColor(p, 2, 1, f.eyebrowsColor, f.eyebrowsColor);
    } catch (e) { /* пусто */ }
    try { native.setPedEyeColor(p, f.eyeColor); } catch (e) { /* пусто */ }
    // макияж и кожные слои (нативы видят и DLC-оверлеи из facial_overlays)
    try {
        const ov = f.overlays ?? {};
        for (const idStr of Object.keys(ov)) {
            const id = Number(idStr);
            if (!MAKEUP_OVERLAY_IDS.includes(id)) continue;
            const s = ov[idStr] ?? {};
            const idx = Number(s.i);
            const opacity = Math.min(Math.max(Number(s.o ?? 1), 0), 1);
            native.setPedHeadOverlay(p, id, (Number.isNaN(idx) || idx < 0) ? 255 : idx, opacity);
            const colorType = MAKEUP_COLOR_TYPE[id];
            if (colorType) native.setPedHeadOverlayColor(p, id, colorType, Number(s.c1) || 0, Number(s.c2) || 0);
        }
    } catch (e) { /* пусто */ }
}

view.on('face:apply', (s) => {
    if (!s || typeof s !== 'object') return;
    faceState = s;
    applyFace();
    scheduleOutfitSave();
});

view.on('face:request', () => view.emit('face:state', faceState));

// ---------------- Студия макияжа ----------------
// камера смотрит на лицо и управляется: A/D — орбита вокруг головы,
// W/S — выше/ниже, колесо мыши — ближе/дальше

let faceCam = null;
let faceCamTick = null;
const faceOrbit = { angle: 0, height: 0.08, dist: 0.65 };

function faceCamUpdate() {
    if (faceCam === null) return;
    // глушим ВЕСЬ игровой ввод по-кадрово: пед не ходит, не бьёт и не крутится,
    // а клавиши читаем через disabled-нативы только для камеры
    native.disableAllControlActions(0);

    if (native.isDisabledControlPressed(0, 34)) faceOrbit.angle += 1.6;                                   // A
    if (native.isDisabledControlPressed(0, 35)) faceOrbit.angle -= 1.6;                                   // D
    if (native.isDisabledControlPressed(0, 32)) faceOrbit.height = Math.min(faceOrbit.height + 0.004, 0.5);   // W
    if (native.isDisabledControlPressed(0, 33)) faceOrbit.height = Math.max(faceOrbit.height - 0.004, -0.3);  // S
    // зум: Q ближе / E дальше (колесо в этом режиме игра перехватывает)
    if (native.isDisabledControlPressed(0, 44)) faceOrbit.dist = Math.max(faceOrbit.dist - 0.012, 0.22);      // Q
    if (native.isDisabledControlPressed(0, 38)) faceOrbit.dist = Math.min(faceOrbit.dist + 0.012, 2.5);       // E
    // и колесо тоже пробуем — где работает, там работает
    if (native.isDisabledControlJustPressed(0, 241) || native.isDisabledControlJustPressed(0, 14)) {
        faceOrbit.dist = Math.max(faceOrbit.dist - 0.07, 0.22);
    }
    if (native.isDisabledControlJustPressed(0, 242) || native.isDisabledControlJustPressed(0, 15)) {
        faceOrbit.dist = Math.min(faceOrbit.dist + 0.07, 2.5);
    }

    const head = native.getPedBoneCoords(ped(), 31086, 0, 0, 0); // SKEL_Head
    const ang = ((native.getEntityHeading(ped()) + faceOrbit.angle) * Math.PI) / 180;
    native.setCamCoord(
        faceCam,
        head.x - Math.sin(ang) * faceOrbit.dist,
        head.y + Math.cos(ang) * faceOrbit.dist,
        head.z + faceOrbit.height,
    );
    // целимся чуть выше центра головы, чтобы макушка не резалась
    native.pointCamAtCoord(faceCam, head.x, head.y, head.z + 0.1);
}

// полная заморозка педа на время студии: freezeEntityPosition держит только
// позицию, а idle-анимации продолжают играть — пед переминается, крутит
// головой за камерой, запускает эмбиент-идлы. Глушим всё это разом.
// Нативы разнятся между билдами форка — каждый вызов под охраной
function pedStatue(still) {
    const p = ped();
    const nat = (name, ...args) => {
        try { if (typeof native[name] === 'function') native[name](...args); } catch (e) { /* натива нет в этом билде */ }
    };
    if (still) {
        nat('clearPedTasksImmediately', p);
        nat('taskStandStill', p, -1);
        nat('setBlockingOfNonTemporaryEvents', p, true); // не реагировать на события вокруг
        nat('setPedCanPlayAmbientAnims', p, false);      // без "почесаться/оглядеться"
        nat('setPedCanPlayAmbientBaseAnims', p, false);
        nat('setPedCanHeadIk', p, false);                // голова не следит за камерой
        nat('stopPedSpeaking', p, true);
    } else {
        nat('clearPedTasks', p);
        nat('setBlockingOfNonTemporaryEvents', p, false);
        nat('setPedCanPlayAmbientAnims', p, true);
        nat('setPedCanPlayAmbientBaseAnims', p, true);
        nat('setPedCanHeadIk', p, true);
        nat('stopPedSpeaking', p, false);
    }
}

function setFaceCam(on) {
    if (Boolean(on) === (faceCam !== null)) return;

    if (on) {
        if (freecam) toggleFreecam();
        if (noclip) toggleNoclip();
        faceOrbit.angle = 0;
        faceOrbit.height = 0.14; // повыше, чтобы макушка была в кадре
        faceOrbit.dist = 0.75;
        faceCam = native.createCamWithParams('DEFAULT_SCRIPTED_CAMERA',
            0, 0, 0, 0, 0, 0, 32, true, 2);
        native.setCamActive(faceCam, true);
        native.renderScriptCams(true, true, 400, true, false, 0);
        native.freezeEntityPosition(ped(), true);
        pedStatue(true);
        faceCamUpdate();
        faceCamTick = alt.everyTick(faceCamUpdate);
    } else {
        if (faceCamTick !== null) {
            alt.clearEveryTick(faceCamTick);
            faceCamTick = null;
        }
        native.renderScriptCams(false, true, 400, true, false, 0);
        native.setCamActive(faceCam, false);
        native.destroyCam(faceCam, false);
        faceCam = null;
        pedStatue(false);
        if (!noclip) native.freezeEntityPosition(ped(), false);
    }
}

view.on('makeup:cam', (on) => setFaceCam(Boolean(on)));

// количества стилей/цветов (включая DLC facial_overlays — нативы их считают)
view.on('makeup:info', () => {
    const counts = {};
    for (const id of MAKEUP_OVERLAY_IDS) {
        try { counts[id] = native.getPedHeadOverlayNum(id); }
        catch (e) {
            try { counts[id] = native.getNumHeadOverlayValues(id); }
            catch (e2) { counts[id] = 0; }
        }
    }
    let hairColors = 64;
    let makeupColors = 64;
    try { hairColors = native.getNumHairColors(); } catch (e) { /* пусто */ }
    try { makeupColors = native.getNumMakeupColors(); } catch (e) { /* пусто */ }
    view.emit('makeup:info', { counts, hairColors, makeupColors });
});

alt.onServer('makeup:open', () => openUI('makeup'));

// ---------------- Сохранение/восстановление одежды ----------------

let outfitTimer = null;
let outfitSuppress = false; // true между /reload и следующим спавном

// компоненты, откатившиеся в дефолт из-за пропавшего аддон-пака:
// их сохранённые значения не перезаписываем дефолтом (comp -> {d,t})
const fallbackComps = new Map();
const fallbackProps = new Map();

function currentGender() {
    return alt.Player.local.model === alt.hash('mp_f_freemode_01') ? 'f' : 'm';
}

function collectOutfit() {
    const comps = {};
    for (const c of COMPS) {
        let d = native.getPedDrawableVariation(ped(), c);
        let t = native.getPedTextureVariation(ped(), c);
        // пак пропал -> вещь откатилась в 0/0; пока пользователь её сам
        // не поменял, в сейве держим оригинальный айди
        const fb = fallbackComps.get(c);
        if (fb && d === 0 && t === 0) {
            d = fb.d;
            t = fb.t;
        }
        comps[c] = { d, t };
    }
    const props = {};
    for (const p of PROPS) {
        let d = getPropIndex(p);
        let t = d >= 0 ? native.getPedPropTextureIndex(ped(), p) : 0;
        const fb = fallbackProps.get(p);
        if (fb && d < 0) {
            d = fb.d;
            t = fb.t;
        }
        props[p] = { d, t };
    }
    // пол снимаем с текущей модели: серверный ключ на момент приёма может
    // уже смениться (/gender), и аутфит уехал бы в чужой слот
    return { comps, props, face: faceState, gender: currentGender() };
}

function scheduleOutfitSave() {
    if (outfitSuppress) return;
    if (outfitTimer) alt.clearTimeout(outfitTimer);
    outfitTimer = alt.setTimeout(() => {
        outfitTimer = null;
        alt.emitServer('outfit:save', collectOutfit());
    }, 500);
}

// если аддон-пак пропал и сохранённый drawable больше не существует —
// откатываем компонент в дефолт (0/0 — базовая футболка и т.п.)
alt.onServer('outfit:apply', (outfit) => {
    if (!outfit || !outfit.comps) return;
    fallbackComps.clear();
    fallbackProps.clear();
    for (const c of COMPS) {
        const saved = outfit.comps[c];
        if (!saved) continue;
        const count = native.getNumberOfPedDrawableVariations(ped(), c);
        if (saved.d >= 0 && saved.d < count) {
            native.setPedComponentVariation(ped(), c, saved.d, Math.max(saved.t, 0), 2);
        } else {
            // пак недоступен: визуально дефолт, но сейв не портим
            fallbackComps.set(c, { d: saved.d, t: Math.max(saved.t, 0) });
            native.setPedComponentVariation(ped(), c, 0, 0, 2);
        }
    }
    for (const p of PROPS) {
        const saved = outfit.props?.[p];
        if (!saved) continue;
        const count = native.getNumberOfPedPropDrawableVariations(ped(), p);
        if (saved.d >= 0 && saved.d < count) {
            setPropIndex(p, saved.d, Math.max(saved.t, 0));
        } else {
            if (saved.d >= 0) fallbackProps.set(p, { d: saved.d, t: Math.max(saved.t, 0) });
            setPropIndex(p, -1, 0);
        }
    }
    if (outfit.face && typeof outfit.face === 'object') {
        faceState = outfit.face;
        applyFace();
    }
});

// после каждого спавна (вход, /gender, респавн) просим сервер вернуть аутфит.
// Висящий автосейв отменяем: он собран ещё под старую модель/пол
alt.on('spawned', () => {
    if (outfitTimer) {
        alt.clearTimeout(outfitTimer);
        outfitTimer = null;
    }
    outfitSuppress = false;
    alt.setTimeout(() => alt.emitServer('outfit:request'), 500);
    // у нового педа другой scriptID — перецепляем пропы
    alt.setTimeout(() => {
        for (const a of attachedProps.values()) reattachProp(a);
    }, 900);
});

// ---------------- Фоторежим (свободная камера) ----------------
// F7 — камера отлетает от педа, сам пед остаётся стоять (для скринов).
// WASD — полёт, мышь — обзор, Space/Ctrl — вверх/вниз, Shift — скорость.

let freecam = false;
let cam = null;
let camPos = { x: 0, y: 0, z: 0 };
let camRot = { x: 0, z: 0 };
let freecamTick = null;

function toggleFreecam() {
    if (noclip) toggleNoclip(); // режимы не совмещаем

    freecam = !freecam;

    if (freecam) {
        const p = alt.Player.local.pos;
        const r = native.getGameplayCamRot(2);
        camPos = { x: p.x, y: p.y, z: p.z + 1 };
        camRot = { x: r.x, z: r.z };
        cam = native.createCamWithParams('DEFAULT_SCRIPTED_CAMERA',
            camPos.x, camPos.y, camPos.z, 0, 0, camRot.z, 60, true, 2);
        native.setCamActive(cam, true);
        native.renderScriptCams(true, false, 0, true, false, 0);
        freecamTick = alt.everyTick(freecamMove);
        view.emit('hud:mode', 'freecam', true);
        localMsg(`* Photo mode ON (speed ${speedLabel()}, Shift to cycle)`);
    } else {
        if (freecamTick !== null) {
            alt.clearEveryTick(freecamTick);
            freecamTick = null;
        }
        native.renderScriptCams(false, false, 0, true, false, 0);
        if (cam !== null) {
            native.setCamActive(cam, false);
            native.destroyCam(cam, false);
            cam = null;
        }
        view.emit('hud:mode', 'freecam', false);
        localMsg('* Photo mode OFF');
    }
}

function freecamMove() {
    // глушим управление по-кадрово: пед стоит, а disabled-нативы читаются
    // (alt.toggleGameControls глушит ввод целиком — с ним камера мертва)
    native.disableAllControlActions(0);

    const lookX = native.getDisabledControlNormal(0, 1);
    const lookY = native.getDisabledControlNormal(0, 2);
    camRot.z -= lookX * 6;
    camRot.x = Math.max(-89, Math.min(89, camRot.x - lookY * 6));

    const speed = NOCLIP_SPEEDS[noclipSpeed];
    const radZ = (camRot.z * Math.PI) / 180;
    const radX = (camRot.x * Math.PI) / 180;

    const fwd = {
        x: -Math.sin(radZ) * Math.cos(radX),
        y: Math.cos(radZ) * Math.cos(radX),
        z: Math.sin(radX),
    };
    const right = { x: Math.cos(radZ), y: Math.sin(radZ) };

    let dx = 0, dy = 0, dz = 0;

    if (native.isDisabledControlPressed(0, 32)) { dx += fwd.x; dy += fwd.y; dz += fwd.z; }
    if (native.isDisabledControlPressed(0, 33)) { dx -= fwd.x; dy -= fwd.y; dz -= fwd.z; }
    if (native.isDisabledControlPressed(0, 34)) { dx -= right.x; dy -= right.y; }
    if (native.isDisabledControlPressed(0, 35)) { dx += right.x; dy += right.y; }
    if (native.isDisabledControlPressed(0, 22)) dz += 1;
    if (native.isDisabledControlPressed(0, 36)) dz -= 1;

    if (dx || dy || dz) {
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        camPos.x += (dx / len) * speed;
        camPos.y += (dy / len) * speed;
        camPos.z += (dz / len) * speed;
    }

    native.setCamCoord(cam, camPos.x, camPos.y, camPos.z);
    native.setCamRot(cam, camRot.x, 0, camRot.z, 2);
}

// ---------------- Моды оружия (только подходящие текущему) ----------------

const WEAPON_CODES = [
    'weapon_pistol', 'weapon_combatpistol', 'weapon_pistol50', 'weapon_appistol',
    'weapon_revolver', 'weapon_microsmg', 'weapon_smg', 'weapon_assaultsmg',
    'weapon_assaultrifle', 'weapon_carbinerifle', 'weapon_advancedrifle',
    'weapon_specialcarbine', 'weapon_bullpuprifle', 'weapon_pumpshotgun',
    'weapon_sawnoffshotgun', 'weapon_assaultshotgun', 'weapon_sniperrifle',
    'weapon_heavysniper', 'weapon_grenadelauncher', 'weapon_rpg', 'weapon_minigun',
    'weapon_grenade', 'weapon_stickybomb', 'weapon_molotov', 'weapon_knife',
    'weapon_bat', 'weapon_machete', 'weapon_stungun', 'weapon_flashlight', 'weapon_parachute',
    'weapon_combatmg', 'weapon_mg', 'weapon_marksmanrifle', 'weapon_snspistol',
    'weapon_heavypistol', 'weapon_compactrifle',
    'weapon_pistol_mk2', 'weapon_snspistol_mk2', 'weapon_revolver_mk2', 'weapon_smg_mk2',
    'weapon_combatmg_mk2', 'weapon_assaultrifle_mk2', 'weapon_carbinerifle_mk2',
    'weapon_specialcarbine_mk2', 'weapon_bullpuprifle_mk2', 'weapon_pumpshotgun_mk2',
    'weapon_marksmanrifle_mk2', 'weapon_heavysniper_mk2',
];

const WMOD_CATALOG = [
    ['COMPONENT_AT_PI_FLSH', 'Flashlight'],
    ['COMPONENT_AT_AR_FLSH', 'Flashlight'],
    ['COMPONENT_AT_PI_SUPP', 'Suppressor'],
    ['COMPONENT_AT_PI_SUPP_02', 'Suppressor II'],
    ['COMPONENT_AT_AR_SUPP', 'Suppressor'],
    ['COMPONENT_AT_AR_SUPP_02', 'Suppressor II'],
    ['COMPONENT_AT_SR_SUPP', 'Suppressor (sniper)'],
    ['COMPONENT_AT_SCOPE_MACRO', 'Scope (macro)'],
    ['COMPONENT_AT_SCOPE_MACRO_02', 'Scope (macro II)'],
    ['COMPONENT_AT_SCOPE_SMALL', 'Scope (small)'],
    ['COMPONENT_AT_SCOPE_SMALL_02', 'Scope (small II)'],
    ['COMPONENT_AT_SCOPE_MEDIUM', 'Scope (medium)'],
    ['COMPONENT_AT_SCOPE_LARGE', 'Scope (large)'],
    ['COMPONENT_AT_SCOPE_MAX', 'Scope (max)'],
    ['COMPONENT_AT_AR_AFGRIP', 'Grip'],
    // MK2-обвесы
    ['COMPONENT_AT_AR_AFGRIP_02', 'Grip (Mk II)'],
    ['COMPONENT_AT_PI_FLSH_02', 'Flashlight (Mk II)'],
    ['COMPONENT_AT_PI_FLSH_03', 'Flashlight (Mk II alt)'],
    ['COMPONENT_AT_PI_COMP', 'Compensator'],
    ['COMPONENT_AT_PI_COMP_02', 'Compensator II'],
    ['COMPONENT_AT_PI_COMP_03', 'Compensator III'],
    ['COMPONENT_AT_PI_RAIL', 'Scope mount'],
    ['COMPONENT_AT_PI_RAIL_02', 'Scope mount II'],
    ['COMPONENT_AT_SIGHTS', 'Holo sight'],
    ['COMPONENT_AT_SIGHTS_SMG', 'Holo sight (SMG)'],
    ['COMPONENT_AT_SCOPE_MACRO_02_SMG_MK2', 'Scope (macro, SMG Mk II)'],
    ['COMPONENT_AT_SCOPE_MACRO_MK2', 'Scope (macro Mk II)'],
    ['COMPONENT_AT_SCOPE_SMALL_MK2', 'Scope (small Mk II)'],
    ['COMPONENT_AT_SCOPE_SMALL_SMG_MK2', 'Scope (small, SMG Mk II)'],
    ['COMPONENT_AT_SCOPE_MEDIUM_MK2', 'Scope (medium Mk II)'],
    ['COMPONENT_AT_SCOPE_LARGE_MK2', 'Scope (large Mk II)'],
    ['COMPONENT_AT_SCOPE_MAX_MK2', 'Scope (max Mk II)'],
    ['COMPONENT_AT_MUZZLE_01', 'Muzzle brake 1'],
    ['COMPONENT_AT_MUZZLE_02', 'Muzzle brake 2'],
    ['COMPONENT_AT_MUZZLE_03', 'Muzzle brake 3'],
    ['COMPONENT_AT_MUZZLE_04', 'Muzzle brake 4'],
    ['COMPONENT_AT_MUZZLE_05', 'Muzzle brake 5'],
    ['COMPONENT_AT_MUZZLE_06', 'Muzzle brake 6'],
    ['COMPONENT_AT_MUZZLE_07', 'Muzzle brake 7'],
    ['COMPONENT_AT_MUZZLE_08', 'Muzzle brake 8'],
    ['COMPONENT_AT_MUZZLE_09', 'Muzzle brake 9'],
    ['COMPONENT_AT_AR_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_AR_BARREL_02', 'Barrel (heavy)'],
    ['COMPONENT_AT_CR_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_CR_BARREL_02', 'Barrel (heavy)'],
    ['COMPONENT_AT_SC_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_SC_BARREL_02', 'Barrel (heavy)'],
    ['COMPONENT_AT_BP_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_BP_BARREL_02', 'Barrel (heavy)'],
    ['COMPONENT_AT_MG_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_MG_BARREL_02', 'Barrel (heavy)'],
    ['COMPONENT_AT_MRFL_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_MRFL_BARREL_02', 'Barrel (heavy)'],
    ['COMPONENT_AT_SB_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_SB_BARREL_02', 'Barrel (heavy)'],
    ['COMPONENT_AT_SR_BARREL_01', 'Barrel (default)'],
    ['COMPONENT_AT_SR_BARREL_02', 'Barrel (heavy)'],
];

function currentWeapon() {
    const w = native.getSelectedPedWeapon(ped());
    if (!w || w === alt.hash('weapon_unarmed')) return null;
    return w;
}

function sendWmods() {
    const w = currentWeapon();
    if (!w) {
        view.emit('wmods:list', null, []);
        return;
    }
    const code = WEAPON_CODES.find((n) => alt.hash(n) === w) ?? null;
    const candidates = [...WMOD_CATALOG];
    if (code) {
        const base = code.replace('weapon_', '').toUpperCase();
        candidates.push(
            [`COMPONENT_${base}_CLIP_02`, 'Extended clip'],
            [`COMPONENT_${base}_CLIP_03`, 'Drum clip'],
            [`COMPONENT_${base}_CLIP_FMJ`, 'FMJ rounds'],
            [`COMPONENT_${base}_CLIP_INCENDIARY`, 'Incendiary rounds'],
            [`COMPONENT_${base}_CLIP_HOLLOWPOINT`, 'Hollow point rounds'],
            [`COMPONENT_${base}_CLIP_TRACER`, 'Tracer rounds'],
            [`COMPONENT_${base}_CLIP_ARMORPIERCING`, 'Armor piercing rounds'],
            [`COMPONENT_${base}_CLIP_EXPLOSIVE`, 'Explosive rounds'],
            [`COMPONENT_${base}_VARMOD_LUXE`, 'Luxury finish'],
            [`COMPONENT_${base}_VARMOD_LOWRIDER`, 'Custom finish'],
            [`COMPONENT_${base}_VARMOD_LOWRIDER2`, 'Custom finish II'],
            [`COMPONENT_${base}_CAMO`, 'Camo 1'],
        );
        // MK2-камуфляжи: COMPONENT_X_CAMO_02..CAMO_10 + индивидуальный
        for (let i = 2; i <= 10; i++) {
            candidates.push([`COMPONENT_${base}_CAMO_${String(i).padStart(2, '0')}`, `Camo ${i}`]);
        }
        candidates.push([`COMPONENT_${base}_CAMO_IND_01`, 'Camo (custom)']);
    }
    const mods = [];
    const seen = new Set();
    for (const [name, label] of candidates) {
        if (seen.has(name)) continue;
        seen.add(name);
        const hash = alt.hash(name.toLowerCase());
        // фильтр: показываем только то, что реально ставится на это оружие;
        // если натив недоступен — не скрываем кандидата
        let fits = true;
        try { fits = native.doesWeaponTakeWeaponComponent(w, hash); } catch (e) { fits = true; }
        if (!fits) continue;
        let active = false;
        try { active = native.hasPedGotWeaponComponent(ped(), w, hash); } catch (e) { /* пусто */ }
        mods.push({ name, label, active });
    }
    view.emit('wmods:list', code, mods);
}

view.on('wmods:request', sendWmods);

view.on('wmods:toggle', (name) => {
    const w = currentWeapon();
    if (!w) return;
    const hash = alt.hash(String(name).toLowerCase());
    if (native.hasPedGotWeaponComponent(ped(), w, hash)) {
        native.removeWeaponComponentFromPed(ped(), w, hash);
    } else {
        native.giveWeaponComponentToPed(ped(), w, hash);
    }
    sendWmods();
});

// ---------------- Прикрепление пропов к костям (аля Menyoo) ----------------
// объекты локальные; порядок костей строго совпадает со списком в hud.js

const ATTACH_BONE_IDS = [
    57005, 18905, 31086, 39317, 24818, 24817, 57597, 11816, 28422, 61163,
    40269, 45509, 10706, 64729, 51826, 58271, 36864, 63931, 52301, 14201,
];

const attachedProps = new Map(); // id -> { model, obj, bone, pos, rot }
let nextPropId = 1;

function sendPropList() {
    view.emit('prop:list', [...attachedProps.entries()].map(([id, a]) => ({
        id, model: a.model, bone: a.bone, pos: a.pos, rot: a.rot,
    })));
}

function propHandle(a) {
    return a.lo ? a.lo.scriptID : a.handle;
}

// декоративный проп не должен иметь физики: коллизия бьёт педа и роняет в рэгдолл
function propDisableCollision(h) {
    try { native.setEntityCollision(h, false, false); } catch (e) { /* пусто */ }
    try { native.setEntityCompletelyDisableCollision(h, false, false); } catch (e) { /* пусто */ }
    try { native.setEntityCanBeDamaged(h, false); } catch (e) { /* пусто */ }
    try { native.setEntityInvincible(h, true); } catch (e) { /* пусто */ }
}

function reattachProp(a) {
    const h = propHandle(a);
    if (!h) return false;
    try { native.freezeEntityPosition(h, false); } catch (e) { /* пусто */ }
    propDisableCollision(h);
    const boneIndex = native.getPedBoneIndex(ped(), ATTACH_BONE_IDS[a.bone] ?? ATTACH_BONE_IDS[0]);
    // наборы флагов attachEntityToEntity — разные билды капризничают по-разному
    const variants = [
        [true, true, false, true, 1, true],
        [false, false, false, false, 2, true],
        [true, false, false, false, 0, true],
    ];
    for (const v of variants) {
        try {
            native.attachEntityToEntity(h, ped(), boneIndex,
                a.pos.x, a.pos.y, a.pos.z, a.rot.x, a.rot.y, a.rot.z,
                v[0], v[1], v[2], v[3], v[4], v[5]);
        } catch (e) { continue; }
        if (native.isEntityAttachedToEntity(h, ped())) {
            a.lastHandle = h;
            return true;
        }
    }
    a.lastHandle = h;
    return false;
}

// рестрим меняет scriptID у LocalObject — раз в 2с перецепляем отвалившиеся
alt.setInterval(() => {
    if (!attachedProps.size) return;
    for (const a of attachedProps.values()) {
        const h = propHandle(a);
        if (!h) continue;
        if (h !== a.lastHandle || !native.isEntityAttachedToEntity(h, ped())) {
            a.followFallback = !reattachProp(a);
            if (a.followFallback) a.frozenForFollow = false; // reattach разморозил — заморозим снова
        }
    }
}, 2000);

// запасной режим: если attach в билде не берётся вообще — ведём проп
// за костью вручную каждый кадр (offset поворачивается по хедингу педа)
alt.everyTick(() => {
    if (!attachedProps.size) return;
    for (const a of attachedProps.values()) {
        if (!a.followFallback) continue;
        const h = propHandle(a);
        if (!h) continue;
        if (native.isEntityAttachedToEntity(h, ped())) {
            a.followFallback = false;
            continue;
        }
        // в ручном режиме физика не нужна вовсе: замораживаем и без коллизии
        if (!a.frozenForFollow) {
            try { native.freezeEntityPosition(h, true); } catch (e) { /* пусто */ }
            propDisableCollision(h);
            a.frozenForFollow = true;
        }
        const boneIndex = native.getPedBoneIndex(ped(), ATTACH_BONE_IDS[a.bone] ?? ATTACH_BONE_IDS[0]);
        const bp = native.getWorldPositionOfEntityBone(ped(), boneIndex);
        const heading = native.getEntityHeading(ped());
        const rad = (heading * Math.PI) / 180;
        const ox = a.pos.x * Math.cos(rad) - a.pos.y * Math.sin(rad);
        const oy = a.pos.x * Math.sin(rad) + a.pos.y * Math.cos(rad);
        try {
            native.setEntityCoordsNoOffset(h, bp.x + ox, bp.y + oy, bp.z + a.pos.z, false, false, false);
            native.setEntityRotation(h, a.rot.x, a.rot.y, heading + a.rot.z, 2, true);
        } catch (e) { /* пусто */ }
    }
});

function deletePropEntity(a) {
    if (a.lo) {
        try { a.lo.destroy(); } catch (e) { /* пусто */ }
        return;
    }
    try { native.deleteEntity(a.handle); }
    catch (e) { try { native.deleteObject(a.handle); } catch (e2) { /* пусто */ } }
}

view.on('prop:add', async (model) => {
    const name = String(model ?? '').toLowerCase();
    if (!/^[a-z0-9_]{1,64}$/.test(name)) return;
    const p = alt.Player.local.pos;
    const a = { model: name, lo: null, handle: 0, bone: 0, pos: { x: 0, y: 0, z: 0 }, rot: { x: 0, y: 0, z: 0 } };

    if (typeof alt.LocalObject === 'function') {
        // штатный способ: нативный createObject клиенту заблокирован
        try {
            a.lo = new alt.LocalObject(name, new alt.Vector3(p.x, p.y, p.z), new alt.Vector3(0, 0, 0), true, true);
        } catch (e) {
            localMsg(`* Prop model not found: ${name}`);
            return;
        }
        for (let i = 0; i < 50 && !a.lo.scriptID; i++) {
            await alt.Utils.wait(20);
        }
        if (!a.lo.scriptID) {
            try { a.lo.destroy(); } catch (e) { /* пусто */ }
            localMsg(`* Prop failed to stream: ${name}`);
            return;
        }
        // LocalObject создаётся замороженным — иначе attach молча не работает
        try { a.lo.positionFrozen = false; } catch (e) { /* пусто */ }
        try { native.freezeEntityPosition(a.lo.scriptID, false); } catch (e) { /* пусто */ }
        propDisableCollision(a.lo.scriptID);
    } else {
        const hash = alt.hash(name);
        native.requestModel(hash);
        for (let i = 0; i < 50 && !native.hasModelLoaded(hash); i++) {
            await alt.Utils.wait(20);
        }
        if (!native.hasModelLoaded(hash)) {
            localMsg(`* Prop model not found: ${name}`);
            return;
        }
        a.handle = native.createObject(hash, p.x, p.y, p.z, false, false, true);
    }

    attachedProps.set(nextPropId++, a);
    const ok = reattachProp(a);
    a.followFallback = !ok;
    sendPropList();
    // честная диагностика: attach взялся или включён ручной режим следования
    localMsg(ok ? `* Attached: ${name}` : `* Attached (fallback follow mode): ${name}`);
});

view.on('prop:set', (id, bone, pos, rot) => {
    const a = attachedProps.get(Number(id));
    if (!a || !pos || !rot) return;
    a.bone = Math.max(0, Math.min(Number(bone) || 0, ATTACH_BONE_IDS.length - 1));
    a.pos = { x: Number(pos.x) || 0, y: Number(pos.y) || 0, z: Number(pos.z) || 0 };
    a.rot = { x: Number(rot.x) || 0, y: Number(rot.y) || 0, z: Number(rot.z) || 0 };
    reattachProp(a);
    sendPropList();
});

view.on('prop:remove', (id) => {
    const a = attachedProps.get(Number(id));
    if (!a) return;
    deletePropEntity(a);
    attachedProps.delete(Number(id));
    sendPropList();
});

view.on('prop:clear', () => {
    for (const a of attachedProps.values()) deletePropEntity(a);
    attachedProps.clear();
    sendPropList();
});

view.on('prop:request', sendPropList);

// ---------------- Телепорт к метке ----------------

async function getGroundZ(x, y) {
    for (let z = 1000; z >= 0; z -= 25) {
        native.requestCollisionAtCoord(x, y, z);
        await alt.Utils.wait(0);
        const [found, groundZ] = native.getGroundZFor3dCoord(x, y, z, 0, false, false);
        if (found) return groundZ + 1;
    }
    return 1000;
}

async function tpToWaypoint() {
    const blip = native.getFirstBlipInfoId(8);
    if (!native.doesBlipExist(blip)) {
        localMsg('* Set a waypoint on the map first');
        return;
    }
    const coords = native.getBlipInfoIdCoord(blip);
    const z = await getGroundZ(coords.x, coords.y);
    alt.emitServer('core:teleport', coords.x, coords.y, z);
}

// ---------------- Клавиши ----------------

let cursorShown = false;

alt.on('keyup', (key) => {
    if (uiTyping) return; // идёт набор текста в UI — бинды молчат
    if (alt.isConsoleOpen() || alt.isMenuOpen()) return; // F8-консоль / пауза

    // тильда — курсор, работает и при открытом меню (но не при наборе в чате)
    if (key === 192) {
        if (currentScreen === 'chat') return;
        setCursor(!cursorShown);
        cursorOwner = cursorShown ? 'user' : null;
        return;
    }


    if (uiOpen) return;

    switch (key) {
        case 84: openUI('chat'); break;        // T
        case 191: openUI('chat', '/'); break;  // '/'
        case 77: openUI('menu'); break;        // M
        case 114: alt.emitServer('core:fixVehicle'); break; // F3
        case 115: tpToWaypoint(); break;       // F4
        case 116: toggleNoclip(); break;       // F5
        case 118: toggleFreecam(); break;      // F7
        case 88: if (animActive) stopAnim(); break; // X — отмена анимации
        case 117: { // F6 — координаты в буфер (через сервер, он на этом же ПК)
            const p = alt.Player.local.pos;
            alt.emitServer('core:copyCoords', `${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)}`);
            view.emit('hud:copy');
            break;
        }
        case 16: // Shift — смена скорости noclip/фоторежима
            if (noclip || freecam) {
                noclipSpeed = (noclipSpeed + 1) % NOCLIP_SPEEDS.length;
                localMsg(`* Speed: ${speedLabel()}`);
            }
            break;
    }
});

const CLIENT_BUILD = 'r1.6.0';
alt.log(`[core] client loaded ${CLIENT_BUILD}: T chat, M menu, F5 noclip`);
alt.setTimeout(() => localMsg(`* core client ${CLIENT_BUILD}`), 2000);
