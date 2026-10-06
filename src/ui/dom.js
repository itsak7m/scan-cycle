/* Tiny DOM helpers + bilingual text helpers + safe storage. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  SC.ui = SC.ui || {};

  // h('div', {class:'a', onclick:fn, dataset:{x:1}}, child, 'text', [more])
  function h(tag, attrs) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') for (const d in v) el.dataset[d] = v[d];
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'html') el.innerHTML = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c === null || c === undefined || c === false) return;
    if (Array.isArray(c)) c.forEach((x) => add(el, x));
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Arabic text may contain {{English terms}} -> <bdi lang="en">
  function arHtml(s) { return esc(s).replace(/\{\{(.+?)\}\}/g, '<bdi lang="en">$1</bdi>'); }
  function arEl(s, tag) { return h(tag || 'span', { lang: 'ar', dir: 'rtl', html: arHtml(s) }); }
  function enEl(s, tag) { return h(tag || 'span', { lang: 'en', dir: 'ltr' }, s); }

  // storage that never throws
  const store = {
    mem: Object.create(null),
    get(k, def) {
      try { const v = globalThis.localStorage.getItem('scancycle.' + k); return v === null ? (k in store.mem ? store.mem[k] : def) : JSON.parse(v); } catch (e) { return k in store.mem ? store.mem[k] : def; }
    },
    set(k, v) {
      store.mem[k] = v;
      try { globalThis.localStorage.setItem('scancycle.' + k, JSON.stringify(v)); return true; } catch (e) { store.failed = true; return false; }
    },
    failed: false,
  };

  SC.ui.motion = () => (globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth');
  SC.ui.h = h;
  SC.ui.esc = esc;
  SC.ui.arHtml = arHtml;
  SC.ui.arEl = arEl;
  SC.ui.enEl = enEl;
  SC.ui.store = store;
})();
