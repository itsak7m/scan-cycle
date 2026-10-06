/* L14 diagnostics: CIP sequence (TONR with hold, continuous-condition timer, reset of retentive timers) */
(function () {
  'use strict';
  const D = globalThis.SC.diag;

  const inRung = (ctx, x, names) => ctx.rungEls(x.ri).some((y) => names.indexOf(y.e.a) >= 0);

  D.add('ton_instead_of_tonr', {
    msg: { en: 'A TON sets its time back to 0 every time its signal drops. In the pre-rinse and the caustic step the time must be KEPT while the flow or the temperature is lost. Use TONR.', ar: 'الـ TON بيرجّع وقته 0 كل ما إشارته تسقط. بالشطف الأولي وخطوة القلوي الوقت لازم يتحفظ لما التدفق أو الحرارة تروح. استخدم TONR.' },
    test: (ctx) => ctx.ofType('TON').some((x) => inRung(ctx, x, ['CIP_Temp_OK', 'CIP_Flow_OK'])),
  });

  D.add('cond_momentary', {
    msg: { en: 'CIP_Cond_OK is used without a 10 s timer, so one moment of good conductivity is enough. The final rinse needs CIP_Cond_OK = 1 for 10 s without a break. Use a TON.', ar: 'استخدمت CIP_Cond_OK بدون مؤقّت 10 ثواني، فلحظة وحدة موصلية سليمة كفت. الشطف الأخير بده CIP_Cond_OK = 1 لمدة 10 ثواني بدون انقطاع. استخدم TON.' },
    test: (ctx) => ctx.usesTag('CIP_Cond_OK') && !ctx.ofType('TON', 'TONR').some((x) => inRung(ctx, x, ['CIP_Cond_OK'])),
  });

  D.add('cond_timer_retentive', {
    msg: { en: 'A TONR keeps its time when CIP_Cond_OK drops, so short good moments add up. The 10 s must be CONTINUOUS: they start again from 0 after every drop. Use a TON here.', ar: 'الـ TONR بيحتفظ بوقته لما CIP_Cond_OK يسقط، فاللحظات السليمة القصيرة بتتجمّع. الـ 10 ثواني لازم تكون متواصلة: بتبدأ من 0 بعد كل سقوط. استخدم TON هون.' },
    test: (ctx) => ctx.ofType('TONR').some((x) => inRung(ctx, x, ['CIP_Cond_OK'])),
  });

  D.add('phase_skipped', {
    msg: (ctx) => {
      const miss = ['CIP_Pump', 'CIP_Caustic_Valve', 'CIP_Rinse_Valve', 'CIP_Drain_Valve', 'CIP_Done'].filter((n) => ctx.writers(n).length === 0);
      return { en: 'These outputs are never written: ' + miss.join(', ') + '. A phase of the recipe is missing, so the sequence skips it.', ar: 'هاي المخارج ما انكتب عليها أبدًا: ' + miss.join(', ') + '. في مرحلة من الوصفة ناقصة، فالتسلسل بيقفز عنها.' };
    },
    test: (ctx) => ['CIP_Pump', 'CIP_Caustic_Valve', 'CIP_Rinse_Valve', 'CIP_Drain_Valve', 'CIP_Done'].some((n) => ctx.writers(n).length === 0),
  });

  D.add('flow_not_checked', {
    msg: { en: 'CIP_Flow_OK is never used. The pre-rinse must count its 30 s only while the flow is OK, and hold when the flow is lost.', ar: 'ما استخدمت CIP_Flow_OK. الشطف الأولي لازم يعدّ الـ 30 ثانية بس لما التدفق سليم، وينتظر لما التدفق يروح.' },
    test: (ctx) => !ctx.usesTag('CIP_Flow_OK'),
  });

  D.add('tonr_never_reset', {
    msg: { en: 'A TONR has no reset bit. It keeps its old time after CIP mode is turned OFF, so the next run starts with time already counted. Give each TONR a reset bit (3rd parameter) that is ON while the line is idle.', ar: 'الـ TONR ما إله بت reset. بيحتفظ بوقته القديم بعد ما وضع CIP ينطفي، فالتشغيل الجاي بيبدأ والوقت منعدّ. اعطي كل TONR بت reset (البارامتر التالت) شغّال لما الخط يكون واقف.' },
    test: (ctx) => ctx.ofType('TONR').some((x) => !x.e.rs),
  });
})();
