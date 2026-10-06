/* Glossary: tappable terms with an Arabic gloss, a 3-choice question on the 2nd encounter, Leitner review. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const U = SC.ui;
  const h = U.h;
  const tr = (en, ar) => (U.lang === 'ar' ? ar : en);
  const INTERVALS = [1, 2, 4, 8, 16]; // sessions, boxes 1..5

  const G = { map: Object.create(null), loaded: false };
  U.glossary = G;

  G.init = function (levels) {
    G.map = SC.levels.glossaryMap(levels);
    G.loaded = true;
  };
  G.get = (id) => G.map[id] || null;

  const surfaceForms = (def) => {
    const forms = new Set();
    const main = def.en.replace(/\s*\(.*?\)\s*/g, ' ').trim();
    forms.add(main);
    const m = /\(([^)]+)\)/.exec(def.en);
    if (m && m[1].length >= 2) forms.add(m[1].trim());
    if (def.forms) def.forms.forEach((f) => forms.add(f));
    return Array.from(forms).filter(Boolean);
  };

  // append `text` to `el`, wrapping glossary terms (limited to `ids`) in tappable buttons
  G.linkText = function (el, text, ids) {
    const forms = [];
    (ids || []).forEach((id) => { const d = G.get(id); if (d) surfaceForms(d).forEach((f) => forms.push({ id, f })); });
    forms.sort((a, b) => b.f.length - a.f.length);
    if (!forms.length) { el.append(text); return; }
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp('(?<![A-Za-z0-9_])(' + forms.map((x) => esc(x.f)).join('|') + ')(?![A-Za-z0-9_])', 'gi');
    let last = 0, m;
    const seen = new Set();
    while ((m = re.exec(text))) {
      const hit = forms.find((x) => x.f.toLowerCase() === m[1].toLowerCase());
      if (!hit) continue;
      if (m.index > last) el.append(text.slice(last, m.index));
      if (seen.has(hit.id)) el.append(m[1]);
      else { seen.add(hit.id); el.append(termBtn(hit.id, m[1])); }
      last = m.index + m[1].length;
    }
    if (last < text.length) el.append(text.slice(last));
  };

  function termBtn(id, label) {
    const b = h('button', { type: 'button', class: 'term', dataset: { term: id }, 'aria-label': 'Term: ' + label }, label);
    b.addEventListener('click', (e) => { e.preventDefault(); G.popover(id, b); });
    return b;
  }
  G.termBtn = termBtn;

  // ---------------------------------------------------------------- Leitner
  const rec = (id) => {
    const g = U.data.gloss;
    if (!g[id]) g[id] = { seen: 0, quizzed: false, box: 0, due: 0 };
    return g[id];
  };
  function grade(id, ok) {
    const r = rec(id);
    r.quizzed = true;
    if (ok) { r.box = Math.min(5, (r.box || 0) + 1); } else r.box = 1;
    r.due = U.data.session + INTERVALS[r.box - 1];
    U.save();
  }
  G.dueIds = function (all) {
    const ids = Object.keys(U.data.gloss).filter((id) => G.map[id] && U.data.gloss[id].box > 0 && U.data.gloss[id].due <= U.data.session);
    return ids;
  };

  function distractors(id, n) {
    const others = Object.keys(G.map).filter((k) => k !== id && G.map[k].ar !== G.map[id].ar);
    const out = [];
    while (out.length < n && others.length) out.push(others.splice(Math.floor(Math.random() * others.length), 1)[0]);
    return out;
  }
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // 3-choice question: returns an element; onAnswer(ok) after the player picked
  function quizEl(id, onAnswer) {
    const d = G.map[id];
    const opts = shuffle([id].concat(distractors(id, 2)));
    const box = h('div', { class: 'quiz' }, h('p', null, h('b', null, tr('Pick the Arabic meaning of', 'اختار المعنى العربي لـ') + ' '), h('span', { lang: 'en' }, d.en)));
    const row = h('div', { class: 'quiz-opts' });
    opts.forEach((o) => {
      const b = h('button', { type: 'button', class: 'btn', lang: 'ar', dir: 'rtl' }, G.map[o].ar);
      b.addEventListener('click', () => {
        const ok = o === id;
        row.querySelectorAll('button').forEach((x) => { x.disabled = true; });
        b.classList.add(ok ? 'right' : 'wrong');
        if (!ok) row.querySelectorAll('button').forEach((x) => { if (x.textContent === d.ar) x.classList.add('right'); });
        box.append(h('p', { class: ok ? 'ok' : 'warn', role: 'status' }, ok ? '✔ ' + tr('Correct', 'صح') : '✖ ' + tr('Not this one. It means:', 'مش هاد. معناه:') + ' ' + d.ar));
        grade(id, ok);
        setTimeout(() => onAnswer(ok), ok ? 500 : 1400);
      });
      row.append(b);
    });
    box.append(row);
    return box;
  }

  // ---------------------------------------------------------------- speech
  const canSpeak = typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
  let voices = [];
  if (canSpeak) { const lv = () => { voices = speechSynthesis.getVoices(); }; lv(); speechSynthesis.addEventListener && speechSynthesis.addEventListener('voiceschanged', lv); }
  G.speak = function (text) {
    if (!canSpeak) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const v = voices.find((x) => /^en[-_]US/i.test(x.lang)) || voices.find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.lang = (v && v.lang) || 'en-US'; u.rate = 0.9;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  };
  G.canSpeak = canSpeak;
  G.speakBtn = (text) => (canSpeak ? h('button', { type: 'button', class: 'btn small ghost', 'aria-label': 'Listen', title: 'Listen', onclick: () => G.speak(text) }, '🔊') : null);

  // ---------------------------------------------------------------- popover
  G.popover = function (id, anchor) {
    closePop();
    const d = G.get(id);
    if (!d) return;
    const r = rec(id);
    r.seen++;
    const needQuiz = r.seen >= 2 && !r.quizzed;
    const pop = h('div', { class: 'termpop', role: 'dialog', 'aria-label': d.en });
    const reveal = () => {
      pop.innerHTML = '';
      pop.append(h('div', { class: 'pal-head' }, h('b', { lang: 'en', class: 'tp-en' }, d.en), h('span', null, G.speakBtn(d.en), h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Close', onclick: closePop }, '✕'))),
        h('p', { class: 'tp-ar', lang: 'ar', dir: 'rtl' }, d.ar),
        h('p', { class: 'small' }, h('i', { lang: 'en' }, d.ex.en)),
        d.ex.ar ? h('p', { class: 'small', lang: 'ar', dir: 'rtl', html: U.arHtml(d.ex.ar) }) : null);
      place();
    };
    function place() {
      const rc = anchor.getBoundingClientRect();
      const w = pop.offsetWidth, hh = pop.offsetHeight;
      if (window.innerWidth < 700) { pop.classList.add('sheet'); return; }
      pop.style.left = Math.min(Math.max(8, rc.left), window.innerWidth - w - 8) + window.scrollX + 'px';
      let top = rc.bottom + 6;
      if (top + hh > window.innerHeight - 8) top = Math.max(8, rc.top - hh - 6);
      pop.style.top = top + window.scrollY + 'px';
    }
    document.body.append(pop);
    if (needQuiz) { pop.append(quizEl(id, () => { U.save(); reveal(); })); place(); }
    else { reveal(); if (!r.box) { r.box = 1; r.due = U.data.session + INTERVALS[0]; } }
    U.save();
    U._termpop = { pop, anchor };
    pop.setAttribute('tabindex', '-1');
    const f0 = pop.querySelector('button'); if (f0) f0.focus(); else pop.focus();
    setTimeout(() => { document.addEventListener('pointerdown', out, true); document.addEventListener('keydown', esc, true); }, 0);
    function out(e) { if (!pop.contains(e.target) && e.target !== anchor) closePop(); }
    function esc(e) { if (e.key === 'Escape') closePop(); }
    pop._cleanup = () => { document.removeEventListener('pointerdown', out, true); document.removeEventListener('keydown', esc, true); };
  };
  function closePop() {
    const p = U._termpop;
    if (!p) return;
    p.pop._cleanup && p.pop._cleanup();
    p.pop.remove();
    U._termpop = null;
    if (p.anchor && p.anchor.isConnected && p.anchor.focus) p.anchor.focus();
  }
  G.closePop = closePop;

  // ---------------------------------------------------------------- review screen (5-8 due terms)
  G.review = function (root, onDone) {
    let ids = G.dueIds();
    let practice = false;
    if (!ids.length) {
      practice = true;
      ids = Object.keys(U.data.gloss).filter((id) => G.map[id]);
    }
    shuffle(ids);
    ids = ids.slice(0, 8);
    const wrap = h('div', { class: 'card review' });
    root.append(wrap);
    let i = 0, right = 0;
    function next() {
      wrap.innerHTML = '';
      if (i >= ids.length) {
        wrap.append(h('h3', null, tr('Review finished', 'خلصت المراجعة')), h('p', null, `${right}/${ids.length} ` + tr('correct', 'صح')),
          h('button', { type: 'button', class: 'btn primary', onclick: () => { wrap.remove(); onDone && onDone(); } }, tr('Back to the map', 'رجوع للخريطة')));
        return;
      }
      wrap.append(h('h3', null, tr('Term review', 'مراجعة المصطلحات') + ` (${i + 1}/${ids.length})`),
        practice ? h('p', { class: 'muted small' }, tr('Nothing is due. Practice a few terms you met.', 'ما في شي مستحق. تمرّن على كم مصطلح شفتهم.')) : null,
        quizEl(ids[i], (ok) => { if (ok) right++; i++; next(); }));
    }
    if (!ids.length) { wrap.append(h('p', null, tr('You have not met any terms yet. Open a level first.', 'لسا ما شفت أي مصطلح. افتح مستوى أول.')), h('button', { type: 'button', class: 'btn', onclick: () => { wrap.remove(); onDone && onDone(); } }, 'OK')); return; }
    next();
  };
})();
