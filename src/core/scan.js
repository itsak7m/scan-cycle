/* The scan cycle. Deterministic: same (compiled, state) in -> same state out, byte for byte.
 *
 * One scan:  (caller wrote the sensor snapshot into st.I)
 *            rungs 1..N evaluated in order; coils/blocks write memory immediately,
 *            so later rungs see earlier writes in the same scan (double coil = last write wins).
 *            (caller then copies st.Q to the plant actuators)
 */
(function () {
  'use strict';
  const SC = globalThis.SC;
  const B = SC.blocks;
  const { N_BITS, N_WORDS } = SC.addr;

  function newState() {
    return {
      t: 0, scans: 0,
      I: new Uint8Array(N_BITS), Q: new Uint8Array(N_BITS), M: new Uint8Array(N_BITS),
      IW: new Int32Array(N_WORDS), QW: new Int32Array(N_WORDS), MW: new Int32Array(N_WORDS),
      inst: Object.create(null),
    };
  }

  function cloneState(st) {
    const inst = Object.create(null);
    for (const k in st.inst) inst[k] = Object.assign({}, st.inst[k]);
    return {
      t: st.t, scans: st.scans,
      I: st.I.slice(), Q: st.Q.slice(), M: st.M.slice(),
      IW: st.IW.slice(), QW: st.QW.slice(), MW: st.MW.slice(), inst,
    };
  }

  // make sure every instance used by the program has a record
  function ensureInsts(c, st) {
    for (const name in c.insts) if (!st.inst[name]) st.inst[name] = B.newInst(c.insts[name].type);
  }

  const ZERO = { Q: 0, QU: 0, QD: 0, ET: 0, CV: 0, PT: 0 };
  const rb = (st, ref) => (ref.k === 'b' ? st[ref.arr][ref.idx] : ((st.inst[ref.name] || ZERO)[ref.f] ? 1 : 0));
  const wb = (st, ref, v) => { st[ref.arr][ref.idx] = v ? 1 : 0; };
  function ri(st, ref) {
    if (ref.k === 'c') return ref.v;
    if (ref.k === 'w') return st[ref.arr][ref.idx];
    return (st.inst[ref.name] || ZERO)[ref.f] | 0;
  }
  const wi = (st, ref, v) => { st[ref.arr][ref.idx] = B.toI16(v); };

  function cmp(op, a, b) {
    switch (op) {
      case '==': return a === b;
      case '<>': return a !== b;
      case '>': return a > b;
      case '<': return a < b;
      case '>=': return a >= b;
      default: return a <= b;
    }
  }

  function inst(st, e) {
    return st.inst[e.inst] || (st.inst[e.inst] = B.newInst(e.t));
  }

  // evaluate one element; returns power out (0/1)
  function exec(e, pin, st, dt) {
    switch (e.t) {
      case 'NO': return pin && e.ra && rb(st, e.ra) ? 1 : 0;
      case 'NC': return pin && e.ra && !rb(st, e.ra) ? 1 : 0;
      case 'OUT': if (e.wa) wb(st, e.wa, pin); return pin;
      case 'SET': if (pin && e.wa) wb(st, e.wa, 1); return pin;
      case 'RST': if (pin && e.wa) wb(st, e.wa, 0); return pin;
      case 'POS': { if (!e.ma) return 0; const prev = rb(st, e.ma); wb(st, e.ma, pin); return pin && !prev ? 1 : 0; }
      case 'NEG': { if (!e.ma) return 0; const prev = rb(st, e.ma); wb(st, e.ma, pin); return !pin && prev ? 1 : 0; }
      case 'TON': return B.ton(inst(st, e), pin, dt, e.ptv);
      case 'TOF': return B.tof(inst(st, e), pin, dt, e.ptv);
      case 'TP': return B.tp(inst(st, e), pin, dt, e.ptv);
      case 'TONR': return B.tonr(inst(st, e), pin, dt, e.ptv, e.rr ? rb(st, e.rr) : 0);
      case 'CTU': return B.ctu(inst(st, e), pin, ri(st, e.pvr), e.rr ? rb(st, e.rr) : 0);
      case 'CTD': return B.ctd(inst(st, e), pin, ri(st, e.pvr), e.ldr ? rb(st, e.ldr) : 0);
      case 'CTUD': return B.ctud(inst(st, e), pin, e.cdr ? rb(st, e.cdr) : 0, ri(st, e.pvr), e.rr ? rb(st, e.rr) : 0, e.ldr ? rb(st, e.ldr) : 0);
      case 'CMP': return pin && cmp(e.op, ri(st, e.ia), ri(st, e.ib)) ? 1 : 0;
      case 'MOVE': if (pin && e.ow) wi(st, e.ow, ri(st, e.ia)); return pin;
      case 'ADD': if (pin && e.ow) wi(st, e.ow, ri(st, e.ia) + ri(st, e.ib)); return pin;
      case 'SUB': if (pin && e.ow) wi(st, e.ow, ri(st, e.ia) - ri(st, e.ib)); return pin;
      case 'SHL': if (pin && e.ww) { const w = st[e.ww.arr][e.ww.idx] & 0xFFFF; st[e.ww.arr][e.ww.idx] = B.toI16(((w << 1) | (e.bb && rb(st, e.bb) ? 1 : 0)) & 0xFFFF); } return pin;
      case 'SHR': if (pin && e.ww) { const w = st[e.ww.arr][e.ww.idx] & 0xFFFF; st[e.ww.arr][e.ww.idx] = B.toI16((w >> 1) | ((e.bb && rb(st, e.bb) ? 1 : 0) << 15)); } return pin;
    }
    return 0;
  }

  // rec (optional): array; rec[rungIndex] = {pin:[col][row], pout:[col][row]} for power-flow display
  function scanRung(R, st, dt, rec) {
    const { rows, cols, grid, wire, comps } = R;
    let src = new Array(rows).fill(0);
    src[0] = 1;
    let rpin = null, rpout = null;
    if (rec) { rpin = []; rpout = []; }
    for (let c = 0; c < cols; c++) {
      // merge at boundary c
      const p = src.slice();
      for (const comp of comps[c]) {
        let any = 0;
        for (const r of comp) if (src[r]) { any = 1; break; }
        for (const r of comp) p[r] = any;
      }
      const o = new Array(rows).fill(0);
      for (let r = 0; r < rows; r++) {
        const e = grid[c][r];
        o[r] = e ? exec(e, p[r], st, dt) : (wire[r][c] ? p[r] : 0);
      }
      if (rec) { rpin.push(p); rpout.push(o); }
      src = o;
    }
    if (rec) {
      // power at the right edge (boundary `cols`) after closing bars
      const p = src.slice();
      for (const comp of comps[cols]) {
        let any = 0;
        for (const r of comp) if (src[r]) { any = 1; break; }
        for (const r of comp) p[r] = any;
      }
      rec.push({ pin: rpin, pout: rpout, edge: p });
    }
  }

  // in-place scan (game loop, headless runner)
  function scanMut(c, st, dt, rec) {
    dt = dt || c.scanMs;
    ensureInsts(c, st);
    for (const R of c.rungs) {
      if (!R) { if (rec) rec.push(null); continue; }
      scanRung(R, st, dt, rec);
    }
    st.t += dt;
    st.scans++;
  }

  // pure wrapper: returns a new state, input untouched
  function scan(c, st, dt) {
    const n = cloneState(st);
    scanMut(c, n, dt);
    return n;
  }

  // byte-exact fingerprint of a state (for determinism tests)
  function fingerprint(st) {
    const parts = [st.t, st.scans, Array.from(st.I).join(''), Array.from(st.Q).join(''), Array.from(st.M).join('')];
    parts.push(Array.from(st.IW).join(','), Array.from(st.QW).join(','), Array.from(st.MW).join(','));
    parts.push(JSON.stringify(Object.keys(st.inst).sort().map((k) => [k, st.inst[k]])));
    return parts.join('|');
  }

  SC.scan = scan;
  SC.scanMut = scanMut;
  SC.newState = newState;
  SC.cloneState = cloneState;
  SC.fingerprint = fingerprint;
  SC.mem = { rb, wb, ri, wi };
})();
