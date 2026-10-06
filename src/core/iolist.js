/* Master I/O list for the bottling line (addresses stay stable across levels).
 * src: 'panel' = operator/process input driven by the player or the scenario,
 *      'plant' = sensor computed by the plant model, 'out' = PLC output,
 *      'hw' = hardwired safety layer.
 * def: idle value of a panel input.  wiring/role feed the lint + diagnostics.
 */
(function () {
  'use strict';
  const SC = globalThis.SC;

  const T = (name, addr, type, src, wiring, role, en, ar, def) => ({ name, addr, type, src, wiring, role, desc: { en, ar }, def: def || 0 });

  const IO = [
    // ---- inputs
    T('Start_PB', 'I0.0', 'Bool', 'panel', 'NO', 'start', 'Start push button (momentary)', 'زر تشغيل لحظي'),
    T('Stop_PB', 'I0.1', 'Bool', 'panel', 'NC', 'stop', 'Stop push button (wired normally closed)', 'زر إيقاف موصول NC', 1),
    T('EStop_OK', 'I0.2', 'Bool', 'hw', 'NC', 'estop', 'Safety relay feedback, 1 = healthy', 'تغذية راجعة من رلاي السلامة'),
    T('Door_Closed', 'I0.3', 'Bool', 'hw', 'NC', 'guard', 'Guard door closed = 1', 'باب الحماية مغلق'),
    T('PE_Infeed', 'I0.4', 'Bool', 'plant', 'NO', 'sensor', 'Photo-eye, bottle at infeed', 'عين ضوئية عند المدخل'),
    T('PE_Fill', 'I0.5', 'Bool', 'plant', 'NO', 'sensor', 'Photo-eye, bottle at filler', 'عين ضوئية عند الحشّاء'),
    T('Level_OK', 'I0.6', 'Bool', 'plant', 'NO', 'sensor', 'Through-beam, fill level reached', 'حساس مستوى التعبئة'),
    T('Ack_PB', 'I0.7', 'Bool', 'panel', 'NO', 'ack', 'Alarm acknowledge', 'إقرار الإنذار'),
    T('Reset_PB', 'I1.0', 'Bool', 'panel', 'NO', 'reset', 'Reset after safety stop / batch', 'إعادة ضبط'),
    T('PE_Cap', 'I1.1', 'Bool', 'plant', 'NO', 'sensor', 'Photo-eye at capper', 'عين ضوئية عند الغطّاء'),
    T('PE_Reject', 'I1.2', 'Bool', 'plant', 'NO', 'sensor', 'Photo-eye at reject station', 'عين ضوئية عند الرفض'),
    T('PE_Exit', 'I1.3', 'Bool', 'plant', 'NO', 'sensor', 'Photo-eye at outfeed (counting)', 'عين ضوئية عند المخرج'),
    T('Release_PB', 'I1.4', 'Bool', 'panel', 'NO', 'release', 'Manual release', 'تحرير يدوي'),
    T('PE_Backup', 'I1.5', 'Bool', 'plant', 'NO', 'sensor', 'Downstream back-up (blocked)', 'تراكم المصبّ'),
    T('Cap_Present', 'I1.6', 'Bool', 'plant', 'NO', 'sensor', 'Cap detected after capper', 'غطاء موجود'),
    T('Foil_Present', 'I1.7', 'Bool', 'plant', 'NO', 'sensor', 'Induction foil detected', 'رقاقة الختم موجودة'),
    T('Stopper_Ext', 'I2.0', 'Bool', 'plant', 'NO', 'feedback', 'Stopper cylinder extended (reed switch)', 'المصدّ ممدود'),
    T('Stopper_Ret', 'I2.1', 'Bool', 'plant', 'NO', 'feedback', 'Stopper cylinder retracted (reed switch)', 'المصدّ مسحوب'),
    T('Air_OK', 'I2.2', 'Bool', 'plant', 'NO', 'feedback', 'Air pressure OK (pressure switch)', 'ضغط الهواء سليم'),
    T('Tank_LSL', 'I2.3', 'Bool', 'plant', 'NO', 'alarm', 'Tank low level, 1 = alarm', 'مستوى الخزان منخفض'),
    T('Tank_LSLL', 'I2.4', 'Bool', 'plant', 'NO', 'alarm', 'Tank low-low level, 1 = alarm', 'مستوى الخزان منخفض جدًا'),
    T('Pump_Home', 'I2.5', 'Bool', 'plant', 'NO', 'feedback', 'Piston pump at home (proximity)', 'المضخة في البداية'),
    T('Pump_Full', 'I2.6', 'Bool', 'plant', 'NO', 'feedback', 'Piston pump at full stroke (proximity)', 'المضخة في النهاية'),
    T('Conv_Encoder', 'I2.7', 'Bool', 'plant', 'NO', 'encoder', 'Encoder: one pulse per bottle pitch', 'نبضة لكل خطوة'),
    T('Clear_Sign1', 'I3.0', 'Bool', 'panel', 'NO', 'key', 'Line-clearance sign-off 1', 'توقيع تنظيف الخط ١'),
    T('Clear_Sign2', 'I3.1', 'Bool', 'panel', 'NO', 'key', 'Line-clearance sign-off 2', 'توقيع تنظيف الخط ٢'),
    T('Supervisor_Key', 'I3.2', 'Bool', 'panel', 'NO', 'key', 'Supervisor key for setpoints', 'مفتاح المشرف'),
    T('Challenge_Bottle', 'I3.3', 'Bool', 'plant', 'NO', 'sensor', 'Marked test bottle present at the reject station', 'قارورة اختبار الرفض موجودة'),
    T('CIP_Mode', 'I3.4', 'Bool', 'panel', 'NO', 'process', 'CIP mode selector', 'مفتاح وضع التنظيف CIP'),
    T('CIP_Temp_OK', 'I3.5', 'Bool', 'panel', 'NO', 'process', 'CIP temperature OK', 'حرارة التنظيف سليمة'),
    T('CIP_Cond_OK', 'I3.6', 'Bool', 'panel', 'NO', 'process', 'CIP conductivity OK', 'الموصلية سليمة'),
    T('CIP_Flow_OK', 'I3.7', 'Bool', 'panel', 'NO', 'process', 'CIP flow OK', 'التدفق سليم'),
    T('Mode_Auto', 'I4.0', 'Bool', 'panel', 'NO', 'mode', 'Auto mode selected', 'الوضع الأوتوماتيكي', 1),
    T('SP_Request', 'I4.1', 'Bool', 'panel', 'NO', 'setpoint', 'Operator requests a setpoint change', 'طلب تغيير قيمة ضبط'),
    T('Tank_Level', 'IW64', 'Int', 'plant', 'NO', 'analog', 'Tank level 4–20 mA scaled 0–27648 (display only)', 'مستوى الخزان التناظري'),
    T('SP_Entry', 'IW66', 'Int', 'panel', 'NO', 'setpoint', 'Operator-entered setpoint (ms)', 'القيمة اللي دخّلها المشغّل'),
    // ---- outputs
    T('Conveyor_Motor', 'Q0.0', 'Bool', 'out', null, 'actuator', 'Conveyor contactor', 'محرك الناقل'),
    T('Fill_Valve', 'Q0.1', 'Bool', 'out', null, 'actuator', 'Fill solenoid valve', 'صمام التعبئة'),
    T('Stopper_SOL', 'Q0.2', 'Bool', 'out', null, 'actuator', 'Stopper cylinder solenoid (1 = extend)', 'صمام أسطوانة المصدّ'),
    T('Capper_Run', 'Q0.3', 'Bool', 'out', null, 'actuator', 'Capper (rising edge = one capping stroke)', 'الكابّر'),
    T('Sealer_Enable', 'Q0.4', 'Bool', 'out', null, 'actuator', 'Induction sealer enable', 'تفعيل ختم الحث'),
    T('Labeler_Trig', 'Q0.5', 'Bool', 'out', null, 'actuator', 'Labeler trigger (rising edge)', 'تشغيل الملصق'),
    T('Reject_Pusher', 'Q0.6', 'Bool', 'out', null, 'actuator', 'Reject pusher solenoid', 'دافع الرفض'),
    T('Alarm_Lamp', 'Q0.7', 'Bool', 'out', null, 'signal', 'Alarm lamp', 'مصباح الإنذار'),
    T('Horn', 'Q1.0', 'Bool', 'out', null, 'signal', 'Horn', 'البوق'),
    T('Stack_Green', 'Q1.1', 'Bool', 'out', null, 'signal', 'Stack light green', 'عمود الإشارة أخضر'),
    T('Stack_Amber', 'Q1.2', 'Bool', 'out', null, 'signal', 'Stack light amber', 'عمود الإشارة كهرماني'),
    T('Stack_Red', 'Q1.3', 'Bool', 'out', null, 'signal', 'Stack light red', 'عمود الإشارة أحمر'),
    T('Pump_Fwd', 'Q1.4', 'Bool', 'out', null, 'actuator', 'Piston pump dispense', 'المضخة دفع'),
    T('Pump_Rev', 'Q1.5', 'Bool', 'out', null, 'actuator', 'Piston pump draw', 'المضخة سحب'),
    T('Batch_Lamp', 'Q1.6', 'Bool', 'out', null, 'signal', 'Batch complete lamp', 'مصباح اكتمال الدفعة'),
    T('CIP_Pump', 'Q2.0', 'Bool', 'out', null, 'actuator', 'CIP pump', 'مضخة التنظيف'),
    T('CIP_Caustic_Valve', 'Q2.1', 'Bool', 'out', null, 'actuator', 'CIP caustic valve', 'صمام القلوي'),
    T('CIP_Rinse_Valve', 'Q2.2', 'Bool', 'out', null, 'actuator', 'CIP rinse valve', 'صمام الشطف'),
    T('CIP_Drain_Valve', 'Q2.3', 'Bool', 'out', null, 'actuator', 'CIP drain valve', 'صمام التصريف'),
    T('CIP_Done', 'Q2.4', 'Bool', 'out', null, 'signal', 'CIP done', 'انتهى التنظيف'),
  ];

  const byName = Object.create(null);
  IO.forEach((t) => { byName[t.name] = t; });

  // A level lists tags either as a name (-> master entry) or as a full object (override / new).
  function levelTags(level) {
    const out = [];
    for (const t of level.tags || []) {
      if (typeof t === 'string') {
        if (!byName[t]) throw new Error('unknown master tag ' + t);
        out.push(Object.assign({}, byName[t]));
      } else if (byName[t.name]) out.push(Object.assign({}, byName[t.name], t));
      else out.push(Object.assign({ src: 'mem' }, t));
    }
    return out;
  }

  // merge tag lists by name (later entries override earlier ones)
  function mergeTags() {
    const map = new Map();
    for (const list of arguments) for (const t of list || []) map.set(t.name, Object.assign({}, map.get(t.name) || {}, t));
    return Array.from(map.values());
  }

  SC.mergeTags = mergeTags;
  SC.IO = IO;
  SC.ioByName = byName;
  SC.levelTags = levelTags;
})();
