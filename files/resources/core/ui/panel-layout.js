'use strict';

// Window geometry is stored with the existing local/server layout preferences.
const panelPages = new Map();
let panelLayoutFrame = 0;
let panelLayoutRunning = false;
let panelGesture = false;

function queuePanelLayout() {
    if (panelLayoutFrame) return;
    panelLayoutFrame = requestAnimationFrame(() => {
        panelLayoutFrame = 0;
        layoutStudioPanels();
    });
}

function panelScale() { return Number(uiScale) || 1; }
function panelRect(el) {
    const r = el.getBoundingClientRect(), scale = panelScale();
    return { x: r.left / scale, y: r.top / scale, width: r.width / scale, height: r.height / scale };
}
function panelPreferences(id) { return savedPos.__panels?.[id] || {}; }
function writePanelPreferences(id, value) {
    savedPos.__panels = savedPos.__panels || {};
    savedPos.__panels[id] = value;
}
function finiteValue(value) { return Number.isFinite(value); }
function clampPanel(value, min, max) { return Math.max(min, Math.min(value, Math.max(min, max))); }

function layoutPanel(id, listId, prefix) {
    const shell = document.getElementById(id), list = document.getElementById(listId);
    if (!shell || shell.classList.contains('hidden')) return;
    if (shell.classList.contains('board-floating')) {
        for (const property of ['width', 'height', 'left', 'top']) shell.style[property] = '';
        shell.classList.remove('compact-rows', 'narrow-panel');
        list.querySelectorAll('.page-hidden').forEach(row => row.classList.remove('page-hidden'));
        return;
    }
    const pagebar = document.getElementById(`${prefix}-pagination`);
    const prefs = panelPreferences(id), isWindow = id !== 'cmdpanel';
    const edge = 14, maxWidth = vw() - edge * 2;
    if (isWindow) {
        shell.style.width = finiteValue(prefs.width) ? `${clampPanel(prefs.width, Math.min(id === 'clothboard' ? 440 : 420, maxWidth), maxWidth)}px` : '';
        shell.style.height = 'auto';
        shell.style.left = finiteValue(prefs.x) ? `${prefs.x}px` : '';
        shell.style.top = finiteValue(prefs.y) ? `${prefs.y}px` : '';
    }
    shell.classList.toggle('narrow-panel', isWindow && panelRect(shell).width <= 530);
    shell.classList.remove('compact-rows');
    const allRows = Array.from(list.children);
    allRows.forEach(row => row.classList.remove('page-hidden'));
    const rows = allRows.filter(row => getComputedStyle(row).display !== 'none');
    pagebar.classList.add('hidden');
    const bottom = id === 'cmdpanel' ? (parseFloat(getComputedStyle(shell).bottom) || edge) : edge;
    const maxHeight = Math.max(150, vh() - bottom - edge);
    const manualHeight = finiteValue(prefs.height) && isWindow;
    let targetHeight = manualHeight ? Math.min(prefs.height, maxHeight) : maxHeight;
    if (id === 'clothboard' && panelRect(shell).height > targetHeight) shell.classList.add('compact-rows');
    let natural = panelRect(shell).height;
    const rowHeights = rows.map(row => {
        const css = getComputedStyle(row);
        return panelRect(row).height + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0);
    });
    const listHeight = panelRect(list).height;
    let chrome = natural - listHeight;
    // A resized window always retains room for its controls and at least one item.
    const minHeight = chrome + Math.max(0, ...rowHeights) + 36;
    shell.dataset.minimumHeight = String(Math.min(minHeight, maxHeight));
    if (manualHeight) targetHeight = clampPanel(targetHeight, Math.min(minHeight, maxHeight), maxHeight);
    let pages = [rows];
    if (natural > targetHeight + 1 && rows.length) {
        pagebar.classList.remove('hidden');
        chrome += panelRect(pagebar).height;
        const rowBudget = Math.max(Math.max(...rowHeights), targetHeight - chrome);
        pages = [];
        let page = [], height = 0;
        rows.forEach((row, index) => {
            if (page.length && height + rowHeights[index] > rowBudget + .5) {
                pages.push(page); page = []; height = 0;
            }
            page.push(row); height += rowHeights[index];
        });
        if (page.length) pages.push(page);
        pages = pages.filter(items => items.some(row => !row.classList.contains('sep')));
        if (!pages.length) pages = [rows];
    }
    let state = panelPages.get(prefix) || { page: 0 };
    const selected = rows.find(row => row.classList.contains('sel') || row.classList.contains('active'));
    let selectedPage = selected ? pages.findIndex(page => page.includes(selected)) : -1;
    state.page = selectedPage >= 0 ? selectedPage : clampPanel(state.page, 0, pages.length - 1);
    state.pages = pages;
    panelPages.set(prefix, state);
    rows.forEach(row => row.classList.toggle('page-hidden', !pages[state.page].includes(row)));
    pagebar.classList.toggle('hidden', pages.length < 2);
    document.getElementById(`${prefix}-page-label`).textContent = `Page ${state.page + 1} / ${pages.length}`;
    document.getElementById(`${prefix}-page-prev`).disabled = state.page === 0;
    document.getElementById(`${prefix}-page-next`).disabled = state.page === pages.length - 1;
    if (manualHeight) shell.style.height = `${targetHeight}px`;
    if (isWindow) {
        const r = panelRect(shell);
        const top = finiteValue(prefs.y) ? prefs.y : r.y;
        const left = finiteValue(prefs.x) ? prefs.x : r.x;
        shell.style.left = `${clampPanel(left, edge, vw() - r.width - edge)}px`;
        shell.style.top = `${clampPanel(top, edge, vh() - r.height - edge)}px`;
    }
}

