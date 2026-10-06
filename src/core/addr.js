/* Time literals (T#3s), addresses (Siemens I0.0 / CODESYS %IX0.0), tag tables. Pure. */
(function () {
  'use strict';
  const SC = globalThis.SC;

  // ---------------------------------------------------------------- time
  const UNIT_MS = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 };

  // "T#3s", "T#500ms", "T#1m30s", "T#1.5s" -> ms ; anything else -> null
  function parseTime(x) {
    if (typeof x !== 'string') return null;
    const m = /^T#(.+)$/i.exec(x.trim());
    if (!m) return null;
    const body = m[1].toLowerCase().replace(/_/g, '');
    const re = /(\d+(?:\.\d+)?)(ms|s|m|h|d)/y;
    let i = 0, total = 0, n = 0;
    while (i < body.length) {
      re.lastIndex = i;
      const k = re.exec(body);
      if (!k) return null;
      total += parseFloat(k[1]) * UNIT_MS[k[2]];
      i = re.lastIndex;
      n++;
    }
    return n ? Math.round(total) : null;
  }

  function formatTime(ms) {
    ms = Math.max(0, Math.round(ms));
    if (ms === 0) return 'T#0ms';
    let out = 'T#';
    const parts = [['d', 86400000], ['h', 3600000], ['m', 60000], ['s', 1000], ['ms', 1]];
    for (const [u, f] of parts) {
      const q = Math.floor(ms / f);
      if (q > 0) { out += q + u; ms -= q * f; }
    }
    return out;
  }

  // ---------------------------------------------------------------- addresses
  const N_BITS = 256, N_WORDS = 256;

  // returns {kind:'bit',arr,byte,bit,idx,canon} | {kind:'word',arr,idx,canon} | null
  function parseAddr(s) {
    if (typeof s !== 'string') return null;
    s = s.trim();
    let m = /^%?([IQM])X?(\d{1,2})\.([0-7])$/i.exec(s);
    if (m) {
      const arr = m[1].toUpperCase(), byte = +m[2], bit = +m[3];
      if (byte > 31) return null;
      return { kind: 'bit', arr, byte, bit, idx: byte * 8 + bit, canon: arr + byte + '.' + bit };
    }
    m = /^%?(IW|QW|MW)(\d{1,3})$/i.exec(s);
    if (m) {
      const arr = m[1].toUpperCase(), n = +m[2];
      if (n >= N_WORDS) return null;
      return { kind: 'word', arr, idx: n, canon: arr + n };
    }
    return null;
  }

  // canonical (Siemens) -> CODESYS display
  function toCodesys(canon) {
    const a = parseAddr(canon);
    if (!a) return canon;
    return a.kind === 'bit' ? `%${a.arr}X${a.byte}.${a.bit}` : `%${a.arr}${a.idx}`;
  }

  // ---------------------------------------------------------------- tags
  // tag: {name, addr, type:'Bool'|'Int', wiring?:'NO'|'NC', role?, desc?:{en,ar}, user?:bool}
  function makeTagMap(tags) {
    const byName = Object.create(null), byAddr = Object.create(null);
    for (const t of tags || []) {
      byName[t.name] = t;
      const a = parseAddr(t.addr);
      if (a) byAddr[a.canon] = t;
    }
    return { byName, byAddr };
  }

  // Next free memory bit / word for auto-created user tags.
  function nextFreeAddr(tags, kind) {
    const used = new Set((tags || []).map((t) => (parseAddr(t.addr) || {}).canon));
    if (kind === 'word') {
      for (let n = 10; n <= 40; n += 2) if (!used.has('MW' + n)) return 'MW' + n;
      return null;
    }
    for (let byte = 0; byte <= 9; byte++) for (let bit = 0; bit < 8; bit++) {
      const c = `M${byte}.${bit}`;
      if (!used.has(c)) return c;
    }
    return null;
  }

  SC.addr = { parseTime, formatTime, parseAddr, toCodesys, makeTagMap, nextFreeAddr, N_BITS, N_WORDS };
})();
