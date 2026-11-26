'use strict';

// A single quiet notice, with errors taking priority over routine feedback.
(() => {
    let timer = null;
    let active = null;
    let lastText = '';
    let lastError = false;
    let lastAt = 0;

    function dismiss() {
        clearTimeout(timer);
        if (active) active.classList.add('hidden');
        active = null;
    }

    window.showNotice = function showNotice(value, error = false) {
        const text = String(value ?? '').trim()
            .replace(/^Weather:\s*/i, 'Weather changed to ')
            .replace(/^Time:\s*/i, 'Time changed to ');
        if (!text) return;
        if (!error && active?.id === 'cmdalert') return;
        const now = Date.now();
        if (text === lastText && error === lastError && now - lastAt < 5000) return;
        lastText = text;
        lastError = error;
        lastAt = now;
        dismiss();

        const el = document.getElementById(error ? 'cmdalert' : 'toast');
        if (!el) return;
        // Content comes from game events, so always insert it as text.
        el.replaceChildren();
        const mark = document.createElement('span');
        mark.className = 'notice-mark';
        mark.setAttribute('aria-hidden', 'true');
        mark.textContent = error ? '!' : '\u2713';
        const content = document.createElement('span');
        content.className = 'notice-content';
        const title = document.createElement('span');
        title.className = 'notice-title';
        title.textContent = error ? 'Action unavailable' : 'Updated';
        const message = document.createElement('span');
        message.className = 'notice-message';
        message.textContent = text;
        content.append(title, message);
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'notice-dismiss';
        close.setAttribute('aria-label', 'Dismiss notification');
        close.title = 'Dismiss';
        close.textContent = '\u00d7';
        close.addEventListener('click', dismiss);
        el.append(mark, content, close);
        el.setAttribute('role', error ? 'alert' : 'status');
        el.setAttribute('aria-live', error ? 'assertive' : 'polite');
        el.classList.remove('hidden');
        active = el;
        timer = setTimeout(dismiss, error ? 4500 : 2800);
    };
})();
