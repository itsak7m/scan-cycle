/* L09 diagnostics: piston filler sequencer with an Int step variable */
(function () {
  'use strict';
  const D = globalThis.SC.diag;
  const plain = (s) => s.replace(/\{\{|\}\}/g, '');

  const STEP = 'Step';
  const moves = (ctx) => ctx.ofType('MOVE').filter((x) => x.e.o === STEP);
  // CMP(==, Step, n) contacts of a rung -> n
  const stepTests = (ctx, ri) => ctx.rungEls(ri).filter((y) => y.e.t === 'CMP' && y.e.op === '==' && y.e.a === STEP).map((y) => y.e.b);
  const failedOn = (ctx, key) => !!(ctx.failure && ctx.failure.expected && Object.prototype.hasOwnProperty.call(ctx.failure.expected, key));

  // nothing puts Step back to 0 outside the normal 3 -> 0 transition
  D.add('step_not_reset_by_estop', {
    msg: { en: 'Nothing puts Step back to 0 when the line stops. After an E-stop the sequence would go on from the old step. Add a rung that is true when the line is not running (NC contact of your run bit, which needs EStop_OK) and does MOVE(0, Step).', ar: plain('ما في شي بيرجّع {{Step}} إلى 0 لما الخط بيوقف. بعد الطوارئ التتابع بيكمل من الخطوة القديمة. زيد rung بيكون صحيح لما الخط مش شغّال (NC contact لبت التشغيل، اللي بده {{EStop_OK}}) وبيعمل MOVE(0, Step).') },
    test: (ctx) => moves(ctx).length > 0
      && !moves(ctx).some((x) => x.e.a === 0 && !ctx.rungEls(x.ri).some((y) => y.e.t === 'CMP'))
      && (!ctx.failure || failedOn(ctx, STEP)),
  });

  // a rung that tests Step = n and moves on with no other condition, placed after the rung that moves to n
  D.add('step_fall_through', {
    msg: { en: 'Fall-through: a rung moves Step to n, and a LATER rung in the same scan tests Step = n and moves on with no other condition. Step n lasts for zero scans, so its outputs never run (here: the stopper never retracts). Every step must wait for its own sensor.', ar: plain('{{fall-through}}: rung بينقل {{Step}} إلى n، و rung بعده بنفس الـ {{scan}} بيفحص Step = n وبيكمل بدون أي شرط ثاني. الخطوة n بتدوم صفر {{scan}}، فمخارجها ما بتشتغل أبدًا (هون: المصدّ ما بيرجع). كل خطوة لازم تستنى حساسها.') },
    test: (ctx) => {
      const mv = moves(ctx);
      return mv.some((later) => {
        const els = ctx.rungEls(later.ri);
        const onlyCmpMove = els.every((y) => y.e.t === 'CMP' || y.e.t === 'MOVE');
        if (!onlyCmpMove) return false;
        const tests = stepTests(ctx, later.ri);
        return mv.some((early) => early.ri < later.ri && tests.indexOf(early.e.a) >= 0);
      });
    },
  });

  // the rung order output - transition - output: two pump outputs overlap for a scan
  D.add('pump_outputs_overlap', {
    msg: { en: 'Pump_Fwd and Pump_Rev were ON in the same scan. A transition rung sits between the two output rungs: in the scan where step 1 ends, the draw output still sees step 1 and the dispense output already sees step 2. Put ALL transition rungs first, then ALL output rungs (or stop each output with its own sensor).', ar: plain('{{Pump_Fwd}} و{{Pump_Rev}} اشتغلوا بنفس الـ {{scan}}. rung انتقال موجود بين rungي المخرجين: بالـ {{scan}} اللي بتنتهي فيه الخطوة 1، مخرج السحب لسا بيشوف الخطوة 1 ومخرج التعبئة صار بيشوف الخطوة 2. حط كل rungs الانتقالات أول، وبعدين كل rungs المخارج (أو وقّف كل مخرج بحساسه).') },
    test: (ctx) => {
      if (ctx.failure && ctx.failure.assertId === 'pumps-exclusive') return true;
      const rev = ctx.writers('Pump_Rev').filter((w) => !ctx.rungEls(w.ri).some((y) => y.e.t === 'NC' && y.e.a === 'Pump_Full'));
      const fwd = ctx.writers('Pump_Fwd');
      const mv = moves(ctx).filter((x) => x.e.a !== 0);
      return rev.some((r) => fwd.some((f) => mv.some((m) => r.ri < m.ri && m.ri < f.ri)));
    },
  });

  // time instead of feedback: Pump_Full / Pump_Home are not both used
  D.add('pump_time_not_feedback', {
    msg: { en: 'The draw or the dispense ends by a TIME, not by the sensor. A slower pump then only draws part of the stroke and the bottle is underfilled. Step 1 must end when Pump_Full = 1, step 2 when Pump_Home = 1.', ar: plain('السحب أو التعبئة بينتهوا بـ وقت مش بالحساس. المضخة الأبطأ بتسحب جزء من الشوط بس والقارورة بتطلع ناقصة. الخطوة 1 لازم تنتهي لما {{Pump_Full}} = 1، والخطوة 2 لما {{Pump_Home}} = 1.') },
    test: (ctx) => ctx.ofType('TON', 'TONR', 'TP').some((x) => ctx.rungEls(x.ri).some((y) => y.e.t === 'CMP' && y.e.a === STEP)) && (!ctx.usesTag('Pump_Full') || !ctx.usesTag('Pump_Home')),
  });

  // step 1 starts without a stable "bottle stopped" check
  D.add('start_on_moving_bottle', {
    msg: { en: 'Step 1 starts as soon as PE_Fill and Stopper_Ext are ON together. After a restart the old bottle is still in the beam while the stopper extends, so both are ON for a moment and a cycle starts with no bottle under the nozzle. A stopped bottle stays in the beam: let a TON of 0.3 s check it before MOVE(1, Step).', ar: plain('الخطوة 1 بتبدأ أول ما {{PE_Fill}} و{{Stopper_Ext}} يكونوا ON مع بعض. بعد إعادة التشغيل القارورة القديمة لسا بالشعاع وقت ما المصدّ بيمدّ، فبيكونوا ON لحظة وبتبدأ دورة بدون قارورة تحت الفوّهة. القارورة الواقفة بتضل بالشعاع: خلّي {{TON}} مدته 0.3 ثانية يفحصها قبل MOVE(1, Step).') },
    test: (ctx) => ctx.ofType('MOVE').some((x) => x.e.o === STEP && x.e.a === 1)
      && !ctx.ofType('TON', 'TONR').some((x) => ctx.rungEls(x.ri).some((y) => y.e.a === 'PE_Fill')),
  });

  // SET on an actuator that no E-stop / run bit can RESET
  D.add('output_latched_estop', {
    msg: { en: 'An output is SET and only a sensor RESETs it. When the E-stop puts Step back to 0, the latched output stays ON in the PLC (the plant cuts the power, but the PLC output must be OFF too). Put your run bit or EStop_OK in the RESET condition, or drive the output with a plain coil from the step number.', ar: plain('في مخرج بيتعمله {{SET}} وبس حساس بيعمله {{RESET}}. لما الطوارئ بترجّع {{Step}} إلى 0، المخرج المثبّت بيضل ON بالـ {{PLC}} (المصنع بيقطع الكهربا، بس مخرج الـ {{PLC}} لازم ينطفي كمان). حط بت التشغيل أو {{EStop_OK}} بشرط الـ {{RESET}}، أو شغّل المخرج بـ coil عادي من رقم الخطوة.') },
    test: (ctx) => ctx.ofType('SET').some((x) => ctx.roleOf(x.e.a) === 'actuator'
      && !ctx.ofType('RST').some((y) => y.e.a === x.e.a && ctx.rungEls(y.ri).some((z) => z.e.t === 'NC' || z.e.a === 'EStop_OK'))),
  });
})();
