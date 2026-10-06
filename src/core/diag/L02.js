/* L02 diagnostics */
(function () {
  'use strict';
  const D = globalThis.SC.diag;

  D.add('no_seal_in', {
    msg: { en: 'Nothing keeps the motor on after Start is released. Add a contact of the motor itself in parallel with Start (a seal-in).', ar: 'ما في شي بيخلّي المحرك شغّال بعد ما تفلت {{Start}}. زيد contact للمحرك نفسه على التوازي مع {{Start}} (seal-in).'.replace(/\{\{|\}\}/g, '') },
    test: (ctx) => ctx.writers('Conveyor_Motor').length > 0 && ctx.readers('Conveyor_Motor').length === 0,
  });

  // The holding contact (motor NO contact in a lower row) sits in the same parallel span as the Stop contact: Stop is bypassed.
  D.add('seal_bypasses_stop', {
    msg: { en: 'The seal-in branch skips the Stop contact. Once the motor runs, Stop has no effect. Put Stop in series AFTER the branch.', ar: 'فرع الـ seal-in بيتجاوز {{Stop}}. بعد ما المحرك يشتغل، {{Stop}} ما بيأثّر. حط {{Stop}} على التوالي بعد الفرع.'.replace(/\{\{|\}\}/g, '') },
    test: (ctx) => {
      for (let ri = 0; ri < ctx.program.rungs.length; ri++) {
        const rg = ctx.program.rungs[ri];
        const seal = ctx.rungEls(ri).find((x) => x.e.t === 'NO' && x.e.a === 'Conveyor_Motor' && x.r > 0);
        if (!seal) continue;
        const bars = Array.from(new Set((rg.vb || []).map((b) => b[0]))).sort((a, b) => a - b);
        const b0 = Math.max(...bars.filter((b) => b <= seal.c), 0);
        const after = bars.filter((b) => b > seal.c);
        const b1 = after.length ? Math.min(...after) : rg.cols;
        const stop = ctx.rungEls(ri).find((x) => (x.e.t === 'NO' || x.e.t === 'NC') && ctx.roleOf(x.e.a) === 'stop');
        if (stop && stop.c >= b0 && stop.c < b1) return true;
      }
      return false;
    },
  });
})();
