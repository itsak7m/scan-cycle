/* Progress, autosave, glossary boxes (Leitner), explanations. One versioned payload, saved with safe wrappers.
 * No streaks, no daily rewards, nothing decays: the map just remembers what you did. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;

  const fresh = () => ({ v: 1, savedAt: 0, levels: {}, gloss: {}, session: 0, seenWO: {}, settings: {} });
  // fill in any missing / wrongly-typed key so an old save never bricks the app
  function normalise(d) {
    const f = fresh();
    if (!d || typeof d !== 'object' || d.v !== 1) return f;
    const out = Object.assign(f, d);
    for (const k of ['levels', 'gloss', 'seenWO', 'settings']) if (!out[k] || typeof out[k] !== 'object' || Array.isArray(out[k])) out[k] = {};
    delete out.levels.__proto__;
    for (const id of Object.keys(out.levels)) {
      const l = out.levels[id];
      if (!/^L\d\d$/.test(id) || !l || typeof l !== 'object') { delete out.levels[id]; continue; }
      if (l.program) { const sp = SC.sanitizeProgram(l.program); if (sp) l.program = sp; else l.program = null; }
      if (!Array.isArray(l.userTags)) l.userTags = [];
    }
    if (out.sandbox && out.sandbox.program) { const sp = SC.sanitizeProgram(out.sandbox.program); out.sandbox = sp ? { program: sp, userTags: Array.isArray(out.sandbox.userTags) ? out.sandbox.userTags : [] } : undefined; }
    out.session = Number.isFinite(out.session) ? out.session : 0;
    return out;
  }
  let data = normalise(U.store.get('data', null));
  data.session = (data.session || 0) + 1;
  U.data = data;
  // never lose the last edit when the tab is closed
  const flush = () => U.save(true);
  globalThis.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });

  let timer = 0;
  U.save = function (now) {
    clearTimeout(timer);
    const doSave = () => {
      data.savedAt = Date.now();
      const ok = U.store.set('data', data);
      U.autosaveOk = ok;
      const n = document.getElementById('autosave-note');
      if (n) n.hidden = ok;
    };
    if (now) doSave(); else timer = setTimeout(doSave, 500);
  };

  const LV_DEF = () => ({ stars: 0, solved: false, attempts: 0, fails: 0, hint: 0, hint3: false, explained: false, program: null, userTags: [], explain: {}, best: null, wo: 0 });
  U.lv = function (id) {
    if (!data.levels[id]) data.levels[id] = LV_DEF();
    else for (const k in LV_DEF()) if (!(k in data.levels[id])) data.levels[id][k] = LV_DEF()[k];
    return data.levels[id];
  };
  U.totalStars = () => Object.keys(data.levels).reduce((n, k) => n + (data.levels[k].stars || 0), 0);

  // ---------------------------------------------------------------- export / import
  U.exportData = function () {
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'scan-cycle-progress.json';
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  U.validateImport = function (o) {
    if (!o || typeof o !== 'object' || o.v !== 1 || typeof o.levels !== 'object' || o.levels === null) return false;
    for (const id of Object.keys(o.levels)) {
      if (!/^L\d\d$/.test(id)) return false;
      const l = o.levels[id];
      if (typeof l !== 'object' || l === null) return false;
      if (l.program && !SC.sanitizeProgram(l.program)) return false;
    }
    return true;
  };
  U.importData = function (text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return false; }
    if (!U.validateImport(o)) return false;
    const keepSession = data.session;
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, normalise(o));
    data.session = keepSession;
    U.save(true);
    return true;
  };
  U.resetData = function () {
    for (const k of Object.keys(data)) delete data[k];
    Object.assign(data, fresh(), { session: 1 });
    U.save(true);
  };
})();
