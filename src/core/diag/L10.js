/* L10 diagnostics: tracking missing caps with a shift word */
(function () {
  'use strict';
  const D = globalThis.SC.diag;
  const plain = (s) => s.replace(/\{\{|\}\}/g, '');

  const hasEdge = (ctx, ri) => ctx.rungEls(ri).some((y) => y.e.t === 'POS' || y.e.t === 'NEG');
  const shiftWords = (ctx) => ctx.ofType('SHL').map((x) => x.e.w);

  // timers and no shift register: the bottle is followed by time, not by belt distance
  D.add('time_based_tracking', {
    msg: { en: 'You follow the bad bottle with a timer. A timer only knows the time, not the belt distance: when the belt speed changes, or two bad bottles come close together, the pusher fires at the wrong moment. Count encoder pulses with a shift word instead.', ar: plain('بتتبّع القنينة السيئة بمؤقّت. المؤقّت بيعرف الوقت بس مش مسافة السير: لما سرعة السير بتتغيّر، أو بتيجي قنينتين سيئتين قريبتين، الدافع بيشتغل بوقت غلط. عدّ نبضات {{encoder}} بكلمة إزاحة بدل المؤقّت.') },
    test: (ctx) => ctx.ofType('TON', 'TONR', 'TOF').length > 0 && ctx.ofType('SHL').length === 0,
  });

  // SHL on a rung without an edge contact
  D.add('shift_without_edge', {
    msg: { en: 'SHL runs on EVERY scan while its rung has power, and the encoder pulse stays ON for about 100 ms (10 scans). So the word shifts about 10 places per pulse and the mark runs off the end too early. Put an edge contact (-|P|-) in front of SHL: one pulse = one shift.', ar: plain('الـ SHL بينفّذ بكل {{scan}} طول ما في power بالـ rung، ونبضة الـ {{encoder}} بتضل شغّالة حوالي 100 ms (10 scans). فالكلمة بتتزحزح حوالي 10 أماكن بالنبضة والعلامة بتطلع من الآخر بدري. حط edge contact (-|P|-) قبل SHL: نبضة = إزاحة وحدة.') },
    test: (ctx) => ctx.ofType('SHL').some((x) => !hasEdge(ctx, x.ri)),
  });

  // the missing-cap mark does not depend on PE_Cap: an empty place also has Cap_Present = 0
  D.add('no_bottle_check', {
    msg: { en: 'Cap_Present = 0 does NOT mean "bottle without a cap": an empty place (a gap, or the space between bottles) gives 0 too. Mark a bottle only when PE_Cap sees a bottle AND Cap_Present does not see a cap.', ar: plain('{{Cap_Present}} = 0 ما بتعني "قنينة بدون غطاء": المكان الفاضي (فراغ أو المسافة بين القناني) بيعطي 0 كمان. علّم القنينة بس لما {{PE_Cap}} يشوف قنينة و{{Cap_Present}} ما يشوف غطاء.') },
    test: (ctx) => ctx.usesTag('Cap_Present') && !ctx.usesTag('PE_Cap'),
  });

  // a latched mark (SET) that nothing resets
  D.add('mark_not_cleared', {
    msg: { en: 'The mark bit is SET but nothing resets it. After the first bad bottle it stays 1, so every pulse shifts a 1 into the word and good bottles are pushed off. Reset the mark after it is shifted in (or use a plain coil).', ar: plain('بت العلامة بيتعمله SET وما في شي بيعمله RESET. بعد أول قنينة سيئة بيضل 1، فكل نبضة بتدخّل 1 على الكلمة والقناني السليمة بتنزاح. اعمل RESET للعلامة بعد ما تنزاح داخل الكلمة (أو استخدم coil عادي).') },
    test: (ctx) => ctx.ofType('SET').some((x) => !ctx.ofType('RST').some((y) => y.e.a === x.e.a)) && shiftWords(ctx).length > 0,
  });

  // the pusher is not driven by "sign bit of the shifted word" (Track < 0)
  D.add('reject_position_wrong', {
    msg: { en: 'The pusher does not fire when the mark reaches the LAST bit. The reject eye is 15 pulses after the cap check, so the mark must be at bit 15. Bit 15 is the sign bit: CMP(<, Track, 0) is TRUE exactly when bit 15 = 1.', ar: plain('الدافع ما بيشتغل لما العلامة بتوصل للبت الأخير. عين الرفض بعد 15 نبضة من فحص الغطاء، فالعلامة لازم تكون عند البت 15. البت 15 هو بت الإشارة: CMP(<, Track, 0) صحيح بالضبط لما البت 15 = 1.') },
    test: (ctx) => {
      const words = shiftWords(ctx);
      if (!words.length) return false;
      return !ctx.ofType('CMP').some((x) => words.indexOf(x.e.a) >= 0 && x.e.op === '<' && Number(x.e.b) === 0);
    },
  });

  // an edge contact straight in front of the pusher coil (no TP): a one-scan pulse
  D.add('pusher_pulse_too_short', {
    msg: { en: 'An edge contact in front of the pusher coil gives a pulse of only ONE scan (10 ms). The pusher needs more than 150 ms to move. Let the sign-bit compare drive the pusher (it lasts one encoder pitch), or use a TP pulse timer.', ar: plain('edge contact قبل ملف الدافع بيعطي نبضة {{scan}} واحد بس (10 ms). الدافع بده أكتر من 150 ms ليتحرك. خلّي مقارنة بت الإشارة هي اللي تشغّل الدافع (بتدوم خطوة {{encoder}} كاملة)، أو استخدم مؤقّت نبضة TP.') },
    test: (ctx) => ctx.writers('Reject_Pusher').some((x) => ctx.rungEls(x.ri).some((y) => y.e.t === 'POS' || y.e.t === 'NEG') && !ctx.rungEls(x.ri).some((y) => y.e.t === 'TP')),
  });
})();