function layoutStudioPanels() {
    if (panelLayoutRunning || typeof getComputedStyle !== 'function') return;
    panelLayoutRunning = true;
    try {
        layoutPanel('menu', 'menu-items', 'menu');
        layoutPanel('clothboard', 'board-cards', 'board');
        layoutPanel('cmdpanel', 'cmdlist', 'command');
    } finally { panelLayoutRunning = false; }
}

function changePanelPage(prefix, direction) {
    const state = panelPages.get(prefix);
    if (!state) return;
    const page = clampPanel(state.page + direction, 0, state.pages.length - 1);
    if (page === state.page) return;
    state.page = page;
    const first = state.pages[page].find(row => !row.classList.contains('sep'));
    if (prefix === 'menu' && first) {
        cur().index = Array.from(document.getElementById('menu-items').children).indexOf(first);
        renderMenu();
    } else if (prefix === 'board' && first) setActive(first.id.slice('strip-'.length));
    layoutStudioPanels();
}

function installPanelHandles(id) {
    const shell = document.getElementById(id);
    for (const kind of ['grip', 'resize']) {
        const handle = shell.querySelector(`.panel-${kind}`);
        handle.addEventListener('mousedown', e => {
            if (e.button !== 0 || shell.classList.contains('board-floating')) return;
            e.preventDefault(); e.stopPropagation();
            const start = panelRect(shell), scale = panelScale();
            const x = e.clientX / scale, y = e.clientY / scale;
            const initial = { ...panelPreferences(id) };
            panelGesture = true;
            document.body.classList.add('panel-adjusting');
            const move = ev => {
                const dx = ev.clientX / scale - x, dy = ev.clientY / scale - y;
                if (kind === 'grip') {
                    const pos = { ...initial, x: clampPanel(start.x + dx, 14, vw() - start.width - 14), y: clampPanel(start.y + dy, 14, vh() - start.height - 14) };
                    writePanelPreferences(id, pos);
                    shell.style.left = `${pos.x}px`; shell.style.top = `${pos.y}px`;
                } else {
                    const minHeight = Number(shell.dataset.minimumHeight) || 240;
                    writePanelPreferences(id, { ...initial, x: start.x, y: start.y,
                        width: clampPanel(start.width + dx, Math.min(id === 'clothboard' ? 440 : 420, vw() - 28), vw() - start.x - 14),
                        height: clampPanel(start.height + dy, Math.min(minHeight, vh() - 28), vh() - start.y - 14) });
                    queuePanelLayout();
                }
            };
            const up = () => {
                document.removeEventListener('mousemove', move);
                document.removeEventListener('mouseup', up);
                window.removeEventListener('blur', up);
                document.body.classList.remove('panel-adjusting');
                panelGesture = false;
                savePositions();
                queuePanelLayout();
            };
            document.addEventListener('mousemove', move);
            document.addEventListener('mouseup', up);
            window.addEventListener('blur', up);
        });
        handle.addEventListener('dblclick', e => {
            e.preventDefault();
            const prefs = { ...panelPreferences(id) };
            if (kind === 'grip') writePanelPreferences(id, {});
            else { delete prefs.width; delete prefs.height; writePanelPreferences(id, prefs); }
            savePositions(); queuePanelLayout();
        });
    }
}

for (const prefix of ['menu', 'board', 'command']) {
    document.getElementById(`${prefix}-page-prev`).addEventListener('click', () => changePanelPage(prefix, -1));
    document.getElementById(`${prefix}-page-next`).addEventListener('click', () => changePanelPage(prefix, 1));
}
installPanelHandles('menu');
installPanelHandles('clothboard');
window.addEventListener('resize', queuePanelLayout);
document.addEventListener('keydown', e => {
    if (e.key !== 'PageDown' && e.key !== 'PageUp' || e.target.closest('input,textarea')) return;
    const prefix = !document.getElementById('menu').classList.contains('hidden') ? 'menu'
        : !document.getElementById('clothboard').classList.contains('hidden') && !boardFloating ? 'board'
        : !document.getElementById('cmdpanel').classList.contains('hidden') ? 'command' : null;
    if (prefix) { changePanelPage(prefix, e.key === 'PageDown' ? 1 : -1); e.preventDefault(); }
});
// Child changes include clothing replies and newly rendered screens; avoid observing
// the layout styles or pagination labels that this module writes itself.
const panelObserver = new MutationObserver(() => { if (!panelGesture) queuePanelLayout(); });
for (const id of ['menu-items', 'board-cards', 'cmdlist']) panelObserver.observe(document.getElementById(id), { childList: true, subtree: true });
for (const id of ['menu', 'clothboard', 'cmdpanel']) {
    const shell = document.getElementById(id);
    let visibility = '';
    new MutationObserver(() => {
        const next = `${shell.classList.contains('hidden')}/${shell.classList.contains('board-floating')}`;
        if (next !== visibility) { visibility = next; queuePanelLayout(); }
    }).observe(shell, { attributes: true, attributeFilter: ['class'] });
}
if (document.fonts?.ready) document.fonts.ready.then(queuePanelLayout);
queuePanelLayout();
