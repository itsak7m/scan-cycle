/* Level loading + structural validation (used by the game, the build checks and the self-test). */
(function () {
  'use strict';
  const SC = globalThis.SC;

  function loadAll() {
    try { return JSON.parse(document.getElementById('levels').textContent) || []; } catch (e) { return []; }
  }
  function loadFixtures() {
    const el = typeof document !== 'undefined' && document.getElementById('fixtures');
    if (!el) return null;
    try { return JSON.parse(el.textContent); } catch (e) { return null; }
  }

  // glossary: levels define the terms they introduce in `glossaryDefs`; `glossary` lists ids shown in the level.
  function glossaryMap(levels) {
    const map = Object.create(null);
    for (const L of levels) for (const d of L.glossaryDefs || []) if (!map[d.id]) map[d.id] = Object.assign({ firstLevel: L.id }, d);
    return map;
  }

  const wordCount = (s) => (String(s || '').trim().match(/\S+/g) || []).length;
  const PALETTE_OK = SC.compile.ELEMENTS.concat(['BRANCH']);

  // returns an array of problem strings (empty = structurally fine)
  function validate(level, gmap) {
    const bad = [];
    const need = (cond, msg) => { if (!cond) bad.push(msg); };
    need(/^L\d\d$/.test(level.id || ''), 'id must look like L05');
    need(Number.isInteger(level.order), 'order must be an integer');
    need(level.title && level.title.en && level.title.ar, 'title needs en and ar');
    need(level.concept, 'concept is missing');
    need(level.workOrder && level.workOrder.en && level.workOrder.ar, 'workOrder needs en and ar');
    if (level.workOrder && level.workOrder.en) need(wordCount(level.workOrder.en) <= 60, `work order is ${wordCount(level.workOrder.en)} words (max 60)`);
    need(Array.isArray(level.palette) && level.palette.every((p) => PALETTE_OK.indexOf(p) >= 0), 'palette must list known instruction ids');
    try {
      const tags = SC.levelTags(level);
      need(tags.length > 0, 'level has no tags');
      for (const t of tags) need(SC.addr.parseAddr(t.addr), `tag ${t.name} has a bad address ${t.addr}`);
    } catch (e) { bad.push('tags: ' + e.message); }
    need(level.plant && typeof level.plant === 'object', 'plant config missing');
    const scen = level.scenarios || [];
    need(scen.length >= 3, `needs at least 3 visible scenarios (has ${scen.length})`);
    const ids = new Set();
    scen.forEach((s) => {
      need(s.id && !ids.has(s.id), 'scenario ids must be unique: ' + s.id); ids.add(s.id);
      need(s.durationMs > 0, `scenario ${s.id}: durationMs`);
      need((s.asserts || []).length > 0, `scenario ${s.id}: no asserts`);
      need(s.title && s.title.en && s.title.ar, `scenario ${s.id}: needs a title {en,ar} (shown in the FAT list)`);
    });
    need(level.hidden && level.hidden.count >= 3, 'hidden.count must be at least 3');
    need(Array.isArray(level.hints) && level.hints.length === 3 && level.hints.every((x) => x.en && x.ar), 'needs exactly 3 hints with en and ar');
    need(Array.isArray(level.datasheets) && level.datasheets.length >= 1 && level.datasheets.every((d) => d.id && d.title && d.title.en), 'needs at least one datasheet card');
    need(Array.isArray(level.glossary) && level.glossary.length >= 6 && level.glossary.length <= 14, 'glossary should list 6-14 term ids');
    if (gmap) for (const id of level.glossary || []) need(gmap[id], 'glossary term not defined anywhere: ' + id);
    for (const d of level.glossaryDefs || []) need(d.id && d.en && d.ar && d.ex && d.ex.en, 'glossaryDefs entry needs id, en, ar and ex.en: ' + (d.id || '?'));
    for (const id of level.diagnostics || []) need(SC.diag.registry[id], 'diagnostic not registered: ' + id);
    need(level.explain && Array.isArray(level.explain.frames) && level.explain.frames.length >= 1, 'explain.frames missing');
    need(level.example && ['full', 'completion', 'none'].indexOf(level.example.mode) >= 0, 'example.mode must be full, completion or none');
    return bad;
  }

  SC.levels = { loadAll, loadFixtures, glossaryMap, validate, wordCount };
})();
