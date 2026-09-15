'use strict';

// В alt:V WebView доступен глобальный alt; в браузере — заглушка для отладки
const A = window.alt ?? {
    emit: (...a) => console.log('[emit]', ...a),
    on: () => {},
};

const $ = (id) => document.getElementById(id);

// ================= данные =================

const WEATHERS = [
    'Extra Sunny', 'Clear', 'Clouds', 'Smog', 'Foggy', 'Overcast', 'Rain',
    'Thunder', 'Clearing', 'Neutral', 'Snow', 'Blizzard', 'Snowlight', 'Xmas', 'Halloween',
];

const WEAPONS = [
    ['weapon_pistol', 'Pistol'], ['weapon_combatpistol', 'Combat Pistol'],
    ['weapon_pistol50', 'Pistol .50'], ['weapon_appistol', 'AP Pistol'],
    ['weapon_revolver', 'Revolver'], ['weapon_microsmg', 'Micro SMG'],
    ['weapon_smg', 'SMG'], ['weapon_assaultsmg', 'Assault SMG'],
    ['weapon_assaultrifle', 'Assault Rifle'], ['weapon_carbinerifle', 'Carbine Rifle'],
    ['weapon_advancedrifle', 'Advanced Rifle'], ['weapon_specialcarbine', 'Special Carbine'],
    ['weapon_bullpuprifle', 'Bullpup Rifle'], ['weapon_pumpshotgun', 'Pump Shotgun'],
    ['weapon_sawnoffshotgun', 'Sawn-Off'], ['weapon_assaultshotgun', 'Assault Shotgun'],
    ['weapon_sniperrifle', 'Sniper Rifle'], ['weapon_heavysniper', 'Heavy Sniper'],
    ['weapon_grenadelauncher', 'Grenade Launcher'], ['weapon_rpg', 'RPG'],
    ['weapon_minigun', 'Minigun'], ['weapon_grenade', 'Grenade'],
    ['weapon_stickybomb', 'Sticky Bomb'], ['weapon_molotov', 'Molotov'],
    ['weapon_knife', 'Knife'], ['weapon_bat', 'Bat'],
    ['weapon_machete', 'Machete'], ['weapon_stungun', 'Stun Gun'],
    ['weapon_flashlight', 'Flashlight'], ['weapon_parachute', 'Parachute'],
    ['weapon_combatmg', 'Combat MG'], ['weapon_mg', 'MG'],
    ['weapon_marksmanrifle', 'Marksman Rifle'], ['weapon_snspistol', 'SNS Pistol'],
    ['weapon_heavypistol', 'Heavy Pistol'], ['weapon_compactrifle', 'Compact Rifle'],
    ['weapon_pistol_mk2', 'Pistol Mk II'], ['weapon_snspistol_mk2', 'SNS Pistol Mk II'],
    ['weapon_revolver_mk2', 'Revolver Mk II'], ['weapon_smg_mk2', 'SMG Mk II'],
    ['weapon_combatmg_mk2', 'Combat MG Mk II'], ['weapon_assaultrifle_mk2', 'Assault Rifle Mk II'],
    ['weapon_carbinerifle_mk2', 'Carbine Rifle Mk II'], ['weapon_specialcarbine_mk2', 'Special Carbine Mk II'],
    ['weapon_bullpuprifle_mk2', 'Bullpup Rifle Mk II'], ['weapon_pumpshotgun_mk2', 'Pump Shotgun Mk II'],
    ['weapon_marksmanrifle_mk2', 'Marksman Rifle Mk II'], ['weapon_heavysniper_mk2', 'Heavy Sniper Mk II'],
];

const VEHICLES = [
    'adder', 'zentorno', 't20', 'osiris', 'nero', 'vagner', 'deveste', 'krieger',
    'sultan', 'sultanrs', 'elegy2', 'kuruma', 'dominator', 'gauntlet', 'banshee',
    'comet2', 'jester', 'futo', 'blista', 'issi2', 'dukes', 'voltic', 'raiden',
    'insurgent', 'dubsta3', 'rhino', 'sanchez', 'bati', 'akuma', 'double', 'faggio',
    'buzzard2', 'hydra', 'lazer',
];

const OBJECTS = [
    'prop_barrel_02a', 'prop_container_01a', 'prop_boxpile_04a', 'prop_roadcone02a',
    'prop_barrier_work05', 'prop_mp_cone_01', 'prop_cs_cardbox_01', 'prop_patio_lounger1',
    'prop_worklight_03b', 'prop_beach_fire',
];

const ANIMS = [
    { label: 'Smoking', v: { type: 'scenario', a: 'WORLD_HUMAN_SMOKING' } },
    { label: 'Drinking', v: { type: 'scenario', a: 'WORLD_HUMAN_DRINKING' } },
    { label: 'Guard', v: { type: 'scenario', a: 'WORLD_HUMAN_GUARD_STAND' } },
    { label: 'Clipboard', v: { type: 'scenario', a: 'WORLD_HUMAN_CLIPBOARD' } },
    { label: 'Hang out', v: { type: 'scenario', a: 'WORLD_HUMAN_HANG_OUT_STREET' } },
    { label: 'Leaning', v: { type: 'scenario', a: 'WORLD_HUMAN_LEANING' } },
    { label: 'Push-ups', v: { type: 'scenario', a: 'WORLD_HUMAN_PUSH_UPS' } },
    { label: 'Sit-ups', v: { type: 'scenario', a: 'WORLD_HUMAN_SIT_UPS' } },
    { label: 'Yoga', v: { type: 'scenario', a: 'WORLD_HUMAN_YOGA' } },
    { label: 'Muscle flex', v: { type: 'scenario', a: 'WORLD_HUMAN_MUSCLE_FLEX' } },
    { label: 'Cheering', v: { type: 'scenario', a: 'WORLD_HUMAN_CHEERING' } },
    { label: 'Partying', v: { type: 'scenario', a: 'WORLD_HUMAN_PARTYING' } },
    { label: 'Sunbathing', v: { type: 'scenario', a: 'WORLD_HUMAN_SUNBATHE' } },
    { label: 'Welding', v: { type: 'scenario', a: 'WORLD_HUMAN_WELDING' } },
    { label: 'Binoculars', v: { type: 'scenario', a: 'WORLD_HUMAN_BINOCULARS' } },
    { label: 'Phone', v: { type: 'scenario', a: 'WORLD_HUMAN_STAND_MOBILE' } },
    { label: 'Guitar', v: { type: 'scenario', a: 'WORLD_HUMAN_MUSICIAN' } },
];

const PEDS = [
    'mp_m_freemode_01', 'mp_f_freemode_01',
    'a_m_y_skater_01', 'a_m_y_hipster_01', 'a_f_y_hipster_01', 'a_m_m_business_01',
    'a_f_y_business_01', 'a_m_y_beach_01', 'a_f_y_beach_01', 'a_m_m_farmer_01',
    's_m_y_cop_01', 's_f_y_cop_01', 's_m_y_swat_01', 's_m_m_paramedic_01',
    's_m_y_fireman_01', 's_m_m_security_01', 'g_m_y_ballaorig_01', 'g_m_y_famca_01',
    'u_m_y_zombie_01', 'ig_bankman', 'a_c_husky', 'a_c_cat_01', 'a_c_chimp',
];

const FACE_FEATURES = [
    'Nose width', 'Nose peak height', 'Nose peak length', 'Nose bone height',
    'Nose peak lowering', 'Nose bone twist', 'Eyebrow height', 'Eyebrow depth',
    'Cheekbone height', 'Cheekbone width', 'Cheek width', 'Eye opening',
    'Lip thickness', 'Jaw width', 'Jaw shape', 'Chin height',
    'Chin depth', 'Chin width', 'Chin hole', 'Neck width',
];

// кости для прикрепления пропов — порядок строго как в клиенте
const ATTACH_BONES = [
    [57005, 'R hand'], [18905, 'L hand'], [31086, 'Head'], [39317, 'Neck'],
    [24818, 'Chest (spine3)'], [24817, 'Spine 2'], [57597, 'Spine root'], [11816, 'Pelvis'],
    [28422, 'R forearm'], [61163, 'L forearm'], [40269, 'R upper arm'], [45509, 'L upper arm'],
    [10706, 'R clavicle'], [64729, 'L clavicle'], [51826, 'R thigh'], [58271, 'L thigh'],
    [36864, 'R calf'], [63931, 'L calf'], [52301, 'R foot'], [14201, 'L foot'],
];

const ATTACH_PROPS = [
    'prop_cs_burger_01', 'prop_beer_bottle', 'prop_wine_bot_02', 'prop_cs_ciggy_01',
    'prop_phone_ing', 'prop_ld_case_01', 'prop_cs_duffel_01', 'prop_notepad_01',
    'prop_pencil_01', 'p_amb_brolly_01', 'prop_cs_book_01', 'prop_tool_fireaxe',
];

