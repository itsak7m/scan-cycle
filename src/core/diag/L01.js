/* L01 diagnostics */
(function () {
  'use strict';
  const D = globalThis.SC.diag;
  const CONTACTS = ['NO', 'NC', 'POS', 'NEG', 'CMP'];

  D.add('coil_always_powered', {
    msg: { en: 'The coil has no contact in front of it, so it gets power on every scan. The motor runs all the time.', ar: 'الـ coil ما قدامه أي contact، فبيجيه power كل scan. المحرك بيشتغل طول الوقت.' },
    test: (ctx) => ctx.program.rungs.some((rg, ri) => {
      const els = ctx.rungEls(ri);
      return els.some((x) => x.e.t === 'OUT') && !els.some((x) => CONTACTS.indexOf(x.e.t) >= 0);
    }),
  });
})();
