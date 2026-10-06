/* L08 diagnostics: reject station, one-shot pulse, SET / RESET */
(function () {
  'use strict';
  const D = globalThis.SC.diag;
  const plain = (s) => s.replace(/\{\{|\}\}/g, '');

  const TIMERS = ['TON', 'TOF', 'TP', 'TONR'];
  const EDGES = ['POS', 'NEG'];
  const pusherWriters = (ctx) => ctx.writers('Reject_Pusher');

  D.add('level_not_checked', {
    msg: { en: 'Level_OK is never used, so the pusher pushes EVERY bottle, good ones too. Push only when a bottle is at the photo-eye AND Level_OK = 0.', ar: plain('الـ {{Level_OK}} ما انستخدم، فالدافع بيزيح كل القوارير حتى السليمة. ادفع بس لما في قارورة عند العين الضوئية و {{Level_OK}} = 0.') },
    test: (ctx) => !ctx.usesTag('Level_OK'),
  });

  // Level_OK read only through NO contacts: the GOOD bottles start the pusher
  D.add('level_ok_wrong_polarity', {
    msg: { en: 'You use Level_OK as a normal (NO) contact. It is ON for GOOD bottles, so the good bottles are pushed off and the bad ones pass. A bad bottle is a bottle at the photo-eye AND Level_OK = 0: use an NC contact on Level_OK.', ar: plain('استخدمت {{Level_OK}} كـ {{contact}} عادي (NO). هو شغّال للقوارير السليمة، فالسليمة بتنزاح والسيئة بتمرّ. القارورة السيئة هي قارورة عند العين الضوئية و {{Level_OK}} = 0: استخدم NC contact على {{Level_OK}}.') },
    test: (ctx) => ctx.readers('Level_OK').some((x) => x.e.t === 'NO') && !ctx.readers('Level_OK').some((x) => x.e.t === 'NC'),
  });

  D.add('ton_instead_of_tp', {
    msg: { en: 'A TON waits 500 ms and only THEN switches ON. The bad bottle is in the beam for less than 500 ms, so the timer never finishes (and if it did, the bottle would have moved on). The pusher must start at once and stay ON for 500 ms: use a TP pulse timer.', ar: plain('الـ {{TON}} بيستنى 500 ms وبعدين بس بيشتغل. القارورة السيئة بتضل بالشعاع أقل من 500 ms، فالمؤقّت ما بيخلص أبدًا (ولو خلص، القارورة بتكون راحت). الدافع لازم يبدأ فورًا ويضل شغّال 500 ms: استخدم مؤقّت النبضة {{TP}}.') },
    test: (ctx) => ctx.ofType('TON').some((x) => ctx.rungEls(x.ri).some((y) => (y.e.t === 'OUT' || y.e.t === 'SET') && y.e.a === 'Reject_Pusher')),
  });

  // an edge contact in the pusher rung and no timer: a one-scan pulse
  D.add('edge_pulse_too_short', {
    msg: { en: 'An edge contact gives a pulse of only ONE scan (10 ms). The pusher needs more than 150 ms to move out, so it never pushes anything. Let a TP timer (or a SET / RESET with a timer) make the 500 ms pulse.', ar: plain('الـ edge contact بيعطي نبضة {{scan}} واحد بس (10 ms). الدافع بده أكتر من 150 ms ليطلع، فما بيزيح أي شي. خلّي مؤقّت {{TP}} (أو {{SET}} / {{RESET}} مع مؤقّت) هو اللي يعمل نبضة 500 ms.') },
    test: (ctx) => pusherWriters(ctx).some((w) => ctx.rungEls(w.ri).some((y) => EDGES.indexOf(y.e.t) >= 0) && !ctx.rungEls(w.ri).some((y) => TIMERS.indexOf(y.e.t) >= 0)),
  });

  // the pusher coil reads only sensors: it follows the photo-eye, so the pulse lasts until the pushed bottle is gone
  D.add('pusher_follows_eye', {
    msg: { en: 'The pusher coil follows the photo-eye: it is ON only while the bad bottle is in the beam. The pusher moves the bottle away in about 140 ms and the beam is empty again, so the pulse is much shorter than 500 ms. Use a TP timer: it keeps its output ON for the full 500 ms.', ar: plain('ملف الدافع بيتبع العين الضوئية: هو شغّال بس طول ما القارورة السيئة بالشعاع. الدافع بيبعد القارورة بحوالي 140 ms والشعاع بيرجع فاضي، فالنبضة أقصر بكتير من 500 ms. استخدم مؤقّت {{TP}}: بيخلّي مخرجه شغّال 500 ms كاملة.') },
    test: (ctx) => pusherWriters(ctx).some((w) => w.e.t === 'OUT' && ctx.rungEls(w.ri).every((y) => y.e.t === 'OUT'
      || ((y.e.t === 'NO' || y.e.t === 'NC') && !!ctx.tag(y.e.a) && !ctx.tag(y.e.a).user && y.e.a.indexOf('.') < 0))),
  });

  // SET without RESET: the bit stays ON for ever
  D.add('bad_latch_not_cleared', {
    msg: { en: 'A bit is SET but never RESET. After the first bad bottle it stays ON, so EVERY bottle after it is pushed off, good ones too. RESET the bit after the pusher has pushed the bad bottle.', ar: plain('في بت بيتعمله {{SET}} وما بيتعمله {{RESET}} أبدًا. بعد أول قارورة سيئة بيضل شغّال، فكل قارورة بعدها بتنزاح حتى السليمة. اعمل {{RESET}} للبت بعد ما الدافع يزيح القارورة السيئة.') },
    test: (ctx) => ctx.ofType('SET').some((x) => !ctx.ofType('RST').some((y) => y.e.a === x.e.a)),
  });
})();