const CLOTH_COMPONENTS = [
    ['comp', 0, 'Face'], ['comp', 1, 'Mask'], ['comp', 2, 'Hair'],
    ['comp', 3, 'Torso / arms'], ['comp', 4, 'Legs'], ['comp', 5, 'Bag'],
    ['comp', 6, 'Shoes'], ['comp', 7, 'Accessories'], ['comp', 8, 'Undershirt'],
    ['comp', 9, 'Body armor'], ['comp', 10, 'Decals'], ['comp', 11, 'Top'],
    ['prop', 0, 'Hat'], ['prop', 1, 'Glasses'], ['prop', 2, 'Ears'],
    ['prop', 6, 'Watch'], ['prop', 7, 'Bracelet'],
];

// ================= подсказки =================

const HINTS = {
    default: [['T', 'Chat'], ['M', 'Menu'], ['F3', 'Repair'], ['F4', 'TP to waypoint'], ['F5', 'Noclip'], ['F6', 'Copy coords'], ['F7', 'Photo mode'], ['~', 'Cursor']],
    chat: [['Tab', 'Complete'], ['↑↓', 'Pick / history'], ['Enter', 'Send'], ['Esc', 'Close']],
    menu: [['↑↓', 'Navigate'], ['←→', 'Value'], ['Enter', 'Select'], ['Bksp', 'Back'], ['Esc', 'Close']],
    input: [['Enter', 'Apply'], ['Esc', 'Cancel']],
    board: [['LMB', 'Select / drag'], ['←→', 'Item'], ['↑↓', 'Texture'], ['Q/E', 'Panel'], ['Enter', 'Copy'], ['Esc', 'Close']],
};

// ---------- бейджи активных режимов (как выйти) ----------

const MODE_BADGES = {
    anim: ['Animation', 'X', 'cancel'],
    noclip: ['Noclip', 'F5', 'exit'],
    freecam: ['Photo mode', 'F7', 'exit'],
};

A.on('hud:mode', (kind, on) => {
    const id = `mode-${kind}`;
    const existing = document.getElementById(id);
    if (!on) {
        if (existing) existing.remove();
        return;
    }
    if (existing || !MODE_BADGES[kind]) return;
    const [name, key, verb] = MODE_BADGES[kind];
    const pill = document.createElement('span');
    pill.className = 'mode-pill';
    pill.id = id;
    pill.appendChild(document.createTextNode(`${name} · `));
    const k = document.createElement('kbd');
    k.textContent = key;
    pill.appendChild(k);
    pill.appendChild(document.createTextNode(` ${verb}`));
    $('modes').appendChild(pill);
});

function setHints(kind) {
    $('hints').innerHTML = '';
    for (const [key, label] of HINTS[kind]) {
        const h = document.createElement('span');
        h.className = 'h';
        const k = document.createElement('kbd');
        k.textContent = key;
        h.appendChild(k);
        h.appendChild(document.createTextNode(label));
        $('hints').appendChild(h);
    }
}

// ================= тост =================

let toastTimer = null;
function toast(text) {
    const t = $('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 1800);
}

function copyToClipboard(text) {
    // основной путь — через клиент и сервер в буфер Windows
    A.emit('clip:copy', text);
    // запасной — execCommand внутри WebView
    const ta = $('clip');
    ta.value = text;
    ta.select();
    document.execCommand('copy');
    ta.blur();
}

// ================= масштаб интерфейса =================
// правится в меню (M -> UI scale), шаг 5%, хранится вместе с раскладкой

let uiScale = 1;

function applyScale() {
    document.body.style.zoom = uiScale;
}

function setUiScale(dir) {
    const prev = uiScale;
    uiScale = Math.min(1.6, Math.max(0.6, Math.round((uiScale + dir * 0.05) * 100) / 100));
    if (uiScale === prev) return;

    // zoom растягивает координаты — пересчитываем все кастомные позиции,
    // чтобы панельки ВИЗУАЛЬНО остались на своих местах
    const f = prev / uiScale;
    for (const key of Object.keys(savedPos)) {
        if (key.startsWith('__')) continue;
        const p = savedPos[key];
        if (p && typeof p === 'object') savedPos[key] = { x: Math.round(p.x * f), y: Math.round(p.y * f) };
    }
    if (savedPos.__hudPos) {
        for (const id of Object.keys(savedPos.__hudPos)) {
            const p = savedPos.__hudPos[id];
            savedPos.__hudPos[id] = { x: Math.round(p.x * f), y: Math.round(p.y * f) };
        }
    }

    applyScale();
    applyHudPos();
    repositionStrips();
    savedPos.__uiScale = uiScale;
    savePositions();
}

// видимая область в layout-пикселях: zoom растягивает координаты,
// а window.innerWidth/Height остаются в экранных — всегда делим
function vw() {
    return window.innerWidth / uiScale;
}
function vh() {
    return window.innerHeight / uiScale;
}

// прижимаем координату к видимой области
function clampX(x) {
    return Math.max(0, Math.min(x, vw() - 90));
}
function clampY(y) {
    return Math.max(0, Math.min(y, vh() - 46));
}

function repositionStrips() {
    if (!stripsBuilt) return;
    CLOTH_COMPONENTS.forEach(([kind, comp], i) => {
        const key = keyOf(kind, comp);
        const el = document.getElementById(`strip-${key}`);
        if (!el) return;
        const pos = savedPos[key] ?? defaultPos(i);
        el.style.left = `${clampX(pos.x)}px`;
        el.style.top = `${clampY(pos.y)}px`;
    });
}

// ================= координаты =================

const coords = { x: 0, y: 0, z: 0, h: 0 };

A.on('hud:coords', (x, y, z, h) => {
    coords.x = x; coords.y = y; coords.z = z; coords.h = h;
    $('cx').textContent = x.toFixed(2);
    $('cy').textContent = y.toFixed(2);
    $('cz').textContent = z.toFixed(2);
    $('ch').textContent = Math.round(h);
});

A.on('hud:copy', () => {
    const text = `${coords.x.toFixed(2)}, ${coords.y.toFixed(2)}, ${coords.z.toFixed(2)}`;
    copyToClipboard(text);
    toast(`Copied: ${text}`);
});

// ---------- FPS / frametime / ping ----------

A.on('hud:fps', (fps, ping) => {
    $('fps').textContent = Math.round(fps);
    $('ms').textContent = fps > 0 ? (1000 / fps).toFixed(1) : '—';
    $('ping').textContent = ping >= 0 ? ping : '—';
});

// ================= чат =================

const MAX_MESSAGES = 30;

A.on('chat:msg', (text) => {
    const div = document.createElement('div');
    div.className = 'msg' + (String(text).startsWith('*') ? ' sys' : '');
    div.textContent = String(text);
    $('chatlog').appendChild(div);
    while ($('chatlog').children.length > MAX_MESSAGES) $('chatlog').firstChild.remove();
    setTimeout(() => div.classList.add('old'), 12000);
});

// ================= состояние интерфейса =================

let mode = null; // null | 'chat' | 'menu'

A.on('ui:open', (screen, arg) => {
    if (screen === 'chat') openChat(arg || '');
    else if (screen === 'menu') openMenu([mainScreen()]);
    else if (screen === 'debug') toggleBoard(); // /debug — тумблер: открыть/закрыть
    else if (screen === 'makeup') openMenu([mainScreen(), makeupScreen()]);
    else if (screen === 'creator') openMenu([mainScreen(), creatorScreen()]);
});

// принудительное закрытие всего UI (перед перезапуском паков)
A.on('ui:forceClose', () => {
    $('cmdpanel').classList.add('hidden');
    if (boardOpen) closeBoard(); // перед пересборкой паков доску тоже гасим
    if (mode) closeUI();
});

function closeUI() {
    // доска дебага живёт своей жизнью: закрывается только /debug или кнопкой в меню
    const wasBoard = mode === 'board';
    if (makeupCamOn) {
        makeupCamOn = false;
        A.emit('makeup:cam', false);
    }
    if (tattooOpen) {
        tattooOpen = false;
        A.emit('tattoo:closePreview');
    }
    A.emit('ui:typing', false);
    mode = boardOpen ? 'board' : null;
    inputMode = null;
    $('chatinput').classList.add('hidden');
    $('menu').classList.add('hidden');
    $('chatlog').classList.remove('active');
    if (boardOpen) {
        // доска остаётся на экране; Escape прямо из доски отпускает курсор,
        // чтобы можно было ходить — вернуть его можно тильдой
        $('clothboard').classList.remove('hidden');
        setHints('board');
        if (wasBoard) A.emit('ui:cursor', false);
        A.emit('ui:closed'); // модального UI больше нет — хоткеи снова живые
        return;
    }
    setHints('default');
    A.emit('ui:closed');
}

// ---------- чат ----------

function openChat(prefill) {
    // чат открывается поверх меню; доску не трогаем — она закрывается только /debug
    if (boardOpen) A.emit('ui:cursor', false); // курсор мешает набору
    inputMode = null;
    stack = [];
    $('menu').classList.add('hidden');

    mode = 'chat';
    $('chatlog').classList.add('active');
    $('chatinput').classList.remove('hidden');
    const f = $('chatfield');
    f.value = prefill;
    setTimeout(() => f.focus(), 0);
    setHints('chat');
    histPos = -1;
    updateSug();
    A.emit('ui:typing', true); // глушим бинды и управление на время набора
}

// ---------- красный алерт (команда не найдена / упала) ----------

let cmdAlertTimer = null;
A.on('cmd:alert', (text) => {
    const el = $('cmdalert');
    el.textContent = String(text);
    el.classList.remove('hidden');
    clearTimeout(cmdAlertTimer);
    cmdAlertTimer = setTimeout(() => el.classList.add('hidden'), 2200);
});

// ---------- подсказки команд ----------
// печатаешь "/" — снизу список подходящих команд; ↑↓ выбор, Tab подставляет.
// раскладку можно не переключать: "/вуи" находит /debug (маппинг йцукен->qwerty)

const RU2EN = {
    'й': 'q', 'ц': 'w', 'у': 'e', 'к': 'r', 'е': 't', 'н': 'y', 'г': 'u', 'ш': 'i', 'щ': 'o', 'з': 'p',
    'х': '[', 'ъ': ']', 'ф': 'a', 'ы': 's', 'в': 'd', 'а': 'f', 'п': 'g', 'р': 'h', 'о': 'j', 'л': 'k',
    'д': 'l', 'ж': ';', 'э': "'", 'я': 'z', 'ч': 'x', 'с': 'c', 'м': 'v', 'и': 'b', 'т': 'n', 'ь': 'm',
    'б': ',', 'ю': '.', 'ё': '`',
};
const ruFix = (s) => s.split('').map((ch) => RU2EN[ch] ?? ch).join('');
const cmdName = (code) => code.split(' ')[0].slice(1); // '/tp x y z' -> 'tp'

let sugList = [];
let sugIndex = 0;

// история отправленных команд: ↑ — предыдущая, ↓ — обратно к пустой строке
const cmdHistory = [];
let histPos = -1;

function updateSug() {
    const v = $('chatfield').value;
    const prev = sugList[sugIndex];
    sugList = [];
    if (mode === 'chat' && v.startsWith('/')) {
        if (!v.includes(' ')) {
            const raw = v.slice(1).toLowerCase();
            const alt = ruFix(raw);
            sugList = COMMANDS.filter(([code]) => {
                const n = cmdName(code);
                return n.startsWith(raw) || n.startsWith(alt);
            });
        } else {
            // команда уже набрана — оставляем её строку как шпаргалку по аргументам
            const n = v.slice(1, v.indexOf(' ')).toLowerCase();
            sugList = COMMANDS.filter(([code]) => cmdName(code) === n && code.includes(' '));
        }
    }
    sugIndex = Math.max(0, sugList.indexOf(prev));
    renderSug();
}

function renderSug() {
    const box = $('chatsug');
    box.innerHTML = '';
    if (!sugList.length) {
        box.classList.add('hidden');
        return;
    }
    box.classList.remove('hidden');
    sugList.forEach(([code, desc], i) => {
        const row = document.createElement('div');
        row.className = 'sug-row' + (i === sugIndex ? ' sel' : '');
        const c = document.createElement('span');
        c.className = 'sug-code';
        c.textContent = code;
        const d = document.createElement('span');
        d.className = 'sug-desc';
        d.textContent = desc;
        row.appendChild(c);
        row.appendChild(d);
        // mousedown, не click: поле не должно терять фокус
        row.addEventListener('mousedown', (e) => {
            e.preventDefault();
            sugIndex = i;
            applySug();
        });
        box.appendChild(row);
    });
    const sel = box.children[sugIndex];
    if (sel) sel.scrollIntoView({ block: 'nearest' });
}

function applySug() {
    const s = sugList[sugIndex];
    if (!s) return;
    const code = s[0];
    $('chatfield').value = '/' + cmdName(code) + (code.includes(' ') ? ' ' : '');
    updateSug();
}

$('chatfield').addEventListener('input', () => {
    histPos = -1; // руками начали печатать — листание истории сбрасывается
    updateSug();
});

$('chatfield').addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
        const v = $('chatfield').value.trim();
        if (v) {
            if (cmdHistory[0] !== v) cmdHistory.unshift(v);
            if (cmdHistory.length > 30) cmdHistory.pop();
            A.emit('chat:send', v);
        }
        closeUI();
    } else if (e.key === 'Escape') {
        closeUI();
    } else if (e.key === 'Tab') {
        e.preventDefault();
        applySug();
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (sugList.length > 1) {
            sugIndex = (sugIndex + 1) % sugList.length;
            renderSug();
        } else if (histPos > -1) {
            // вниз — назад к более свежим и в конце к пустой строке
            histPos--;
            $('chatfield').value = histPos === -1 ? '' : cmdHistory[histPos];
            updateSug();
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (sugList.length > 1) {
            sugIndex = (sugIndex - 1 + sugList.length) % sugList.length;
            renderSug();
        } else if (cmdHistory.length) {
            histPos = Math.min(histPos + 1, cmdHistory.length - 1);
            $('chatfield').value = cmdHistory[histPos];
            updateSug();
        }
    }
});

