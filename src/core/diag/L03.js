/* L03 diagnostics */
(function () {
  'use strict';
  const D = globalThis.SC.diag;

  D.add('reset_not_required', {
    msg: { en: 'Reset_PB is not used to make the line ready, so the operator can restart after an E-stop with Start alone. Add a READY bit that only Reset can set.', ar: 'ما استخدمت {{Reset_PB}} لتجهيز الخط، فالمشغّل بيقدر يشغّل بعد الطوارئ بـ {{Start}} لحاله. زيد بت جاهزية ما بيشغّله إلا {{Reset}}.'.replace(/\{\{|\}\}/g, '') },
    test: (ctx) => !ctx.usesTag('Reset_PB') || (ctx.readers('Reset_PB').length > 0 && !ctx.readers('Reset_PB').some((x) => ctx.writers(x.e.a).length === 0 && false) && !ctx.program.rungs.some((rg, ri) => {
      // Reset reaches only a coil whose result is used by the motor rung?  (a quick structural test: is the motor rung dependent on anything Reset drives?)
      const resetCoils = [];
      ctx.rungEls(ri).forEach((x) => { if (x.e.t === 'OUT' && ctx.rungEls(ri).some((y) => y.e.t === 'NO' && y.e.a === 'Reset_PB')) resetCoils.push(x.e.a); });
      return resetCoils.some((n) => n !== 'Conveyor_Motor' && ctx.readers(n).length > 0);
    })),
  });

  // the latch (a seal-in) exists, but the safety bits are only in a different rung that gates the motor output
  D.add('auto_restart_latch_not_cleared', {
    msg: { en: 'The safety bits only block the output. The run latch is still ON, so the motor restarts by itself when the E-stop is released. The E-stop and the door must also clear the latch.', ar: 'بتات السلامة بس بتحجب المخرج. الـ {{latch}} لسا شغّال، فالمحرك بيرجع يشتغل لحاله لما تفلت الطوارئ. الطوارئ والباب لازم يمسحوا الـ {{latch}} كمان.'.replace(/\{\{|\}\}/g, '') },
    test: (ctx) => {
      const latchCoils = ctx.program.rungs.map((rg, ri) => ri).filter((ri) => {
        const els = ctx.rungEls(ri);
        const out = els.find((x) => x.e.t === 'OUT');
        return out && els.some((x) => x.e.t === 'NO' && x.e.a === out.e.a) && out.e.a !== 'Conveyor_Motor' && !els.some((x) => (x.e.t === 'NO') && (x.e.a === 'EStop_OK' || x.e.a === 'Door_Closed'));
      });
      return latchCoils.length > 0 && ctx.usesTag('EStop_OK');
    },
  });

  D.add('reset_starts_motor', {
    msg: { en: 'Reset_PB is in the start branch of the motor, so pressing Reset alone starts the conveyor. Reset only makes the line ready. Start still has to be pressed.', ar: '{{Reset_PB}} موجود بفرع التشغيل للمحرك، فضغط {{Reset}} لحاله بيشغّل الناقل. {{Reset}} بس بيجهّز الخط. لسا لازم تضغط {{Start}}.'.replace(/\{\{|\}\}/g, '') },
    test: (ctx) => ctx.program.rungs.some((rg, ri) => {
      const els = ctx.rungEls(ri);
      const motor = els.find((x) => x.e.t === 'OUT' && x.e.a === 'Conveyor_Motor');
      return !!motor && els.some((x) => x.e.t === 'NO' && x.e.a === 'Reset_PB' && x.r > 0 || (x.e.t === 'NO' && x.e.a === 'Reset_PB' && x.c === 0));
    }),
  });

  D.add('door_not_checked', {
    msg: { en: 'The door switch (Door_Closed) is never used. An open door must stop the line and block the restart until Reset.', ar: 'مفتاح الباب ({{Door_Closed}}) ما انستخدم. الباب المفتوح لازم يوقف الخط ويمنع التشغيل لحد {{Reset}}.'.replace(/\{\{|\}\}/g, '') },
    test: (ctx) => !ctx.usesTag('Door_Closed'),
  });
})();
