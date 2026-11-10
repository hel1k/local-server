// GTA has one component preload slot per ped. Serialize previews and discard
// superseded requests, including when the user reverses scrolling direction.
export function createClothesPreview({ native, alt, getPed, getModel, report, applied, trace = () => {}, now = Date.now }) {
    const queued = new Map();
    let active = null;
    let tick = null;
    const keyOf = (r) => `${r.kind}-${r.comp}`;

    function release() {
        if (!active?.preloaded) return;
        active.preloaded = false;
        try { native.releasePedPreloadVariationData(active.ped); } catch { /* ped removed */ }
    }

    function stopIfIdle() {
        if (!active && !queued.size && tick !== null) {
            alt.clearEveryTick(tick);
            tick = null;
        }
    }

    function finish(error = null) {
        const request = active;
        release();
        active = null;
        if (request) {
            trace(error ? `failed: ${error}` : 'applied', request);
            report(request, { pending: false, applied: !error, error });
            if (!error) applied(request);
        }
        stopIfIdle();
    }

    function cancel() {
        release();
        active = null;
        queued.clear();
        stopIfIdle();
    }

    function matches(r) {
        if (r.kind === 'comp') {
            return native.getPedDrawableVariation(r.ped, r.comp) === r.drawable
                && native.getPedTextureVariation(r.ped, r.comp) === r.texture;
        }
        const drawable = native.getPedPropIndex(r.ped, r.comp);
        return drawable === r.drawable && (drawable < 0
            || native.getPedPropTextureIndex(r.ped, r.comp) === r.texture);
    }

    function validate(r) {
        if (!['comp', 'prop'].includes(r.kind) || !Number.isInteger(r.comp)
            || !(r.kind === 'comp' ? r.comp >= 0 && r.comp <= 11 : [0, 1, 2, 6, 7].includes(r.comp))
            || !Number.isInteger(r.drawable) || !Number.isInteger(r.texture)) return 'Invalid clothing selection';
        const count = r.kind === 'comp'
            ? native.getNumberOfPedDrawableVariations(r.ped, r.comp)
            : native.getNumberOfPedPropDrawableVariations(r.ped, r.comp);
        if (r.drawable < (r.kind === 'prop' ? -1 : 0) || r.drawable >= count) return 'Drawable is out of range';
        if (r.kind === 'prop' && r.drawable === -1) return null;
        const textures = r.kind === 'comp'
            ? native.getNumberOfPedTextureVariations(r.ped, r.comp, r.drawable)
            : native.getNumberOfPedPropTextureVariations(r.ped, r.comp, r.drawable);
        if (r.texture < 0 || r.texture >= textures) return 'Texture is out of range';
        if (r.kind === 'comp' && !native.isPedComponentVariationValid(r.ped, r.comp, r.drawable, r.texture)) {
            return 'Variation is unavailable for this ped';
        }
        return null;
    }

    function apply(r) {
        trace('apply', r);
        if (r.kind === 'comp') native.setPedComponentVariation(r.ped, r.comp, r.drawable, r.texture, 2);
        else if (r.drawable < 0) native.clearPedProp(r.ped, r.comp, 0);
        else native.setPedPropIndex(r.ped, r.comp, r.drawable, r.texture, true, 0);
        r.phase = 'verify';
        r.deadline = now() + 500;
    }

    function update() {
        if (active && (active.ped !== getPed() || active.model !== getModel())) {
            cancel();
            return;
        }
        if (!active) {
            const next = [...queued.values()].find((r) => now() >= r.readyAt);
            if (!next) return;
            queued.delete(keyOf(next));
            active = next;
            if (next.ped !== getPed() || next.model !== getModel()) { cancel(); return; }
            try {
                const error = validate(next);
                if (error) { finish(error); return; }
                if (next.kind === 'comp') {
                    next.preloaded = true;
                    trace('preload', next);
                    native.setPedPreloadVariationData(next.ped, next.comp, next.drawable, next.texture);
                    next.phase = 'load';
                    next.deadline = now() + 5000;
                } else apply(next);
            } catch (e) { finish(e.message); }
            return;
        }
        try {
            if (active.phase === 'load') {
                if (native.hasPedPreloadVariationDataFinished(active.ped)) apply(active);
                else if (now() >= active.deadline) finish('Clothing load timed out');
            } else if (active.phase === 'verify') {
                if (matches(active)) finish();
                else if (now() >= active.deadline) finish('Clothing change was not applied');
            }
        } catch (e) { finish(e.message); }
    }

    function request(kind, comp, drawable, texture, requestId) {
        const r = { kind, comp, drawable, texture, requestId, ped: getPed(), model: getModel(), readyAt: now() + 120 };
        const key = keyOf(r);
        // Releasing a previous preload does not apply its outdated selection.
        if (active && keyOf(active) === key) {
            release();
            active = null;
        }
        queued.set(key, r);
        report(r, { pending: true, applied: null, error: null });
        if (tick === null) tick = alt.everyTick(update);
    }

    return { request, cancel };
}