// пока чат открыт, поле не отдаёт фокус — иначе Enter/Escape перестают работать
$('chatfield').addEventListener('blur', () => {
    if (mode === 'chat') setTimeout(() => $('chatfield').focus(), 0);
});

// ================= движок меню =================
// экран: { title, items[], index, foot }
// пункт:  { label, sub }            — подменю (функция -> экран)
//         { label, run, stay }      — действие (stay: не закрывать меню)
//         { label, value, adjust }  — регулируемое значение (←→)
//         { label, input: { placeholder, submit } } — ввод текста
//         { sep: true }             — разделитель

let stack = [];
let inputMode = null; // { item, el }

function openMenu(initialStack) {
    mode = 'menu';
    stack = initialStack;
    $('menu').classList.remove('hidden');
    setHints('menu');
    renderMenu();
}

function cur() {
    return stack[stack.length - 1];
}

function renderMenu() {
    const s = cur();
    $('menu-title').textContent = stack.map((x) => x.title).join(' › ');
    const box = $('menu-items');
    box.innerHTML = '';
    s.items.forEach((item, i) => {
        const div = document.createElement('div');
        if (item.sep) {
            div.className = 'mi sep';
            box.appendChild(div);
            return;
        }
        div.className = 'mi' + (i === s.index ? ' sel' : '') + (item.danger ? ' danger' : '') + (item.on ? ' on' : '');

        const label = document.createElement('span');
        label.textContent = item.label;
        div.appendChild(label);

        if (inputMode && inputMode.item === item) {
            const inp = document.createElement('input');
            inp.placeholder = item.input.placeholder;
            div.appendChild(inp);
            inputMode.el = inp;
        } else if (item.value) {
            const val = document.createElement('span');
            val.className = 'val';
            val.textContent = `‹ ${item.value()} ›`;
            div.appendChild(val);
        } else if (item.sub) {
            const ar = document.createElement('span');
            ar.className = 'sub-arrow';
            ar.textContent = '›';
            div.appendChild(ar);
        }
        box.appendChild(div);
    });
    const selEl = box.children[s.index];
    if (selEl) selEl.scrollIntoView({ block: 'nearest' });
    // позиция среди пунктов без учёта разделителей
    const posNoSep = s.items.slice(0, s.index + 1).filter((x) => !x.sep).length;
    $('menu-foot').textContent = s.foot ?? `${posNoSep}/${s.items.filter((x) => !x.sep).length}`;

    if (inputMode && inputMode.el) setTimeout(() => inputMode.el.focus(), 0);
}

function moveSel(dir) {
    const s = cur();
    let i = s.index;
    for (let n = 0; n < s.items.length; n++) {
        i = (i + dir + s.items.length) % s.items.length;
        if (!s.items[i].sep) break;
    }
    s.index = i;
    renderMenu();
}

