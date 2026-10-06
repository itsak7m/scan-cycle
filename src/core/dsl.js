/* Ladder text notation -> program JSON. Used for fixtures, examples and hints.
 *
 *   rung    :=  item*
 *   item    :=  element | '[' branch ('|' branch)+ ']'        (groups are not nested)
 *   element :=  tag            NO contact          /tag   NC contact
 *               (tag)          coil                (S:tag) set    (R:tag) reset
 *               NAME(a,b,..)   TON(DB_T,T#3s) CTU(DB_C,12,Reset_PB) CMP(>=,MW10,5) MOVE(5,MW10) POS(M0.0) ...
 *
 * Example (seal-in):  "[Start_PB | Motor] /Stop_PB (Motor)"   (NC contact = /tag)
 *
 * Program JSON:  {v:1, rungs:[{rows, cols, els:[{r,c,t,...params}], vb:[[boundary,gap],...], note?}]}
 */
(function () {
  'use strict';
  const SC = globalThis.SC;

  // instruction name -> ordered parameter keys
  const PARAMS = {
    NO: ['a'], NC: ['a'], OUT: ['a'], SET: ['a'], RST: ['a'], POS: ['a'], NEG: ['a'],
    TON: ['i', 'pt'], TOF: ['i', 'pt'], TP: ['i', 'pt'], TONR: ['i', 'pt', 'rs'],
    CTU: ['i', 'pv', 'rs'], CTD: ['i', 'pv', 'ld'], CTUD: ['i', 'pv', 'cd', 'rs', 'ld'],
    CMP: ['op', 'a', 'b'], MOVE: ['a', 'o'], ADD: ['a', 'b', 'o'], SUB: ['a', 'b', 'o'],
    SHL: ['w', 'b'], SHR: ['w', 'b'],
  };

  function fail(msg) { throw new Error('ladder text: ' + msg); }

  function tokenize(s) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const ch = s[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '[' || ch === ']' || ch === '|') { toks.push({ k: ch }); i++; continue; }
      if (ch === '(') {
        const j = s.indexOf(')', i);
        if (j < 0) fail('missing ) in ' + s);
        toks.push({ k: 'coil', v: s.slice(i + 1, j).trim() });
        i = j + 1;
        continue;
      }
      const m = /^\/?[A-Za-z_%][\w.%]*/.exec(s.slice(i));
      if (!m) fail('unexpected "' + s.slice(i, i + 8) + '"');
      let word = m[0];
      i += word.length;
      if (s[i] === '(') {
        const j = s.indexOf(')', i);
        if (j < 0) fail('missing ) after ' + word);
        toks.push({ k: 'call', name: word, args: s.slice(i + 1, j).split(',').map((x) => x.trim()) });
        i = j + 1;
      } else if (word[0] === '/') {
        toks.push({ k: 'el', el: { t: 'NC', a: word.slice(1) } });
      } else {
        toks.push({ k: 'el', el: { t: 'NO', a: word } });
      }
    }
    return toks;
  }

  const num = (v) => (/^-?\d+$/.test(v) ? parseInt(v, 10) : v);

  function toElement(tok) {
    if (tok.k === 'el') return tok.el;
    if (tok.k === 'coil') {
      const m = /^([SR]):(.+)$/.exec(tok.v);
      if (m) return { t: m[1] === 'S' ? 'SET' : 'RST', a: m[2].trim() };
      return { t: 'OUT', a: tok.v };
    }
    const name = tok.name.toUpperCase();
    const keys = PARAMS[name];
    if (!keys) fail('unknown instruction ' + tok.name);
    const el = { t: name };
    keys.forEach((k, idx) => {
      const v = tok.args[idx];
      if (v === undefined || v === '') return;
      el[k] = (k === 'pv' || k === 'a' || k === 'b') && name !== 'NO' ? num(v) : v;
    });
    // contacts / coils keep strings; CTU/CMP/MOVE/ADD numeric operands become numbers
    if (['NO', 'NC', 'OUT', 'SET', 'RST', 'POS', 'NEG'].includes(name)) el.a = tok.args[0];
    return el;
  }

  // parse into [item], item = {el} | {group:[[el...],[el...]]}
  function parseItems(toks) {
    let p = 0;
    function seq(inGroup) {
      const items = [];
      while (p < toks.length) {
        const t = toks[p];
        if (t.k === '[') {
          if (inGroup) fail('nested [ ] groups are not supported — flatten the branch');
          p++;
          const branches = [];
          let cur = seq(true);
          branches.push(cur);
          while (toks[p] && toks[p].k === '|') { p++; branches.push(seq(true)); }
          if (!toks[p] || toks[p].k !== ']') fail('missing ]');
          p++;
          if (branches.length < 2) fail('a group needs at least two branches');
          items.push({ group: branches.map((b) => b.map((x) => x.el)) });
        } else if (t.k === ']' || t.k === '|') {
          break;
        } else {
          items.push({ el: toElement(t) });
          p++;
        }
      }
      return items;
    }
    const out = seq(false);
    if (p < toks.length) fail('unexpected ' + toks[p].k);
    return out;
  }

  function parseRung(text, note) {
    const items = parseItems(tokenize(text));
    const els = [];
    const vb = [];
    let c = 0, rows = 1, prevGroup = false;
    for (const it of items) {
      if (it.el) {
        els.push(Object.assign({ r: 0, c }, it.el));
        c++;
        prevGroup = false;
      } else {
        if (prevGroup) c++; // spacer column so closing/opening bars never share a boundary
        const W = Math.max(...it.group.map((b) => b.length), 1);
        it.group.forEach((branch, bi) => {
          branch.forEach((el, k) => els.push(Object.assign({ r: bi, c: c + k }, el)));
        });
        for (let g = 0; g < it.group.length - 1; g++) { vb.push([c, g]); vb.push([c + W, g]); }
        rows = Math.max(rows, it.group.length);
        c += W;
        prevGroup = true;
      }
    }
    const rung = { rows, cols: Math.max(c, 1), els, vb };
    if (note) rung.note = note;
    return rung;
  }

  // lines: ["rung text", ...] or [{t:"rung text", note:"..."}]
  function parseProgram(lines) {
    return {
      v: 1,
      rungs: lines.map((l) => (typeof l === 'string' ? parseRung(l) : parseRung(l.t, l.note))),
    };
  }

  // a program may be given as program JSON or as {lines:[...ladder text...]}
  function programFrom(x) {
    if (!x) return { v: 1, rungs: [] };
    if (x.lines) return parseProgram(x.lines);
    return x;
  }

  SC.dsl = { parseRung, parseProgram, programFrom, PARAMS };
})();
