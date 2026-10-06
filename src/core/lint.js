/* Static lint (runs on every edit). Returns [{id, sev:'warn'|'error', rung, r, c, msg:{en,ar}}]. Pure. */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const A = SC.addr;

  function lint(program, tags, opts) {
    const out = [];
    opts = opts || {};
    const tm = A.makeTagMap(tags || []);
    const add = (id, sev, ri, el, en, ar) => out.push({ id, sev, rung: ri, r: el ? el.r : undefined, c: el ? el.c : undefined, msg: { en, ar } });
    if (!program || !Array.isArray(program.rungs)) return out;

    const canon = (tok) => {
      if (typeof tok !== 'string') return null;
      const t = tm.byName[tok];
      const a = A.parseAddr(t ? t.addr : tok);
      return a ? a.canon : null;
    };

    const coils = new Map();   // canon -> [{ri,e}]
    const edges = new Map();
    const insts = new Map();   // name -> [{ri,e}]
    const used = new Set();    // tag names referenced

    program.rungs.forEach((rg, ri) => {
      const els = (rg && rg.els) || [];
      let hasEdge = false;
      for (const e of els) if (e.t === 'POS' || e.t === 'NEG') hasEdge = true;
      for (const e of els) {
        for (const k of ['a', 'b', 'o', 'w', 'rs', 'ld', 'cd']) if (typeof e[k] === 'string') used.add(e[k]);
        if (e.t === 'OUT') {
          const c = canon(e.a);
          if (c) { if (!coils.has(c)) coils.set(c, []); coils.get(c).push({ ri, e }); }
        }
        if (e.t === 'POS' || e.t === 'NEG') {
          const c = canon(e.a);
          if (c) { if (!edges.has(c)) edges.set(c, []); edges.get(c).push({ ri, e }); }
        }
        if (e.i) { if (!insts.has(e.i)) insts.set(e.i, []); insts.get(e.i).push({ ri, e }); }
        if ((e.t === 'ADD' || e.t === 'SUB') && !hasEdge) {
          add('add_without_edge', 'warn', ri, e,
            `${e.t} runs on every scan while powered — put an edge contact before it`,
            `${e.t} ينفّذ كل scan طول ما في power — حط edge contact قبله`);
        }
        if (e.t === 'NC') {
          const t = tm.byName[e.a];
          if (t && t.wiring === 'NC' && (t.role === 'stop' || t.role === 'estop')) {
            add('nc_on_nc_stop', 'warn', ri, e,
              `${e.a} is wired normally closed, so its bit is 1 when idle. An NC contact passes power only when the button is pressed. Use an NO contact.`,
              `${e.a} موصول NC فالبت = 1 وهو مش مضغوط. الـ NC contact بيمرّر فقط لما الزر ينضغط. استخدم NO contact.`);
          }
        }
      }
      // vertical bars that never close
      const cols = rg.cols | 0, rows = rg.rows | 0;
      const bars = new Set((rg.vb || []).map((x) => x[0] + ',' + x[1]));
      const has = (b, g) => bars.has(b + ',' + g);
      for (let r = 1; r < rows; r++) {
        let n = 0;
        for (let b = 0; b <= cols; b++) if (has(b, r - 1) || has(b, r)) n++;
        if (n % 2 === 1) add('branch_open', 'warn', ri, { r, c: 0 }, 'A parallel branch is opened but never closed', 'فرع متوازي انفتح وما انسكّر');
      }
      // elements in branch rows with no power path
      const wire = SC.compile.buildWire(Math.max(1, rows), Math.max(1, cols), bars).wire;
      for (const e of els) {
        if (e.r > 0 && wire[e.r] && !wire[e.r][e.c]) {
          add('unconnected', 'warn', ri, e, 'This element is not connected to the rung', 'العنصر هذا مش موصول بالـ rung');
        }
      }
    });

    for (const [c, list] of coils) {
      if (list.length > 1) {
        const t = tm.byAddr[c];
        const nm = t ? t.name : c;
        for (let k = 1; k < list.length; k++) {
          add('double_coil', 'warn', list[k].ri, list[k].e,
            `Double coil: ${nm} is written by ${list.length} coils — the last one wins every scan`,
            `Double coil: ${nm} مكتوب من ${list.length} coils — الأخير هو اللي بيغلب بكل scan`);
        }
      }
    }
    for (const [c, list] of edges) {
      if (list.length > 1) {
        for (let k = 1; k < list.length; k++) {
          add('edge_bit_reused', 'error', list[k].ri, list[k].e,
            `Edge memory ${c} is used by ${list.length} edge contacts — each edge needs its own M bit`,
            `ذاكرة الـ edge ${c} مستخدمة من ${list.length} edge — كل edge لازم بت M خاص فيه`);
        }
      }
    }
    for (const [name, list] of insts) {
      if (list.length > 1) {
        for (let k = 1; k < list.length; k++) {
          add('shared_instance', 'warn', list[k].ri, list[k].e,
            `Two blocks share ${name} — the second overwrites the first`,
            `بلوكين بيشاركوا ${name} — الثاني بيمسح الأول`);
        }
      }
    }
    for (const t of tags || []) {
      if (t.user && !used.has(t.name)) {
        out.push({ id: 'unused_tag', sev: 'warn', rung: -1, msg: { en: `Tag ${t.name} is never used`, ar: `الـ tag ${t.name} ما انستخدم` } });
      }
    }
    return out;
  }

  SC.lint = lint;
})();