function menuKey(e) {
    if (inputMode) {
        if (e.key === 'Enter') {
            const text = inputMode.el.value.trim();
            const item = inputMode.item;
            inputMode = null;
            A.emit('ui:typing', false);
            if (text) item.input.submit(text);
            setHints('menu');
            renderMenu();
        } else if (e.key === 'Escape') {
            inputMode = null;
            A.emit('ui:typing', false);
            setHints('menu');
            renderMenu();
        }
        return;
    }

    const s = cur();
    const item = s.items[s.index];

    switch (e.key) {
        case 'ArrowUp': moveSel(-1); break;
        case 'ArrowDown': moveSel(1); break;
        case 'ArrowLeft': if (item.adjust) { item.adjust(-1); renderMenu(); } break;
        case 'ArrowRight': if (item.adjust) { item.adjust(1); renderMenu(); } break;
        case 'Enter':
            if (item.sub) {
                const next = item.sub();
                next.index = next.index ?? 0;
                stack.push(next);
                renderMenu();
            } else if (item.board) {
                openBoard();
            } else if (item.run) {
                item.run();
                if (!item.stay) closeUI();
                else renderMenu();
            } else if (item.input) {
                inputMode = { item, el: null };
                A.emit('ui:typing', true);
                setHints('input');
                renderMenu();
            }
            break;
        case 'Backspace':
            if (stack.length > 1) {
                const popped = stack.pop();
                if (popped.makeup && makeupCamOn) {
                    makeupCamOn = false;
                    A.emit('makeup:cam', false);
                }
                if (popped.tattoo && tattooOpen) {
                    tattooOpen = false;
                    A.emit('tattoo:closePreview');
                }
                renderMenu();
            } else {
                closeUI();
            }
            break;
        case 'Escape':
            closeUI();
            break;
    }
}

document.addEventListener('keydown', (e) => {
    if (mode === 'board') {
        e.uiConsumed = true; // cmd-панель не должна съесть тот же Escape
        boardKey(e);
        return;
    }
    if (mode !== 'menu') return;
    if (inputMode && e.key !== 'Enter' && e.key !== 'Escape') return; // текст печатается в input
    e.uiConsumed = true;
    e.preventDefault();
    menuKey(e);
});

// ================= экраны меню =================

function act(type, value, message) {
    A.emit('menu:action', type, value ?? null);
    if (message) toast(message);
}

function mainScreen() {
    return {
        title: 'Menu',
        index: 0,
        items: [
            { label: 'Player', sub: playerScreen },
            { label: 'Creator', sub: creatorScreen },
            { label: 'Makeup studio', sub: makeupScreen },
            { label: 'Tattoos & hair bases', sub: tattooScreen },
            { label: 'Ped model', sub: pedScreen },
            { label: 'Animations', sub: animScreen },
            { label: 'Teleport', sub: tpScreen },
            { label: 'Vehicles', sub: vehiclesScreen },
            { label: 'Weapons', sub: weaponsScreen },
            { label: 'Weather', sub: weatherScreen },
            { label: 'Time', sub: timeScreen },
            { label: 'Objects', sub: objectsScreen },
            { label: 'Attach props', sub: attachScreen },
            { sep: true },
            {
                // пока доска закрыта — «открыть», когда открыта — красный «закрыть»
                label: boardOpen ? 'Close clothes debug' : 'Open clothes debug',
                danger: boardOpen,
                run: () => { toggleBoard(); if (boardOpen) toast('Debug board open — /debug to close'); },
            },
            { sep: true },
            { label: 'UI scale', value: () => `${Math.round(uiScale * 100)}%`, adjust: (d) => setUiScale(d) },
            {
                label: 'Reset HUD positions',
                run: () => {
                    delete savedPos.__hudPos;
                    savePositions();
                    setTimeout(() => { location.href = '/?t=' + Date.now(); }, 300);
                },
            },
            { label: 'Close', run: () => {} },
        ],
    };
}

function playerScreen() {
    return {
        title: 'Player',
        items: [
            { label: 'Heal', run: () => act('heal', null, 'Health restored'), stay: true },
            { label: 'Armor', run: () => act('armour', null, 'Armor given'), stay: true },
            { label: 'God mode on/off', run: () => act('godmode'), stay: true },
            { sep: true },
            { label: 'Switch gender (male/female)', run: () => act('gender'), stay: true },
            { sep: true },
            { label: 'Noclip on/off', run: () => act('noclip') },
            { label: 'Photo mode on/off', run: () => act('freecam') },
        ],
    };
}

// ---------- creator: внешность freemode-педа ----------
// зеркало состояния приходит с клиента (face:state), правки шлём целиком

const face = {
    shapeFirst: 0, shapeSecond: 0, skinFirst: 0, skinSecond: 0,
    shapeMix: 0.5, skinMix: 0.5, features: {},
    hair: 0, hairColor: 0, hairHighlight: 0,
    eyebrows: 0, eyebrowsColor: 0,
    beard: -1, beardColor: 0, eyeColor: 0,
    overlays: {},
};

A.on('face:state', (s) => {
    if (s && typeof s === 'object') Object.assign(face, s);
    if (mode === 'menu') renderMenu();
});

function pushFace() {
    A.emit('face:apply', JSON.parse(JSON.stringify(face)));
}

function cycle(v, d, max, min = 0) {
    if (v + d > max) return min;
    if (v + d < min) return max;
    return v + d;
}

function creatorScreen() {
    A.emit('face:request');
    return {
        title: 'Creator',
        foot: '←→ change value — applies instantly (freemode ped only)',
        items: [
            { label: 'Father face', value: () => String(face.shapeFirst), adjust: (d) => { face.shapeFirst = cycle(face.shapeFirst, d, 45); pushFace(); } },
            { label: 'Mother face', value: () => String(face.shapeSecond), adjust: (d) => { face.shapeSecond = cycle(face.shapeSecond, d, 45); pushFace(); } },
            { label: 'Father skin', value: () => String(face.skinFirst), adjust: (d) => { face.skinFirst = cycle(face.skinFirst, d, 45); pushFace(); } },
            { label: 'Mother skin', value: () => String(face.skinSecond), adjust: (d) => { face.skinSecond = cycle(face.skinSecond, d, 45); pushFace(); } },
            { label: 'Shape mix', value: () => face.shapeMix.toFixed(2), adjust: (d) => { face.shapeMix = Math.min(1, Math.max(0, face.shapeMix + d * 0.05)); pushFace(); } },
            { label: 'Skin mix', value: () => face.skinMix.toFixed(2), adjust: (d) => { face.skinMix = Math.min(1, Math.max(0, face.skinMix + d * 0.05)); pushFace(); } },
            { sep: true },
            { label: 'Face features', sub: featuresScreen },
            { sep: true },
            { label: 'Hair', value: () => String(face.hair), adjust: (d) => { face.hair = cycle(face.hair, d, 80); pushFace(); } },
            { label: 'Hair color', value: () => String(face.hairColor), adjust: (d) => { face.hairColor = cycle(face.hairColor, d, 63); pushFace(); } },
            { label: 'Hair highlight', value: () => String(face.hairHighlight), adjust: (d) => { face.hairHighlight = cycle(face.hairHighlight, d, 63); pushFace(); } },
            { label: 'Eyebrows', value: () => String(face.eyebrows), adjust: (d) => { face.eyebrows = cycle(face.eyebrows, d, 33); pushFace(); } },
            { label: 'Eyebrows color', value: () => String(face.eyebrowsColor), adjust: (d) => { face.eyebrowsColor = cycle(face.eyebrowsColor, d, 63); pushFace(); } },
            { label: 'Beard', value: () => (face.beard < 0 ? 'none' : String(face.beard)), adjust: (d) => { face.beard = cycle(face.beard, d, 28, -1); pushFace(); } },
            { label: 'Beard color', value: () => String(face.beardColor), adjust: (d) => { face.beardColor = cycle(face.beardColor, d, 63); pushFace(); } },
            { label: 'Eye color', value: () => String(face.eyeColor), adjust: (d) => { face.eyeColor = cycle(face.eyeColor, d, 31); pushFace(); } },
        ],
    };
}

function featuresScreen() {
    return {
        title: 'Face features',
        foot: '←→ from -1.0 to 1.0 — applies instantly',
        items: FACE_FEATURES.map((name, i) => ({
            label: name,
            value: () => Number(face.features[i] ?? 0).toFixed(1),
            adjust: (d) => {
                const v = Math.min(1, Math.max(-1, Number(face.features[i] ?? 0) + d * 0.1));
                face.features[i] = Math.round(v * 10) / 10;
                pushFace();
            },
        })),
    };
}

// ---------- студия макияжа ----------
// камера зумится на лицо; нативы считают стили ВМЕСТЕ с DLC facial_overlays

const MAKEUP_CATS = [
    [4, 'Makeup', 2],
    [5, 'Blush', 2],
    [8, 'Lipstick', 2],
    [0, 'Blemishes', 0],
    [3, 'Ageing', 0],
    [6, 'Complexion', 0],
    [7, 'Sun damage', 0],
    [9, 'Moles & freckles', 0],
];

let mkCat = 0; // индекс в MAKEUP_CATS
let mkInfo = { counts: {}, hairColors: 64, makeupColors: 64 };
let makeupCamOn = false;

A.on('makeup:info', (info) => {
    if (info && typeof info === 'object') mkInfo = info;
    if (mode === 'menu') renderMenu();
});

