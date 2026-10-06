/* L07 diagnostics: CTU batch counter */
(function () {
  'use strict';
  const D = globalThis.SC.diag;
  const plain = (s) => s.replace(/\{\{|\}\}/g, '');

  // the R input of a CTU: a bit tag name (or undefined)
  const resetOf = (x) => (typeof x.e.rs === 'string' ? x.e.rs : '');

  // names that carry the counter's "done" state: inst.Q and the bits written in rungs that use it (two hops)
  function doneNames(ctx) {
    const names = new Set();
    ctx.ofType('CTU').forEach((x) => { if (x.e.i) names.add(x.e.i + '.Q'); });
    for (let pass = 0; pass < 2; pass++) {
      ctx.program.rungs.forEach((rg, ri) => {
        const els = ctx.rungEls(ri);
        const feeds = els.some((y) => y.e.t === 'CTU') || els.some((y) => (y.e.t === 'NO' || y.e.t === 'NC') && names.has(y.e.a));
        if (feeds) els.forEach((y) => { if ((y.e.t === 'OUT' || y.e.t === 'SET') && typeof y.e.a === 'string') names.add(y.e.a); });
      });
    }
    return names;
  }

  // R is ON all the time: wired to a bit that is 1 when idle (NC-wired stop / E-stop / door)
  D.add('reset_held_high', {
    msg: { en: 'The R (reset) pin of the counter is ON almost all the time, so the count is held at 0 and the counter never counts. R must read the Reset button (Reset_PB): its bit is 0 until the operator presses it. A Stop button is wired normally closed, so its bit is 1 when idle.', ar: plain('رجل R (التصفير) للعدّاد شغّالة تقريبًا طول الوقت، فالعدّ محبوس على 0 والعدّاد ما بيعدّ أبدًا. R لازم تقرا زر {{Reset}} (Reset_PB): بتّه 0 لحد ما المشغّل يضغطه. زر {{Stop}} موصول NC، فبتّه 1 وهو مش مضغوط.') },
    test: (ctx) => ctx.ofType('CTU').some((x) => {
      const t = ctx.tag(resetOf(x));
      return !!t && (t.wiring === 'NC' || ['stop', 'estop', 'guard'].indexOf(t.role) >= 0);
    }),
  });

  // R reads a bit that the same counter drives (its own done bit or the lamp)
  D.add('counter_resets_itself', {
    msg: { en: 'The R pin reads the lamp, and the counter itself drives the lamp. At 12 the lamp turns ON, that clears the count, and the lamp turns OFF again: it is ON for only ONE scan. R must read the Reset button.', ar: plain('رجل R بتقرا المصباح، والعدّاد نفسه هو اللي بيشغّل المصباح. عند 12 المصباح بيشتغل، هاد بيمسح العدّ، والمصباح بينطفي من جديد: بيضل شغّال {{scan}} واحد بس. R لازم تقرا زر {{Reset}}.') },
    test: (ctx) => ctx.ofType('CTU').some((x) => {
      const r = resetOf(x);
      if (!r) return false;
      return ctx.writers(r).some((w) => w.ri === x.ri || ctx.rungEls(w.ri).some((y) => (y.e.t === 'NO' || y.e.t === 'NC') && y.e.a === x.e.i + '.Q'));
    }),
  });

  // the counter exists but nothing in the conveyor rung(s) reads its done state
  D.add('batch_no_stop', {
    msg: { en: 'The batch is complete, but nothing stops the conveyor. Put a contact of the counter output Q (or of the batch lamp) in series with the conveyor rung, so the conveyor stops at 12 bottles.', ar: plain('الدفعة كاملة، بس ما في شي بيوقّف الناقل. حط {{contact}} من مخرج العدّاد Q (أو من مصباح الدفعة) على التوالي مع rung الناقل، عشان الناقل يوقف عند 12 قارورة.') },
    test: (ctx) => {
      if (!ctx.ofType('CTU').length) return false;
      const motor = ctx.writers('Conveyor_Motor');
      if (!motor.length) return false;
      const done = doneNames(ctx);
      return !motor.some((w) => ctx.rungEls(w.ri).some((y) => (y.e.t === 'NO' || y.e.t === 'NC') && done.has(y.e.a)));
    },
  });

  D.add('wrong_preset', {
    msg: { en: 'The preset value (PV) is not 12. The counter output Q turns ON when the count reaches PV, so PV must be exactly the size of the batch: 12.', ar: plain('القيمة المحددة (PV) مش 12. مخرج العدّاد Q بيشتغل لما العدّ يوصل PV، فلازم PV تكون بالضبط حجم الدفعة: 12.') },
    test: (ctx) => ctx.ofType('CTU').some((x) => typeof x.e.pv === 'number' && x.e.pv !== 12),
  });

  // the lamp keeps itself ON (seal-in or SET without RST): Reset cannot clear it
  D.add('lamp_latched_no_reset', {
    msg: { en: 'The lamp holds itself ON (a latch) and Reset does not clear it. The lamp must follow the counter output Q: when Reset sets the count to 0, Q goes to 0 and the lamp goes OFF.', ar: plain('المصباح بيثبّت حاله شغّال ({{latch}}) و{{Reset}} ما بيمسحه. المصباح لازم يتبع مخرج العدّاد Q: لما {{Reset}} يرجّع العدّ إلى 0، Q بيروح 0 والمصباح بينطفي.') },
    test: (ctx) => ctx.writers('Batch_Lamp').some((w) => (w.e.t === 'OUT' && ctx.rungEls(w.ri).some((y) => y.e.t === 'NO' && y.e.a === 'Batch_Lamp') && !ctx.rungEls(w.ri).some((y) => y.e.a === 'Reset_PB'))
      || (w.e.t === 'SET' && !ctx.writers('Batch_Lamp').some((v) => v.e.t === 'RST'))),
  });

  // R wired to Start: every Start clears the count
  D.add('reset_on_start', {
    msg: { en: 'The counter R pin is wired to Start. Every Start clears the count and the Reset button does nothing. Stop and Start must keep the count. Wire R to Reset_PB.', ar: plain('رجل R للعدّاد موصولة على {{Start}}. كل {{Start}} بيمسح العدّ وزر {{Reset}} ما بيعمل شي. {{Stop}} و{{Start}} لازم يحافظوا على العدّ. وصّل R على Reset_PB.') },
    test: (ctx) => ctx.ofType('CTU').some((x) => ctx.roleOf(resetOf(x)) === 'start'),
  });
})();
