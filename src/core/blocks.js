/* IEC 61131-3 function blocks. Each mutates its instance record `s` and returns Q.
 * Instance state lives in runtime memory (st.inst[name]) — never in the program JSON.
 *
 * Timing convention: a scan advances time by dt; a block that sees IN on its Nth consecutive scan
 * has ET = N*dt (TON). Q goes true on the scan where ET reaches PT.
 */
(function () {
  'use strict';
  const SC = globalThis.SC;

  function newInst(type) {
    return { type, ET: 0, Q: 0, QU: 0, QD: 0, CV: 0, prev: 0, prev2: 0, run: 0, PT: 0 };
  }

  function ton(s, inp, dt, pt) {
    s.PT = pt;
    if (inp) { s.ET = Math.min(s.ET + dt, pt); s.Q = s.ET >= pt ? 1 : 0; }
    else { s.ET = 0; s.Q = 0; }
    return s.Q;
  }

  function tof(s, inp, dt, pt) {
    s.PT = pt;
    if (inp) { s.Q = 1; s.ET = 0; }
    else if (s.Q) { s.ET += dt; if (s.ET >= pt) { s.ET = pt; s.Q = 0; } }
    return s.Q;
  }

  // Pulse: Q stays high for exactly PT after a rising edge; not retriggerable while running.
  function tp(s, inp, dt, pt) {
    s.PT = pt;
    const rise = inp && !s.prev;
    s.prev = inp ? 1 : 0;
    if (rise && !s.run) { s.run = 1; s.ET = 0; s.Q = pt > 0 ? 1 : 0; if (pt <= 0) s.run = 0; return s.Q; }
    if (s.run) {
      s.ET += dt;
      if (s.ET >= pt) { s.run = 0; s.Q = 0; s.ET = pt; }
      else s.Q = 1;
    }
    return s.Q;
  }

  // Retentive on-delay: ET is kept when IN drops; R resets ET and Q.
  function tonr(s, inp, dt, pt, reset) {
    s.PT = pt;
    if (reset) { s.ET = 0; s.Q = 0; return 0; }
    if (inp) s.ET = Math.min(s.ET + dt, pt);
    s.Q = s.ET >= pt ? 1 : 0;
    return s.Q;
  }

  function ctu(s, cu, pv, reset) {
    const edge = cu && !s.prev;
    s.prev = cu ? 1 : 0;
    if (reset) s.CV = 0;
    else if (edge) s.CV = Math.min(s.CV + 1, 32767);
    s.Q = s.CV >= pv ? 1 : 0;
    return s.Q;
  }

  function ctd(s, cd, pv, load) {
    const edge = cd && !s.prev;
    s.prev = cd ? 1 : 0;
    if (load) s.CV = pv;
    else if (edge) s.CV = Math.max(s.CV - 1, -32768);
    s.Q = s.CV <= 0 ? 1 : 0;
    return s.Q;
  }

  function ctud(s, cu, cd, pv, reset, load) {
    const eu = cu && !s.prev, ed = cd && !s.prev2;
    s.prev = cu ? 1 : 0; s.prev2 = cd ? 1 : 0;
    if (reset) s.CV = 0;
    else if (load) s.CV = pv;
    else {
      let d = 0;
      if (eu) d++;
      if (ed) d--;
      s.CV = Math.max(-32768, Math.min(32767, s.CV + d));
    }
    s.QU = s.CV >= pv ? 1 : 0;
    s.QD = s.CV <= 0 ? 1 : 0;
    s.Q = s.QU;
    return s.QU;
  }

  const toI16 = (x) => (x << 16) >> 16;

  SC.blocks = { newInst, ton, tof, tp, tonr, ctu, ctd, ctud, toI16 };
})();