// колесо в студии: фокус у WebView, до игровых нативов скролл не доходит —
// ловим его здесь и шлём клиенту как зум камеры
document.addEventListener('wheel', (e) => {
    if (!makeupCamOn) return;
    A.emit('makeup:zoom', e.deltaY > 0 ? 1 : -1);
}, { passive: true });

function mkOverlay() {
    const id = MAKEUP_CATS[mkCat][0];
    face.overlays = face.overlays ?? {};
    face.overlays[id] = face.overlays[id] ?? { i: -1, o: 1, c1: 0, c2: 0 };
    return face.overlays[id];
}

function mkCount() {
    return Number(mkInfo.counts?.[MAKEUP_CATS[mkCat][0]] ?? 0);
}

function mkColored() {
    return MAKEUP_CATS[mkCat][2] > 0;
}

function mkColorMax() {
    return Math.max((MAKEUP_CATS[mkCat][2] === 2 ? mkInfo.makeupColors : mkInfo.hairColors) - 1, 0);
}

function makeupScreen() {
    A.emit('face:request');
    A.emit('makeup:info');
    makeupCamOn = true;
    A.emit('makeup:cam', true);
    return {
        title: 'Makeup studio',
        makeup: true,
        foot: 'A/D orbit · W/S height · wheel zoom · Bksp exit',
        items: [
            {
                label: 'Category',
                value: () => `${MAKEUP_CATS[mkCat][1]} (${mkCount()})`,
                adjust: (d) => { mkCat = ((mkCat + d) % MAKEUP_CATS.length + MAKEUP_CATS.length) % MAKEUP_CATS.length; },
            },
            {
                label: 'Style',
                value: () => {
                    const s = mkOverlay();
                    return s.i < 0 ? `none / ${Math.max(mkCount() - 1, 0)}` : `${s.i} / ${Math.max(mkCount() - 1, 0)}`;
                },
                adjust: (d) => {
                    const s = mkOverlay();
                    const count = mkCount();
                    if (!count) return;
                    let v = s.i + d;
                    if (v < -1) v = count - 1;
                    if (v >= count) v = -1;
                    s.i = v;
                    pushFace();
                },
            },
            {
                label: 'Opacity',
                value: () => mkOverlay().o.toFixed(1),
                adjust: (d) => {
                    const s = mkOverlay();
                    s.o = Math.min(1, Math.max(0, Math.round((s.o + d * 0.1) * 10) / 10));
                    pushFace();
                },
            },
            {
                label: 'Color',
                value: () => (mkColored() ? String(mkOverlay().c1) : '—'),
                adjust: (d) => {
                    if (!mkColored()) return;
                    const s = mkOverlay();
                    const max = mkColorMax();
                    s.c1 = s.c1 + d < 0 ? max : (s.c1 + d > max ? 0 : s.c1 + d);
                    pushFace();
                },
            },
            {
                label: 'Color 2',
                value: () => (mkColored() ? String(mkOverlay().c2) : '—'),
                adjust: (d) => {
                    if (!mkColored()) return;
                    const s = mkOverlay();
                    const max = mkColorMax();
                    s.c2 = s.c2 + d < 0 ? max : (s.c2 + d > max ? 0 : s.c2 + d);
                    pushFace();
                },
            },
            { sep: true },
            {
                // линзы: нативный цвет глаз педа, 32 штатных варианта (0-31);
                // кастомные паки линз расширяют этот же индекс
                label: 'Eye color (lens)',
                value: () => `${Number(face.eyeColor) || 0} / 31`,
                adjust: (d) => {
                    const v = (Number(face.eyeColor) || 0) + d;
                    face.eyeColor = v < 0 ? 31 : v > 31 ? 0 : v;
                    pushFace();
                },
            },
            { sep: true },
            {
                label: 'Remove current category',
                danger: true,
                run: () => {
                    mkOverlay().i = -1;
                    pushFace();
                    toast(`${MAKEUP_CATS[mkCat][1]} removed`);
                },
                stay: true,
            },
            {
                label: 'Copy values',
                run: () => {
                    const [id, name] = MAKEUP_CATS[mkCat];
                    const s = mkOverlay();
                    copyToClipboard(`overlay ${id} (${name}): style ${s.i}, opacity ${s.o}, colors ${s.c1}/${s.c2}`);
                    toast('Values copied');
                },
                stay: true,
            },
        ],
    };
}

function pedScreen() {
    return {
        title: 'Ped model',
        foot: 'creator/clothes work on freemode peds only',
        items: [
            {
                label: 'Enter model…',
                input: { placeholder: 'e.g. a_m_y_skater_01', submit: (m) => act('pedmodel', m, `Ped: ${m}`) },
            },
            { sep: true },
            ...PEDS.map((m) => ({
                label: m,
                run: () => act('pedmodel', m, `Ped: ${m}`),
                stay: true,
            })),
        ],
    };
}

function animScreen() {
    return {
        title: 'Animations',
        items: [
            { label: 'Stop animation', danger: true, run: () => act('animStop'), stay: true },
            { sep: true },
            ...ANIMS.map(({ label, v }) => ({
                label,
                run: () => act('anim', v, label),
                stay: true,
            })),
        ],
    };
}

function tpScreen() {
    return {
        title: 'Teleport',
        items: [
            { label: 'To map waypoint', run: () => act('tpWaypoint') },
            { label: 'To spawn', run: () => act('tp', [-75.26, -818.72, 326.18]) },
            { sep: true },
            {
                label: 'Coordinates…',
                input: {
                    placeholder: 'x y z (space or comma separated)',
                    submit: (text) => {
                        const parts = text.split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
                        if (parts.length === 3) {
                            act('tp', parts);
                        } else {
                            toast('Need three numbers: x y z');
                        }
                    },
                },
            },
        ],
    };
}

function vehiclesScreen() {
    return {
        title: 'Vehicles',
        items: [
            { label: 'Repair', run: () => act('vehRepair', null, 'Repaired'), stay: true },
            { label: 'Delete', danger: true, run: () => act('vehDelete', null, 'Deleted'), stay: true },
            { sep: true },
            {
                label: 'Enter model…',
                input: { placeholder: 'e.g. elegy2', submit: (m) => act('vehicle', m, `Spawning: ${m}`) },
            },
            { sep: true },
            ...VEHICLES.map((m) => ({
                label: m,
                run: () => act('vehicle', m, `Spawning: ${m}`),
                stay: true,
            })),
        ],
    };
}

// ---------------- тату и hair-подложки ----------------
// каталог живёт на клиенте (ваниль + кастом-паки); мы только листаем по категориям.
// Подложки под причёски (Hair base) — те же декорации, что и тату

const TAT_CATS = [
    ['TORSO', 'Torso'], ['HEAD', 'Head'], ['LEFT_ARM', 'Left arm'], ['RIGHT_ARM', 'Right arm'],
    ['LEFT_LEG', 'Left leg'], ['RIGHT_LEG', 'Right leg'], ['HAIR', 'Hair base'],
];
let tatCat = 0;
let tatInfo = { name: '—', idx: -1, count: 0, applied: 0 };
let tattooOpen = false;
let tatHairShown = true; // в категории подложек причёску по умолчанию убираем

A.on('tattoo:info', (info) => {
    if (info && typeof info === 'object') tatInfo = info;
    if (mode === 'menu') renderMenu();
});

A.on('tattoo:applied', (n) => {
    tatInfo.applied = Number(n) || 0;
    if (mode === 'menu') renderMenu();
});

function tattooScreen() {
    tattooOpen = true;
    A.emit('tattoo:menu', true); // раздеть педа на время листания — тату видно по всему телу
    tatHairShown = TAT_CATS[tatCat][0] !== 'HAIR';
    A.emit('tattoo:hair', tatHairShown);
    A.emit('tattoo:nav', TAT_CATS[tatCat][0], 0); // показать текущую позицию
    return {
        title: 'Tattoos & hair bases',
        tattoo: true,
        foot: '←→ browse (live preview) · filtered by gender',
        items: [
            {
                label: 'Category',
                value: () => TAT_CATS[tatCat][1],
                adjust: (d) => {
                    tatCat = ((tatCat + d) % TAT_CATS.length + TAT_CATS.length) % TAT_CATS.length;
                    // на подложках прячем причёску, на остальных зонах возвращаем
                    tatHairShown = TAT_CATS[tatCat][0] !== 'HAIR';
                    A.emit('tattoo:hair', tatHairShown);
                    A.emit('tattoo:nav', TAT_CATS[tatCat][0], 0);
                },
            },
            {
                label: 'Browse',
                value: () => (tatInfo.count ? `${tatInfo.name} (${tatInfo.idx + 1}/${tatInfo.count})` : 'none available'),
                adjust: (d) => A.emit('tattoo:nav', TAT_CATS[tatCat][0], d),
            },
            { label: 'Add current', run: () => { A.emit('tattoo:add'); toast('Tattoo added'); }, stay: true },
            {
                // подложка рисуется под причёской: тумблер, чтобы глянуть и так, и так
                label: 'Hair',
                value: () => (tatHairShown ? 'shown' : 'hidden'),
                adjust: () => {
                    tatHairShown = !tatHairShown;
                    A.emit('tattoo:hair', tatHairShown);
                },
            },
            {
                // подложки красятся хэйр-тинтом — тот же Hair color, что в креаторе
                label: 'Hair color (tint)',
                value: () => String(Number(face.hairColor) || 0),
                adjust: (d) => {
                    const max = Math.max((mkInfo.hairColors || 64) - 1, 0);
                    const v = (Number(face.hairColor) || 0) + d;
                    face.hairColor = v < 0 ? max : v > max ? 0 : v;
                    pushFace();
                },
            },
            { sep: true },
            { label: 'Applied total', value: () => String(tatInfo.applied) },
            { label: 'Remove last added', run: () => A.emit('tattoo:removeLast'), stay: true },
            {
                label: 'Clear all tattoos',
                danger: true,
                run: () => { A.emit('tattoo:clear'); toast('All tattoos cleared'); },
                stay: true,
            },
        ],
    };
}

