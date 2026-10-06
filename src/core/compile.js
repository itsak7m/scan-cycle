/* Program JSON -> runnable form: validates structure, resolves tag names to memory refs.
 *
 * program: {v:1, rungs:[{rows, cols, els:[{r,c,t,...}], vb:[[boundary,gap],...]}]}
 * opts:    {tags:[...], palette:[...]|null, scanMs}
 * result:  {ok, errors:[{code,rung,r,c,msg:{en,ar}}], rungs:[...], insts:{name:{type,rung}}, tagMap, scanMs}
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const A = SC.addr;

  const CONTACTS = ['NO', 'NC'];
  const TIMERS = ['TON', 'TOF', 'TP', 'TONR'];
  const COUNTERS = ['CTU', 'CTD', 'CTUD'];
  const ALL = ['NO', 'NC', 'OUT', 'SET', 'RST', 'POS', 'NEG', 'TON', 'TOF', 'TP', 'TONR',
    'CTU', 'CTD', 'CTUD', 'CMP', 'MOVE', 'ADD', 'SUB', 'SHL', 'SHR'];
  const CMP_OPS = ['==', '<>', '>', '<', '>=', '<='];
  const MAX_ROWS = 6, MAX_COLS = 16;

  // which rows are wire (conducting) when a cell is empty
  function buildWire(rows, cols, barSet) {
    const has = (b, g) => g >= 0 && g <= rows - 2 && barSet.has(b + ',' + g);
    const wire = Array.from({ length: rows }, () => new Array(cols).fill(false));
    wire[0].fill(true);
    const oddRows = [];
    for (let r = 1; r < rows; r++) {
      const att = [];
      for (let b = 0; b <= cols; b++) if (has(b, r - 1) || has(b, r)) att.push(b);
      for (let k = 0; k + 1 < att.length; k += 2) for (let c = att[k]; c < att[k + 1]; c++) wire[r][c] = true;
      if (att.length % 2 === 1) oddRows.push(r);
    }
    return { wire, oddRows };
  }

  // groups of rows joined by bars, per boundary
  function buildComps(rows, cols, barSet) {
    const comps = [];
    for (let b = 0; b <= cols; b++) {
      const list = [];
      let cur = null;
      for (let g = 0; g <= rows - 2; g++) {
        if (barSet.has(b + ',' + g)) {
          if (!cur) { cur = [g]; list.push(cur); }
          cur.push(g + 1);
        } else cur = null;
      }
      comps.push(list);
    }
    return comps;
  }

  function compile(program, opts) {
    opts = opts || {};
    const tags = opts.tags || [];
    const tagMap = A.makeTagMap(tags);
    const palette = opts.palette ? new Set(opts.palette) : null;
    const errors = [];
    const insts = Object.create(null);
    const out = { ok: false, errors, rungs: [], insts, tagMap, scanMs: opts.scanMs || SC.SCAN_MS };
    const E = (code, ri, el, en, ar) => errors.push({ code, rung: ri, r: el ? el.r : undefined, c: el ? el.c : undefined, msg: { en, ar: ar || en } });

    if (!program || !Array.isArray(program.rungs)) {
      E('bad_program', -1, null, 'Program is not valid', 'البرنامج غير صالح');
      return out;
    }

    // pass 1: instance names
    program.rungs.forEach((rg, ri) => {
      for (const e of (rg && rg.els) || []) {
        if ((TIMERS.includes(e.t) || COUNTERS.includes(e.t)) && typeof e.i === 'string' && e.i) {
          const prev = insts[e.i];
          if (!prev) insts[e.i] = { type: e.t, rung: ri, uses: 1 };
          else {
            prev.uses++;
            if (prev.type !== e.t) E('inst_type_clash', ri, e, `Instance ${e.i} is used as ${prev.type} and ${e.t}`, `الاسم ${e.i} مستخدم لنوعين مختلفين`);
          }
        }
      }
    });

    // ---- operand resolution
    function bitRef(tok, ri, el, write) {
      if (typeof tok !== 'string' || !tok) { E('missing_param', ri, el, 'Missing address', 'العنوان ناقص'); return null; }
      let a = null;
      const tag = tagMap.byName[tok];
      if (tag) {
        a = A.parseAddr(tag.addr);
        if (!a || a.kind !== 'bit') { E('type_mismatch', ri, el, `${tok} is not a Bool tag`, `${tok} ليس من نوع Bool`); return null; }
      } else {
        a = A.parseAddr(tok);
        if (a && a.kind !== 'bit') { E('type_mismatch', ri, el, `${tok} is not a bit address`, `${tok} ليس بت`); return null; }
      }
      if (!a) {
        const m = /^([A-Za-z_]\w*)\.(Q|QU|QD)$/.exec(tok);
        if (m && insts[m[1]]) {
          if (write) { E('write_to_output_pin', ri, el, `${tok} cannot be written`, `لا يمكن الكتابة على ${tok}`); return null; }
          return { k: 'iq', name: m[1], f: m[2] };
        }
        E('unknown_tag', ri, el, `Unknown tag "${tok}"`, `الـ tag "${tok}" غير معروف`); errors[errors.length - 1].tok = tok;
        return null;
      }
      if (write && a.arr === 'I') { E('write_to_input', ri, el, `${tok} is an input — you cannot write to it`, `${tok} مدخل — لا يمكن الكتابة عليه`); return null; }
      return { k: 'b', arr: a.arr, idx: a.idx };
    }

    function intRef(tok, ri, el, write) {
      if (typeof tok === 'number' && !write) return { k: 'c', v: tok | 0 };
      if (typeof tok !== 'string' || !tok) { E('missing_param', ri, el, 'Missing value', 'القيمة ناقصة'); return null; }
      if (!write) {
        if (/^-?\d+$/.test(tok)) return { k: 'c', v: parseInt(tok, 10) };
        if (/^T#/i.test(tok)) {
          const ms = A.parseTime(tok);
          if (ms === null) { E('bad_time', ri, el, `"${tok}" is not a valid time`, `"${tok}" ليس وقتًا صحيحًا`); return null; }
          return { k: 'c', v: ms };
        }
      }
      let a = null;
      const tag = tagMap.byName[tok];
      if (tag) {
        a = A.parseAddr(tag.addr);
        if (!a || a.kind !== 'word') { E('type_mismatch', ri, el, `${tok} is not an Int tag`, `${tok} ليس من نوع Int`); return null; }
      } else {
        a = A.parseAddr(tok);
        if (a && a.kind !== 'word') { E('type_mismatch', ri, el, `${tok} is not a word address`, `${tok} ليس word`); return null; }
      }
      if (!a) {
        const m = /^([A-Za-z_]\w*)\.(ET|CV|PT)$/.exec(tok);
        if (m && insts[m[1]]) {
          if (write) { E('write_to_output_pin', ri, el, `${tok} cannot be written`, `لا يمكن الكتابة على ${tok}`); return null; }
          return { k: 'if', name: m[1], f: m[2] };
        }
        E('unknown_tag', ri, el, `Unknown tag "${tok}"`, `الـ tag "${tok}" غير معروف`); errors[errors.length - 1].tok = tok;
        return null;
      }
      if (write && a.arr === 'IW') { E('write_to_input', ri, el, `${tok} is an input word`, `${tok} مدخل`); return null; }
      return { k: 'w', arr: a.arr, idx: a.idx };
    }

    function timeParam(e, ri) {
      const ms = typeof e.pt === 'string' ? A.parseTime(e.pt) : null;
      if (ms === null) {
        E('bad_time', ri, e, `PT must be a time literal like T#3s (got ${JSON.stringify(e.pt)})`, `الـ PT لازم يكون وقت مثل T#3s`);
        return 0;
      }
      return ms;
    }

    function optBit(tok, ri, el) { return tok === undefined || tok === null || tok === '' ? null : bitRef(tok, ri, el, false); }

    // ---- per rung
    program.rungs.forEach((rg, ri) => {
      const rows = rg.rows | 0, cols = rg.cols | 0;
      if (rows < 1 || rows > MAX_ROWS || cols < 1 || cols > MAX_COLS) {
        E('bad_rung', ri, null, `Rung ${ri + 1}: bad size`, `الـ rung ${ri + 1} حجمه غير صالح`);
        out.rungs.push(null);
        return;
      }
      const barSet = new Set();
      for (const bg of rg.vb || []) {
        if (bg[0] < 0 || bg[0] > cols || bg[1] < 0 || bg[1] > rows - 2) { E('bad_rung', ri, null, 'Bad vertical bar', 'خط عمودي غير صالح'); continue; }
        barSet.add(bg[0] + ',' + bg[1]);
      }
      if (barSet.size && palette && !palette.has('BRANCH')) E('not_allowed', ri, null, 'Parallel branches are not unlocked yet', 'الفروع المتوازية غير مفعّلة بعد');
      const { wire, oddRows } = buildWire(rows, cols, barSet);
      const grid = Array.from({ length: cols }, () => new Array(rows).fill(null));
      const seen = new Set();
      const list = [];
      for (const e of rg.els || []) {
        if (!ALL.includes(e.t)) { E('bad_element', ri, e, `Unknown element ${e.t}`, `عنصر غير معروف ${e.t}`); continue; }
        if (!(e.r >= 0 && e.r < rows && e.c >= 0 && e.c < cols)) { E('bad_rung', ri, e, 'Element outside the rung grid', 'عنصر خارج الشبكة'); continue; }
        const key = e.r + ',' + e.c;
        if (seen.has(key)) { E('bad_rung', ri, e, 'Two elements in one cell', 'عنصران بنفس الخلية'); continue; }
        seen.add(key);
        if (palette && !palette.has(e.t)) E('not_allowed', ri, e, `${e.t} is not unlocked in this level`, `${e.t} غير مفعّل بهذا المستوى`);
        const x = { t: e.t, r: e.r, c: e.c };
        switch (e.t) {
          case 'NO': case 'NC': x.ra = bitRef(e.a, ri, e, false); break;
          case 'OUT': case 'SET': case 'RST': x.wa = bitRef(e.a, ri, e, true); break;
          case 'POS': case 'NEG': {
            x.ma = bitRef(e.a, ri, e, true);
            if (x.ma && x.ma.arr !== 'M') E('edge_bit_not_m', ri, e, 'Edge memory must be an M bit', 'ذاكرة الـ edge لازم تكون بت M');
            break;
          }
          case 'TON': case 'TOF': case 'TP': case 'TONR':
            x.inst = e.i; x.ptv = timeParam(e, ri);
            if (!e.i) E('missing_param', ri, e, 'Timer needs an instance name', 'المؤقّت يحتاج اسم instance');
            if (e.t === 'TONR') x.rr = optBit(e.rs, ri, e);
            break;
          case 'CTU': case 'CTD': case 'CTUD':
            x.inst = e.i;
            if (!e.i) E('missing_param', ri, e, 'Counter needs an instance name', 'العدّاد يحتاج اسم instance');
            x.pvr = intRef(e.pv === undefined ? 0 : e.pv, ri, e, false);
            if (e.t === 'CTU') x.rr = optBit(e.rs, ri, e);
            if (e.t === 'CTD') x.ldr = optBit(e.ld, ri, e);
            if (e.t === 'CTUD') { x.cdr = optBit(e.cd, ri, e); x.rr = optBit(e.rs, ri, e); x.ldr = optBit(e.ld, ri, e); }
            break;
          case 'CMP':
            if (!CMP_OPS.includes(e.op)) E('bad_op', ri, e, `Bad compare operator ${e.op}`, 'عملية مقارنة غير صالحة');
            x.op = e.op; x.ia = intRef(e.a, ri, e, false); x.ib = intRef(e.b, ri, e, false);
            break;
          case 'MOVE': x.ia = intRef(e.a, ri, e, false); x.ow = intRef(e.o, ri, e, true); break;
          case 'ADD': case 'SUB': x.ia = intRef(e.a, ri, e, false); x.ib = intRef(e.b, ri, e, false); x.ow = intRef(e.o, ri, e, true); break;
          case 'SHL': case 'SHR': x.ww = intRef(e.w, ri, e, true); x.bb = bitRef(e.b, ri, e, false); break;
        }
        grid[e.c][e.r] = x;
        list.push(x);
      }
      out.rungs.push({ rows, cols, grid, wire, comps: buildComps(rows, cols, barSet), oddRows, list, note: rg.note || '', title: rg.title || '' });
    });

    out.ok = errors.length === 0;
    return out;
  }

  SC.compile = compile;
  SC.compile.ELEMENTS = ALL;
  SC.compile.limits = { MAX_ROWS, MAX_COLS };
  SC.compile.buildWire = buildWire;
})();
