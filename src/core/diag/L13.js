/* L13 diagnostics: line clearance (two different sign-offs), reject challenge, key-protected setpoint */
(function () {
  'use strict';
  const D = globalThis.SC.diag;

  // does rung `ri` depend on `tag`? (the tag is a contact in the rung, or a contact whose bit is written by a rung that depends on it)
  function rungUses(ctx, ri, tag, seen) {
    for (const y of ctx.rungEls(ri)) {
      if (y.e.a === tag) return true;
      if (['NO', 'NC', 'POS', 'NEG'].indexOf(y.e.t) >= 0 && y.e.a && !seen.has(y.e.a)) {
        seen.add(y.e.a);
        for (const w of ctx.writers(y.e.a)) if (rungUses(ctx, w.ri, tag, seen)) return true;
      }
    }
    return false;
  }

  // a bit is latched when a SET writes it, or a rung holds it with its own contact
  const isLatched = (ctx, tag) => ctx.writers(tag).some((w) => w.e.t === 'SET' || ctx.rungEls(w.ri).some((y) => y.e.t === 'NO' && y.e.a === tag));

  // probe: press events -> the conveyor must never run
  function neverRuns(ctx, events) {
    const r = ctx.probe({ id: 'probe', seed: 1, durationMs: 8000, plant: { genOn: false }, events, asserts: [{ window: [0, 8000], always: { Conveyor_Motor: false } }] });
    return r.pass;
  }
  const one = (key) => [{ t: 1000, press: key, ms: 400 }, { t: 2000, press: key, ms: 400 }, { t: 3500, press: 'Start_PB', ms: 300 }];
  const together = [{ t: 1000, press: 'Clear_Sign1', ms: 500 }, { t: 1000, press: 'Clear_Sign2', ms: 500 }, { t: 3000, press: 'Start_PB', ms: 300 }];
  const usesSign = (ctx) => ctx.usesTag('Clear_Sign1') || ctx.usesTag('Clear_Sign2');

  D.add('same_key_twice', {
    msg: { en: 'One key was enough to start. Sign 1 and Sign 2 must be two different keys: pressing the same key twice must not count as two sign-offs. Check which key feeds each sign latch.', ar: 'مفتاح واحد كفى للتشغيل. لازم Sign 1 و Sign 2 يكونوا مفتاحين مختلفين: ضغط نفس المفتاح مرتين ما لازم ينحسب توقيعين. افحص أي مفتاح بيغذّي كل latch تبع التوقيع.' },
    test: (ctx) => usesSign(ctx) && (!neverRuns(ctx, one('Clear_Sign1')) || !neverRuns(ctx, one('Clear_Sign2'))),
  });

  D.add('signs_not_separate', {
    msg: { en: 'Both keys pressed at the same moment were accepted. That looks like one person with two keys. Set each sign latch only while the OTHER key is not pressed.', ar: 'المفتاحين انضغطوا بنفس اللحظة وانقبلوا. هاد شكله شخص واحد معه مفتاحين. شغّل كل latch تبع التوقيع بس لما المفتاح التاني مش مضغوط.' },
    test: (ctx) => ctx.usesTag('Clear_Sign1') && ctx.usesTag('Clear_Sign2') && !neverRuns(ctx, together),
  });

  D.add('challenge_ignored', {
    msg: { en: 'Challenge_Bottle is never used. The marked bottle must stop the conveyor, be pushed off by Reject_Pusher and be checked. Bottles are counted only after that.', ar: 'ما استخدمت Challenge_Bottle. القنينة المعلّمة لازم توقّف الناقل وتنرفض بـ Reject_Pusher وتنفحص. والقناني بتنعدّ بس بعد هيك.' },
    test: (ctx) => !ctx.usesTag('Challenge_Bottle'),
  });

  D.add('conveyor_not_stopped', {
    msg: { en: 'The conveyor did not stop for the marked bottle, so the bottle moved on before the pusher could check it. Put an NC contact of Challenge_Bottle in the conveyor rung.', ar: 'الناقل ما وقف للقنينة المعلّمة، فالقنينة كملت قبل ما الدافع يفحصها. حط NC contact تبع Challenge_Bottle برونغ الناقل.' },
    test: (ctx) => !!ctx.failure && ctx.failure.assertId === 'chal-stop',
  });

  D.add('conveyor_no_restart', {
    msg: { en: 'The conveyor did not run again after the challenge passed. The marked bottle clears your Start latch when it stops the conveyor. Use a separate Run latch, and put Challenge_Bottle only in the rung of Conveyor_Motor.', ar: 'الناقل ما رجع اشتغل بعد ما نجح الاختبار. القنينة المعلّمة مسحت الـ latch تبع Start لما وقّفت الناقل. استخدم latch Run منفصل، وحط Challenge_Bottle بس برونغ Conveyor_Motor.' },
    test: (ctx) => !!ctx.failure && ctx.failure.assertId === 'chal-restart',
  });

  D.add('reset_incomplete', {
    msg: { en: 'Reset must start a NEW batch: it clears the lock, the alarm and both sign-offs, so Start needs two new signs. Something is still ON after Reset.', ar: 'الـ Reset لازم يبدأ دفعة جديدة: بيمسح القفل والإنذار والتوقيعين، فـ Start بده توقيعين جداد. في إشي لسا شغّال بعد Reset.' },
    test: (ctx) => !!ctx.failure && (ctx.failure.assertId === 'reset-alarm' || ctx.failure.assertId === 'new-batch-signs'),
  });

  D.add('count_before_challenge', {
    msg: { en: 'The counter counts PE_Exit with no "challenge passed" condition, so bottles that pass before the test are counted. Set a bit when the challenge passes and put it in front of the counter.', ar: 'العدّاد بيعدّ PE_Exit بدون شرط "الاختبار نجح"، فالقناني اللي بتعدّي قبل الاختبار بتنعدّ. فعّل بت لما الاختبار ينجح وحطه قبل العدّاد.' },
    test: (ctx) => ctx.ofType('CTU').some((x) => !ctx.rungEls(x.ri).some((y) => (y.e.t === 'NO' || y.e.t === 'NC') && y.e.a !== 'PE_Exit')),
  });

  D.add('batch_alarm_not_latched', {
    msg: { en: 'The alarm is a plain coil. It goes OFF when the bottle is removed or the timer drops. Latch it with SET and clear it only with Reset.', ar: 'الإنذار ملف عادي. بينطفي لما القنينة تنشال أو المؤقت يرجع صفر. ثبّته بـ SET ولا تمسحه إلا بـ Reset.' },
    test: (ctx) => {
      const w = ctx.writers('Alarm_Lamp');
      if (!w.length) return false;
      if (isLatched(ctx, 'Alarm_Lamp')) return false;
      const feeders = [];
      w.forEach((x) => ctx.rungEls(x.ri).forEach((y) => { if (['NO', 'NC'].indexOf(y.e.t) >= 0 && y.e.a) feeders.push(y.e.a); }));
      return !feeders.some((n) => isLatched(ctx, n));
    },
  });

  D.add('setpoint_without_key', {
    msg: { en: 'The MOVE to Fill_Time_SP does not need Supervisor_Key, so anyone can change the fill time. Put the key contact in series with the request.', ar: 'الـ MOVE على Fill_Time_SP ما بيحتاج Supervisor_Key، فأي شخص بيقدر يغيّر زمن التعبئة. حط contact المفتاح على التوالي مع الطلب.' },
    test: (ctx) => ctx.ofType('MOVE').some((x) => x.e.o === 'Fill_Time_SP' && !rungUses(ctx, x.ri, 'Supervisor_Key', new Set())),
  });

  D.add('setpoint_without_request', {
    msg: { en: 'The MOVE has no SP_Request contact, so it copies SP_Entry all the time and the fill time changes without a request. Put SP_Request in series.', ar: 'الـ MOVE ما فيه contact لـ SP_Request، فبينسخ SP_Entry طول الوقت وزمن التعبئة بيتغيّر بدون طلب. حط SP_Request على التوالي.' },
    test: (ctx) => ctx.ofType('MOVE').some((x) => x.e.o === 'Fill_Time_SP' && !rungUses(ctx, x.ri, 'SP_Request', new Set())),
  });
})();