function weaponsScreen() {
    return {
        title: 'Weapons',
        weapons: true, // сюда разрешено класть асинхронный экран модов
        items: [
            { label: 'Mods: current weapon', run: () => A.emit('wmods:request'), stay: true },
            { label: 'Give ammo (500)', run: () => act('ammo', 500), stay: true },
            {
                label: 'Custom hash...',
                input: { placeholder: 'weapon_name / 0x83BF0278 / 2210333304', submit: (v) => act('weapon', v, `Given: ${v}`) },
            },
            { sep: true },
            { label: 'Give all weapons', run: () => act('weaponAll', null, 'Arsenal given'), stay: true },
            { label: 'Remove all weapons', danger: true, run: () => act('weaponsClear', null, 'Weapons removed'), stay: true },
            { sep: true },
            ...WEAPONS.map(([code]) => ({
                label: code,
                run: () => act('weapon', code, `Given: ${code}`),
                stay: true,
            })),
        ],
    };
}

// ---------- моды текущего оружия (список приходит с клиента) ----------

A.on('wmods:list', (weapon, mods) => {
    if (mode !== 'menu') return;
    const top = cur();
    // ответ асинхронный: кладём экран только если юзер всё ещё в оружии/модах
    if (!top || !(top.wmods || top.weapons)) return;
    const screen = wmodsScreen(weapon, mods);
    if (top.wmods) {
        screen.index = Math.min(top.index ?? 0, screen.items.length - 1);
        stack.pop();
    }
    stack.push(screen);
    renderMenu();
});

function wmodsScreen(weapon, mods) {
    return {
        title: `Mods: ${weapon ? weapon.replace('weapon_', '') : 'no weapon'}`,
        wmods: true,
        index: 0,
        foot: mods.length ? 'Enter — toggle mod (green = equipped)' : 'Take a weapon in hands first',
        items: mods.length
            ? mods.map((m) => ({
                label: `${m.active ? '● ' : '○ '}${m.label}`,
                on: m.active, // подсветка зелёным
                run: () => A.emit('wmods:toggle', m.name),
                stay: true,
            }))
            : [{ label: 'No mods available', run: () => {}, stay: true }],
    };
}

function weatherScreen() {
    return {
        title: 'Weather',
        items: WEATHERS.map((name, i) => ({
            label: name,
            run: () => act('weather', i, `Weather: ${name}`),
            stay: true,
        })),
    };
}

function timeScreen() {
    let hour = 12;
    return {
        title: 'Time',
        foot: '←→ hour — applies instantly',
        items: [
            { label: 'Morning (06:00)', run: () => act('time', 6, 'Time: 06:00'), stay: true },
            { label: 'Day (12:00)', run: () => act('time', 12, 'Time: 12:00'), stay: true },
            { label: 'Evening (19:00)', run: () => act('time', 19, 'Time: 19:00'), stay: true },
            { label: 'Night (00:00)', run: () => act('time', 0, 'Time: 00:00'), stay: true },
            { sep: true },
            {
                label: 'Hour',
                value: () => `${String(hour).padStart(2, '0')}:00`,
                adjust: (d) => {
                    hour = (hour + d + 24) % 24;
                    act('time', hour); // применяется сразу, без Apply
                },
            },
        ],
    };
}

// ---------- прикрепление пропов к костям ----------

let propList = []; // зеркало прикреплённого, приходит с клиента

A.on('prop:list', (list) => {
    propList = Array.isArray(list) ? list : [];
    if (mode !== 'menu') return;
    // редактируемый проп удалён — выходим из его редактора
    let top = cur();
    if (top && top.propEdit != null && !propList.find((p) => p.id === top.propEdit)) {
        stack.pop();
        top = cur();
    }
    // список прикреплённого пересобираем на месте
    if (top && top.propsList) {
        const idx = top.index ?? 0;
        stack.pop();
        const s = attachScreen(false);
        s.index = Math.min(idx, s.items.length - 1);
        stack.push(s);
    }
    renderMenu();
});

function attachScreen(request = true) {
    if (request) A.emit('prop:request');
    return {
        title: 'Attach props',
        propsList: true,
        index: 0,
        foot: 'custom models from your packs work too',
        items: [
            {
                label: 'Enter model… (custom allowed)',
                input: { placeholder: 'prop_...', submit: (m) => A.emit('prop:add', m) },
            },
            { label: 'Detach all', danger: true, run: () => A.emit('prop:clear'), stay: true },
            { sep: true },
            ...propList.map((p) => ({
                label: `#${p.id} ${p.model} → ${ATTACH_BONES[p.bone]?.[1] ?? '?'}`,
                sub: () => propEditScreen(p.id),
            })),
            { sep: true },
            ...ATTACH_PROPS.map((m) => ({
                label: m,
                run: () => { A.emit('prop:add', m); toast('Attached: ' + m); },
                stay: true,
            })),
        ],
    };
}

function propEditScreen(id) {
    const cur2 = () => propList.find((p) => p.id === id);
    const push = () => {
        const p = cur2();
        if (p) A.emit('prop:set', id, p.bone, p.pos, p.rot);
    };
    const axis = (label, obj, key, step, fmt) => ({
        label,
        value: () => {
            const p = cur2();
            return p ? fmt(p[obj][key]) : '—';
        },
        adjust: (d) => {
            const p = cur2();
            if (!p) return;
            p[obj][key] = Math.round((p[obj][key] + d * step) * 1000) / 1000;
            push();
        },
    });
    return {
        title: `Prop #${id}`,
        propEdit: id,
        foot: '←→ tweak · hold for repeat · values apply live',
        items: [
            {
                label: 'Bone',
                value: () => {
                    const p = cur2();
                    return p ? ATTACH_BONES[p.bone]?.[1] ?? '?' : '—';
                },
                adjust: (d) => {
                    const p = cur2();
                    if (!p) return;
                    p.bone = ((p.bone + d) % ATTACH_BONES.length + ATTACH_BONES.length) % ATTACH_BONES.length;
                    push();
                },
            },
            { sep: true },
            axis('Offset X', 'pos', 'x', 0.01, (v) => v.toFixed(2)),
            axis('Offset Y', 'pos', 'y', 0.01, (v) => v.toFixed(2)),
            axis('Offset Z', 'pos', 'z', 0.01, (v) => v.toFixed(2)),
            axis('Rotation X', 'rot', 'x', 5, (v) => v.toFixed(0) + '°'),
            axis('Rotation Y', 'rot', 'y', 5, (v) => v.toFixed(0) + '°'),
            axis('Rotation Z', 'rot', 'z', 5, (v) => v.toFixed(0) + '°'),
            { sep: true },
            {
                label: 'Copy values',
                run: () => {
                    const p = cur2();
                    if (!p) return;
                    const [boneId, boneName] = ATTACH_BONES[p.bone] ?? [0, '?'];
                    copyToClipboard(`${p.model} bone ${boneId} (${boneName}) pos ${p.pos.x}, ${p.pos.y}, ${p.pos.z} rot ${p.rot.x}, ${p.rot.y}, ${p.rot.z}`);
                    toast('Values copied');
                },
                stay: true,
            },
            { label: 'Detach', danger: true, run: () => A.emit('prop:remove', id), stay: true },
        ],
    };
}

function objectsScreen() {
    return {
        title: 'Objects',
        items: [
            {
                label: 'Enter model…',
                input: { placeholder: 'e.g. prop_barrel_02a', submit: (m) => act('object', m, `Object: ${m}`) },
            },
            { label: 'Delete my objects', danger: true, run: () => act('objectsClear'), stay: true },
            { sep: true },
            ...OBJECTS.map((m) => ({
                label: m,
                run: () => act('object', m, `Object: ${m}`),
                stay: true,
            })),
        ],
    };
}

// ---------- дебаг одежды: доска панелек по всем категориям ----------
// Все 17 категорий видны сразу, панельки таскаются за название,
// раскладка сохраняется в localStorage до следующего захода

let boardOpen = false;
let activeKey = null;
const dbgMap = {}; // key -> { kind, comp, drawable, texture, drawables, textures }
const keyOf = (kind, comp) => `${kind}-${comp}`;
const BOARD_KEYS = CLOTH_COMPONENTS.map(([k, c]) => keyOf(k, c));
let stripsBuilt = false;

const POS_STORE = 'clothboard-pos-v1';
let savedPos = {};
try {
    savedPos = JSON.parse(localStorage.getItem(POS_STORE) || '{}');
} catch (e) { savedPos = {}; }

function savePositions() {
    savedPos.__ts = Date.now(); // метка свежести для слияния с серверной копией
    try {
        localStorage.setItem(POS_STORE, JSON.stringify(savedPos));
    } catch (e) { /* пусто */ }
    A.emit('layout:save', savedPos); // дублируем на сервер — надёжнее localStorage
}

// раскладка с сервера (переживает пересоздание кэша WebView).
// Если локальная копия свежее серверной — оставляем локальную и досылаем её
A.on('layout:apply', (layout) => {
    if (!layout || typeof layout !== 'object') return;
    if (Number(savedPos.__ts ?? 0) > Number(layout.__ts ?? 0)) {
        A.emit('layout:save', savedPos);
        return;
    }
    savedPos = layout;
    if (Number(savedPos.__uiScale)) {
        uiScale = Math.min(1.6, Math.max(0.6, Number(savedPos.__uiScale)));
        applyScale();
    }
    applyHudPos();
    repositionStrips();
});

A.on('debug:info', (info) => {
    const key = keyOf(info.kind, info.comp);
    dbgMap[key] = info;
    renderStrip(key);
});

A.on('debug:infoAll', (list) => {
    for (const info of list) {
        const key = keyOf(info.kind, info.comp);
        dbgMap[key] = info;
        renderStrip(key);
    }
});

function wrap(v, count, allowNone) {
    const min = allowNone ? -1 : 0;
    if (count <= 0) return min;
    if (v < min) return count - 1;
    if (v >= count) return min;
    return v;
}

function step(key, field, dir) {
    const c = dbgMap[key];
    if (!c) return;
    const allowNone = c.kind === 'prop';
    if (field === 'drawable') {
        A.emit('debug:set', c.kind, c.comp, wrap(c.drawable + dir, c.drawables, allowNone), 0);
    } else {
        if (c.drawable < 0) return;
        A.emit('debug:set', c.kind, c.comp, c.drawable, wrap(c.texture + dir, c.textures, false));
    }
}

function defaultPos(i) {
    const col = i % 3;
    const row = Math.floor(i / 3);
    // считаем в layout-пикселях (vh уже учитывает zoom)
    return { x: 20 + col * 370, y: vh() - 340 + row * 42 };
}

function mkBtn(text, onClick) {
    const b = document.createElement('button');
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
}

// снап: примагничивание к краям соседних панелек и стыковка в столбик/ряд
function snapPos(el, x, y) {
    const T = 12;
    const GAP = 6;
    let sx = x;
    let sy = y;
    document.querySelectorAll('.strip').forEach((other) => {
        if (other === el) return;
        const ol = other.offsetLeft;
        const ot = other.offsetTop;
        const orx = ol + other.offsetWidth;
        const ob = ot + other.offsetHeight;

        if (Math.abs(ol - x) <= T) sx = ol;                 // левые края
        if (Math.abs(ot - y) <= T) sy = ot;                 // верхние края
        // столбик: прилипнуть под соседа (или над ним), если по X рядом
        if (Math.abs(ol - x) <= T * 4) {
            if (Math.abs((ob + GAP) - y) <= T) { sy = ob + GAP; sx = ol; }
            if (Math.abs((ot - GAP) - (y + el.offsetHeight)) <= T) { sy = ot - GAP - el.offsetHeight; sx = ol; }
        }
        // ряд: прилипнуть справа от соседа, если по Y рядом
        if (Math.abs(ot - y) <= T * 4 && Math.abs((orx + GAP) - x) <= T) {
            sx = orx + GAP;
            sy = ot;
        }
    });
    return { x: sx, y: sy };
}

// лок раскладки: пока включён — панельки не двигаются (защита от случайного сдвига)
let layoutLocked = true;
try {
    layoutLocked = localStorage.getItem('clothboard-locked') !== '0';
} catch (e) { /* пусто */ }

function updateLockButton() {
    const b = document.getElementById('board-lock');
    if (b) {
        b.textContent = layoutLocked ? 'LOCKED' : 'UNLOCKED';
        b.classList.toggle('unlocked', !layoutLocked);
    }
}

document.getElementById('board-lock').addEventListener('click', () => {
    layoutLocked = !layoutLocked;
    try { localStorage.setItem('clothboard-locked', layoutLocked ? '1' : '0'); } catch (e) { /* пусто */ }
    updateLockButton();
    toast(layoutLocked ? 'Layout locked' : 'Layout unlocked — drag panels');
});

function makeStripDraggable(el, handle, key) {
    handle.addEventListener('mousedown', (e) => {
        if (layoutLocked) return;
        // координаты мыши приходят в экранных пикселях — делим на zoom
        const r = el.getBoundingClientRect();
        const dx = e.clientX / uiScale - r.left / uiScale;
        const dy = e.clientY / uiScale - r.top / uiScale;
        const move = (ev) => {
            const p = snapPos(el, ev.clientX / uiScale - dx, ev.clientY / uiScale - dy);
            el.style.left = `${p.x}px`;
            el.style.top = `${p.y}px`;
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            savedPos[key] = { x: el.offsetLeft, y: el.offsetTop };
            savePositions();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
        e.preventDefault();
    });
}

function buildStrips() {
    if (stripsBuilt) return;
    stripsBuilt = true;
    CLOTH_COMPONENTS.forEach(([kind, comp, label], i) => {
        const key = keyOf(kind, comp);
        const el = document.createElement('div');
        el.className = 'strip';
        el.id = `strip-${key}`;
        const pos = savedPos[key] ?? defaultPos(i);
        el.style.left = `${clampX(pos.x)}px`;
        el.style.top = `${clampY(pos.y)}px`;

        const lbl = document.createElement('span');
        lbl.className = 'st-label';
        lbl.textContent = label;
        el.appendChild(lbl);

        el.appendChild(mkBtn('‹', () => step(key, 'drawable', -1)));
        const dv = document.createElement('span');
        dv.className = 'st-val';
        dv.id = `d-${key}`;
        dv.textContent = '—';
        dv.addEventListener('click', () => editValue(key, 'drawable', dv));
        el.appendChild(dv);
        el.appendChild(mkBtn('›', () => step(key, 'drawable', 1)));

        el.appendChild(mkBtn('‹', () => step(key, 'texture', -1)));
        const tv = document.createElement('span');
        tv.className = 'st-val st-tex';
        tv.id = `t-${key}`;
        tv.textContent = '—';
        tv.addEventListener('click', () => editValue(key, 'texture', tv));
        el.appendChild(tv);
        el.appendChild(mkBtn('›', () => step(key, 'texture', 1)));

        el.addEventListener('mousedown', () => setActive(key));
        makeStripDraggable(el, lbl, key);
        $('clothboard').appendChild(el);
    });
}

function setActive(key) {
    activeKey = key;
    document.querySelectorAll('.strip.active').forEach((s) => s.classList.remove('active'));
    const el = document.getElementById(`strip-${key}`);
    if (el) el.classList.add('active');
}

function renderStrip(key) {
    const c = dbgMap[key];
    if (!c) return;
    const dv = document.getElementById(`d-${key}`);
    const tv = document.getElementById(`t-${key}`);
    const bad = c.applied === false ? ' !' : '';
    if (dv) dv.textContent = (c.drawable < 0 ? `—/${Math.max(c.drawables - 1, 0)}` : `${c.drawable}/${Math.max(c.drawables - 1, 0)}`) + bad;
    if (tv) tv.textContent = `${Math.max(c.texture, 0)}/${Math.max(c.textures - 1, 0)}`;
}

// клик по числу — ввод айди, Enter применяет сразу; для пропов валиден -1 (снять)
function editValue(key, field, span) {
    const c = dbgMap[key];
    if (!c || span.querySelector('input')) return;
    const old = span.textContent;
    const inp = document.createElement('input');
    inp.className = 'st-edit';
    inp.placeholder = field === 'drawable' ? String(c.drawable) : String(Math.max(c.texture, 0));
    span.textContent = '';
    span.appendChild(inp);
    setTimeout(() => inp.focus(), 0);
    A.emit('ui:typing', true); // глушим игровые бинды на время набора

    let done = false; // blur при удалении инпута из DOM зовёт finish повторно
    const finish = () => {
        if (done) return;
        done = true;
        A.emit('ui:typing', false);
        span.textContent = old;
        renderStrip(key);
    };

    inp.addEventListener('input', () => {
        // цифры и ведущий минус (-1 = снять проп)
        inp.value = inp.value.replace(/[^\d-]/g, '').replace(/(?!^)-/g, '');
    });
    inp.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
            const v = parseInt(inp.value, 10);
            finish();
            if (!Number.isNaN(v)) {
                if (field === 'drawable') {
                    const min = c.kind === 'prop' ? -1 : 0;
                    A.emit('debug:set', c.kind, c.comp, Math.max(v, min), 0);
                } else if (c.drawable >= 0) {
                    A.emit('debug:set', c.kind, c.comp, c.drawable, Math.max(v, 0));
                }
            }
        } else if (e.key === 'Escape') {
            finish();
        }
    });
    inp.addEventListener('blur', finish);
}

function openBoard() {
    mode = 'board';
    boardOpen = true;
    inputMode = null;
    $('menu').classList.add('hidden');
    buildStrips();
    $('clothboard').classList.remove('hidden');
    setActive(activeKey ?? keyOf('comp', 11));
    setHints('board');
    updateLockButton();
    A.emit('ui:cursor', true);
    A.emit('debug:selectAll');
    // доска — оверлей, а не модалка: клиент не должен считать UI занятым,
    // иначе T/M перестают открывать чат и меню (фокус держит курсор)
    A.emit('ui:closed');
}

// доска закрывается только явно: /debug ещё раз или пункт меню
function closeBoard() {
    boardOpen = false;
    $('clothboard').classList.add('hidden');
    A.emit('ui:cursor', false);
    if (mode === 'board') {
        mode = null;
        setHints('default');
        A.emit('ui:closed');
    }
}

function toggleBoard() {
    if (boardOpen) closeBoard();
    else openBoard();
}

function boardKey(e) {
    if (e.target && e.target.tagName === 'INPUT') return; // идёт ввод айди

    if (e.code === 'KeyQ' || e.code === 'KeyE') {
        const dir = e.code === 'KeyE' ? 1 : -1;
        const i = Math.max(BOARD_KEYS.indexOf(activeKey), 0);
        setActive(BOARD_KEYS[((i + dir) % BOARD_KEYS.length + BOARD_KEYS.length) % BOARD_KEYS.length]);
        e.preventDefault();
        return;
    }
    switch (e.key) {
        case 'ArrowLeft': step(activeKey, 'drawable', -1); break;
        case 'ArrowRight': step(activeKey, 'drawable', 1); break;
        case 'ArrowUp': step(activeKey, 'texture', 1); break;
        case 'ArrowDown': step(activeKey, 'texture', -1); break;
        case 'Enter': {
            const c = dbgMap[activeKey];
            if (c) {
                copyToClipboard(`${c.kind} ${c.comp}: drawable ${c.drawable}, texture ${c.texture}`);
                toast('Values copied');
            }
            break;
        }
        case 'Backspace':
        case 'Escape':
            closeUI();
            break;
        default:
            return;
    }
    e.preventDefault();
}

document.getElementById('board-reset').addEventListener('click', () => {
    A.emit('debug:reset');
    toast('Outfit reset to default');
});

document.getElementById('board-layout').addEventListener('click', () => {
    savedPos = {};
    savePositions();
    CLOTH_COMPONENTS.forEach(([kind, comp], i) => {
        const el = document.getElementById(`strip-${keyOf(kind, comp)}`);
        if (!el) return;
        const pos = defaultPos(i);
        el.style.left = `${pos.x}px`;
        el.style.top = `${pos.y}px`;
    });
    toast('Layout reset');
});

// ================= список команд (справа внизу) =================
// клик по команде подставляет её в чат для ручного ввода

const COMMANDS = [
    ['/help', 'List commands in chat'],
    ['/gender', 'Switch to the opposite gender'],
    ['/ped <model>', 'Change ped model'],
    ['/heal', 'Restore health'],
    ['/armor', 'Give armor'],
    ['/god', 'Toggle god mode'],
    ['/anim <scenario>', 'Play scenario (WORLD_HUMAN_...)'],
    ['/stopanim', 'Stop animation'],
    ['/makeup', 'Makeup studio (face camera)'],
    ['/creator', 'Appearance creator (face, hair, features)'],
    ['/weapon <weapon_x>', 'Give weapon by hash'],
    ['/ammo [count]', 'Ammo for current weapon'],
    ['/guns', 'Give all weapons'],
    ['/clearguns', 'Remove all weapons'],
    ['/veh [model]', 'Spawn vehicle'],
    ['/fix', 'Repair current vehicle'],
    ['/delveh', 'Delete current vehicle'],
    ['/tp x y z', 'Teleport (takes vehicle along)'],
    ['/weather <0-14>', 'Set weather'],
    ['/time <0-23>', 'Set hour'],
    ['/object <model>', 'Spawn prop in front'],
    ['/clearobjects', 'Delete my spawned props'],
    ['/noclip', 'Toggle noclip (F5)'],
    ['/freecam', 'Toggle photo mode (F7)'],
    ['/debug', 'Clothes debug board'],
    ['/setclothes c d [t]', 'Set clothing component by id'],
    ['/setprop p d [t]', 'Set prop by id (-1 removes)'],
    ['/reload', 'Re-pack DLC packs + auto-reconnect'],
];

(function buildCmdPanel() {
    const list = $('cmdlist');
    for (const [code, desc] of COMMANDS) {
        const row = document.createElement('div');
        row.className = 'cmd-row';
        const c = document.createElement('span');
        c.className = 'cmd-code';
        c.textContent = code;
        const d = document.createElement('span');
        d.className = 'cmd-desc';
        d.textContent = desc;
        row.appendChild(c);
        row.appendChild(d);
        row.addEventListener('click', () => {
            $('cmdpanel').classList.add('hidden');
            openChat(code.split(' ')[0] + ' ');
        });
        list.appendChild(row);
    }
})();

$('cmdbtn').addEventListener('click', () => {
    $('cmdpanel').classList.toggle('hidden');
});

// клик мимо панели — закрывает её
document.addEventListener('mousedown', (e) => {
    const panel = $('cmdpanel');
    if (panel.classList.contains('hidden')) return;
    if (panel.contains(e.target) || $('cmdbtn').contains(e.target)) return;
    panel.classList.add('hidden');
});

document.addEventListener('keydown', (e) => {
    if (e.uiConsumed) return; // этот Escape уже закрыл меню/доску
    if (e.key === 'Escape' && !$('cmdpanel').classList.contains('hidden') && mode === null) {
        $('cmdpanel').classList.add('hidden');
    }
});

// ================= перетаскивание HUD правой кнопкой =================
// при включённом курсоре (~) любой блок интерфейса таскается ПКМ;
// позиции хранятся вместе с раскладкой доски (savedPos.__hudPos)

const HUD_DRAGGABLE = ['topright', 'chatlog', 'hints', 'modes', 'cmdbtn', 'menu', 'chatinput'];

function applyHudPos() {
    const pos = savedPos.__hudPos ?? {};
    for (const id of HUD_DRAGGABLE) {
        const el = $(id);
        const p = pos[id];
        if (!el || !p) continue;
        el.style.left = `${clampX(p.x)}px`;
        el.style.top = `${clampY(p.y)}px`;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
    }
}

document.addEventListener('contextmenu', (e) => e.preventDefault());

for (const id of HUD_DRAGGABLE) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener('mousedown', (e) => {
        if (e.button !== 2) return; // только ПКМ
        e.preventDefault();
        const r = el.getBoundingClientRect();
        const dx = (e.clientX - r.left) / uiScale;
        const dy = (e.clientY - r.top) / uiScale;
        el.style.right = 'auto';
        el.style.bottom = 'auto';
        el.style.transform = 'none';
        const move = (ev) => {
            el.style.left = `${ev.clientX / uiScale - dx}px`;
            el.style.top = `${ev.clientY / uiScale - dy}px`;
        };
        const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
            savedPos.__hudPos = savedPos.__hudPos ?? {};
            savedPos.__hudPos[id] = { x: el.offsetLeft, y: el.offsetTop };
            savePositions();
        };
        document.addEventListener('mousemove', move);
        document.addEventListener('mouseup', up);
    });
}

// ================= инициализация =================

if (Number(savedPos.__uiScale)) {
    uiScale = Math.min(1.6, Math.max(0.6, Number(savedPos.__uiScale)));
    applyScale();
}
applyHudPos();
setHints('default');
A.emit('ui:ready');
