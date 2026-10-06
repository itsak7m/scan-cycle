# PLC glossary — English / Arabic

Generated from the level files by `python tools/build.py`. Every term is real IDE / FAT vocabulary, introduced in the level shown.

117 terms.

| Term | العربية | Example | Level |
|---|---|---|---|
| **PLC** | المتحكم المنطقي القابل للبرمجة | The PLC reads the buttons and switches the motor.<br>الـ PLC بيقرا الأزرار وبيشغّل المحرك. | L01 |
| **input** | مدخل | Start_PB is an input.<br>Start_PB مدخل. | L01 |
| **output** | مخرج | Conveyor_Motor is an output.<br>Conveyor_Motor مخرج. | L01 |
| **rung** | درجة (سطر منطق) | One rung is one line of ladder logic.<br>الـ rung الواحد هو سطر منطق واحد. | L01 |
| **contact** | ملامس | A contact reads the bit of an input.<br>الـ contact بيقرا بت المدخل. | L01 |
| **coil** | ملف (مخرج المنطق) | The coil writes the power into the output bit.<br>الـ coil بيكتب الـ power بالبت تبع المخرج. | L01 |
| **normally open** | مفتوح عادةً | A normally open button gives 0 until you press it.<br>الزر المفتوح عادةً بيعطي 0 لحد ما تضغطه. | L01 |
| **scan cycle** | دورة المسح | The PLC repeats the scan cycle every 10 ms.<br>الـ PLC بيعيد دورة المسح كل 10 ms. | L01 |
| **normally closed (NC)** | مغلق عادةً | A normally closed Stop button gives 1 until you press it.<br>زر Stop المغلق عادةً بيعطي 1 لحد ما تضغطه. | L02 |
| **seal-in** | تثبيت ذاتي | A seal-in keeps the motor on after Start is released.<br>الـ seal-in بيخلّي المحرك شغّال بعد ما تفلت Start. | L02 |
| **latch** | قفل (يتذكّر الحالة) | A latch remembers that Start was pressed.<br>الـ latch بيتذكّر إنه Start انضغط. | L02 |
| **holding contact** | ملامس التثبيت | The holding contact reads the motor output itself.<br>holding contact بيقرا مخرج المحرك نفسه. | L02 |
| **fail-safe** | آمن عند الفشل | NC wiring is fail-safe: a fault stops the machine.<br>توصيل NC fail-safe: العطل بيوقف الماكينة. | L02 |
| **wire break** | قطع السلك | A wire break on Stop gives 0, so the motor stops.<br>قطع سلك Stop بيعطي 0 فالمحرك بيوقف. | L02 |
| **momentary** | لحظي | A momentary button is on only while you press it.<br>الزر اللحظي شغّال بس وإنت بتضغطه. | L02 |
| **priority** | أولوية | Stop has priority over Start.<br>Stop إله أولوية على Start. | L02 |
| **interlock** | قفل أمني (تعشيق) | The door interlock stops the line when the door opens.<br>الـ interlock تبع الباب بيوقف الخط لما الباب يفتح. | L03 |
| **emergency stop (E-stop)** | إيقاف الطوارئ | Press the E-stop and everything stops.<br>اضغط E-stop وكل شي بيوقف. | L03 |
| **guard door** | باب الحماية | The guard door must be closed to run.<br>باب الحماية لازم يكون مسكّر عشان يشتغل. | L03 |
| **safety relay** | رلاي السلامة | The safety relay cuts the motor power.<br>رلاي السلامة بيقطع كهربا المحرك. | L03 |
| **reset** | إعادة ضبط | The operator presses Reset after a stop.<br>المشغّل بيضغط Reset بعد الإيقاف. | L03 |
| **permissive** | شرط سماح | A permissive is a condition that must be true to run.<br>permissive هو شرط لازم يتحقق عشان يشتغل. | L03 |
| **auto-restart** | إعادة التشغيل التلقائي | Auto-restart after an E-stop is dangerous.<br>auto-restart بعد طوارئ خطير. | L03 |
| **hardwired** | موصول بالأسلاك مباشرة | The safety circuit is hardwired, not in the PLC.<br>دارة السلامة hardwired، مش جوّا الـ PLC. | L03 |
| **photoelectric sensor (photo-eye)** | حساس ضوئي (عين ضوئية) | PE_Fill is a photoelectric sensor at the filler.<br>PE_Fill حساس ضوئي عند الحشّاء. | L04 |
| **beam** | شعاع الضوء | A bottle breaks the beam, so PE_Fill turns ON.<br>القنينة بتقطع الشعاع، فـ PE_Fill بيشتغل. | L04 |
| **present** | موجود | A bottle is present when PE_Fill is 1.<br>القنينة موجودة لما PE_Fill = 1. | L04 |
| **index** | تقديم خطوة بخطوة | The line indexes one bottle at a time to the filler.<br>الخط بيقدّم قنينة وحدة كل مرة للحشّاء. | L04 |
| **release** | تحرير | The operator presses Release to free the bottle.<br>المشغّل بيضغط Release عشان يحرّر القنينة. | L04 |
| **position** | موضع | The bottle must stop at the filling position.<br>القنينة لازم توقف عند موضع التعبئة. | L04 |
| **debounce** | تثبيت الإشارة (منع الرجفة) | A debounce timer waits until the signal is stable.<br>مؤقّت الـ debounce بيستنى لحد ما الإشارة تثبت. | L04 |
| **power-up** | لحظة التشغيل الأولى | At power-up a bottle can already be in the beam.<br>لحظة power-up ممكن تكون قنينة أصلًا بالشعاع. | L04 |
| **timer** | مؤقّت | The timer counts up to 3 seconds.<br>المؤقّت بيعدّ لحد 3 ثواني. | L05 |
| **on-delay (TON)** | تأخير التشغيل | An on-delay timer turns its output ON after a delay.<br>مؤقّت on-delay بيشغّل مخرجه بعد تأخير. | L05 |
| **preset time (PT)** | الزمن المحدد | The preset time is T#3s.<br>الزمن المحدد هو T#3s. | L05 |
| **elapsed time (ET)** | الزمن المنقضي | The elapsed time grows while IN is ON.<br>الزمن المنقضي بيزيد طول ما IN شغّال. | L05 |
| **instance** | نسخة البلوك | Every timer needs its own instance, like DB_Fill.<br>كل مؤقّت بده instance خاص فيه، مثل DB_Fill. | L05 |
| **time literal** | صيغة الوقت | T#3s is a time literal for 3 seconds.<br>T#3s صيغة وقت معناها 3 ثواني. | L05 |
| **overflow** | طفحان | Too much fill time causes an overflow and a spill.<br>وقت تعبئة زيادة بيسبّب overflow وانسكاب. | L05 |
| **underfill** | نقص التعبئة | A short fill time gives an underfill.<br>وقت تعبئة قصير بيعطي underfill. | L05 |
| **pneumatic cylinder** | أسطوانة هوائية | The stopper is a pneumatic cylinder.<br>الـ stopper أسطوانة هوائية. | L06 |
| **solenoid valve** | صمام كهرومغناطيسي (سولينويد) | The PLC switches the solenoid valve to send air to the cylinder.<br>الـ PLC بيشغّل الـ solenoid valve عشان يبعت هوا للأسطوانة. | L06 |
| **reed switch** | مفتاح ريد (حساس مغناطيسي) | A reed switch tells the PLC the cylinder is extended.<br>الـ reed switch بيخبّر الـ PLC إنه الأسطوانة ممدودة. | L06 |
| **extend** | مدّ | Extend the stopper before the bottle arrives.<br>مدّ الـ stopper قبل ما توصل القنينة. | L06 |
| **retract** | سحب | Retract the stopper to let the bottle go.<br>اسحب الـ stopper عشان تمشي القنينة. | L06 |
| **feedback** | تغذية راجعة | The reed switch is feedback: it confirms the movement.<br>الـ reed switch تغذية راجعة: بتأكّد الحركة. | L06 |
| **travel time** | زمن الحركة | The travel time of the stopper is about 0.4 seconds.<br>زمن حركة الـ stopper حوالي 0.4 ثانية. | L06 |
| **pressure switch** | مفتاح الضغط | The pressure switch gives Air_OK = 0 when the air is lost.<br>مفتاح الضغط بيعطي Air_OK = 0 لما يروح الهوا. | L06 |
| **counter** | عدّاد | The counter counts the bottles.<br>الـ counter بيعدّ القوارير. | L07 |
| **count up (CTU)** | عدّ تصاعدي | A CTU counts up: 1, 2, 3 ...<br>الـ CTU بيعدّ تصاعدي: 1، 2، 3 ... | L07 |
| **preset value (PV)** | القيمة المحددة | The preset value is 12 bottles.<br>الـ PV هو 12 قارورة. | L07 |
| **current value (CV)** | القيمة الحالية | The current value is 7: seven bottles have passed.<br>الـ CV هو 7: مرّت سبع قوارير. | L07 |
| **batch** | دفعة | One batch is 12 bottles.<br>الدفعة الوحدة هي 12 قارورة. | L07 |
| **rising edge** | حافة صاعدة | A rising edge is the moment a signal goes from 0 to 1.<br>الـ rising edge هي اللحظة اللي الإشارة بتروح فيها من 0 إلى 1. | L07 |
| **stack light** | عمود الإشارة | The stack light shows the state of the machine.<br>الـ stack light بيعرض حالة الماكينة. | L07 |
| **count reset (R)** | تصفير العدّ | A count reset sets the count back to 0.<br>الـ count reset بيرجّع العدّ إلى 0. | L07 |
| **reject** | رفض | The line rejects the underfilled bottle.<br>الخط بيرفض القارورة الناقصة. | L08 |
| **pusher** | دافع | The pusher moves the bottle off the belt.<br>الدافع بيزيح القارورة عن السير. | L08 |
| **one-shot** | نبضة وحدة | A one-shot gives ONE pulse for each edge.<br>الـ one-shot بيعطي نبضة وحدة لكل edge. | L08 |
| **SET coil (S)** | ملف SET | A SET coil turns a bit ON and keeps it ON.<br>ملف الـ SET بيشغّل البت وبيخلّيه شغّال. | L08 |
| **RESET coil (R)** | ملف RESET | A RESET coil turns the bit OFF again.<br>ملف الـ RESET بيطفي البت من جديد. | L08 |
| **pulse timer (TP)** | مؤقّت النبضة | A pulse timer gives an output of exactly 500 ms.<br>مؤقّت النبضة بيعطي مخرج مدته 500 ms بالضبط. | L08 |
| **inspection** | فحص | The level sensor is an inspection of every bottle.<br>حساس المستوى هو فحص لكل قارورة. | L08 |
| **bad bottle** | قارورة سيئة | A bad bottle has too little syrup.<br>القارورة السيئة فيها شراب قليل. | L08 |
| **sequence** | تتابع | The filler runs a sequence of four steps.<br>الحشّاء بتشغّل تتابع من أربع خطوات. | L09 |
| **step number** | رقم الخطوة | The step number tells what the machine does now.<br>رقم الخطوة بيقول شو الماكينة بتعمل هلق. | L09 |
| **state machine** | آلة حالات | A state machine is in one state at a time.<br>آلة الحالات بتكون بحالة وحدة بالمرة. | L09 |
| **compare (CMP)** | مقارنة | A compare passes power when the test is true.<br>المقارنة بتمرّر الـ power لما الفحص يكون صحيح. | L09 |
| **MOVE** | نقل قيمة | MOVE writes the number 2 into Step.<br>الـ MOVE بيكتب الرقم 2 بالـ Step. | L09 |
| **integer (Int)** | عدد صحيح | Step is an integer: 0, 1, 2, 3.<br>الـ Step عدد صحيح: 0، 1، 2، 3. | L09 |
| **dispense** | تعبئة (دفع) | The pump dispenses the syrup into the bottle.<br>المضخة بتدفع الشراب جوّا القارورة. | L09 |
| **home position** | وضع البداية | The piston is at home when Pump_Home = 1.<br>المكبس بوضع البداية لما Pump_Home = 1. | L09 |
| **fall-through** | تجاوز خطوة | Fall-through: two steps run in one scan.<br>الـ fall-through: خطوتين بينفّذوا بنفس الـ scan. | L09 |
| **shift register** | مسجّل إزاحة | The shift register moves every mark one place on each pulse.<br>الـ shift register بيحرّك كل علامة مكان واحد عند كل نبضة. | L10 |
| **tracking** | تتبّع | Tracking remembers where each bad bottle is on the belt.<br>الـ tracking بيتذكّر وين كل قنينة سيئة على السير. | L10 |
| **encoder** | مرمّز الحركة (إنكودر) | The encoder gives one pulse for every 30 mm of belt.<br>الـ encoder بيعطي نبضة لكل 30 mm من السير. | L10 |
| **encoder pulse** | نبضة الـ encoder | Shift the word on each encoder pulse, not on each scan.<br>حرّك الكلمة عند كل نبضة encoder، مش عند كل scan. | L10 |
| **pitch** | الخطوة (المسافة بين النبضات) | The encoder pitch is 30 mm.<br>خطوة الـ encoder هي 30 mm. | L10 |
| **bit** | بت | A bit is 0 or 1.<br>الـ bit إما 0 أو 1. | L10 |
| **word** | كلمة (16 بت) | An Int word holds 16 bits.<br>الكلمة Int فيها 16 bit. | L10 |
| **sign bit** | بت الإشارة | Bit 15 is the sign bit: the number is negative when it is 1.<br>البت 15 هو بت الإشارة: الرقم سالب لما يكون 1. | L10 |
| **downstream** | بعد (باتجاه المصبّ) | The reject station is downstream of the cap check.<br>محطة الرفض downstream من فحص الغطاء. | L10 |
| **alarm** | إنذار | A new alarm sounds the horn.<br>الإنذار الجديد بيشغّل البوق. | L11 |
| **acknowledge (Ack)** | إقرار (استلام الإنذار) | The operator presses Ack to say: I saw the alarm.<br>المشغّل بيضغط Ack عشان يقول: شفت الإنذار. | L11 |
| **horn** | البوق | The horn calls the operator.<br>البوق بينادي المشغّل. | L11 |
| **intermittent** | متقطّع | An intermittent alarm comes and goes. It must stay latched.<br>الإنذار المتقطّع بيجي وبيروح. لازم يضل ثابت (latched). | L11 |
| **chattering** | ارتعاش الإشارة | A chattering sensor switches ON and OFF many times a second.<br>الحساس المرتعش بيشتغل وبينطفي كذا مرة بالثانية. | L11 |
| **alarm flood** | طوفان الإنذارات | An alarm flood is too many alarms at once: the operator cannot read them.<br>طوفان الإنذارات هو إنذارات كتير مرة وحدة: المشغّل ما بيقدر يقراهم. | L11 |
| **flasher** | مولّد الوميض | A flasher makes a lamp blink with two timers.<br>مولّد الوميض بيخلّي المصباح يومض بمؤقّتين. | L11 |
| **off-delay** | تأخير الإطفاء | A TOF is an off-delay timer.<br>الـ TOF مؤقّت تأخير إطفاء. | L11 |
| **jam** | انحشار | A jam stops the bottles at the end of the line.<br>الانحشار بيوقف القناني بآخر الخط. | L11 |
| **PackML** | PackML (معيار حالات الآلات) | PackML gives every packaging machine the same state names.<br>الـ PackML بيعطي كل آلات التعبئة نفس أسماء الحالات. | L12 |
| **Execute** | تنفيذ (يشتغل) | In Execute the line makes product.<br>بحالة Execute الخط بينتج. | L12 |
| **Suspended** | معلّق (بانتظار شي خارجي) | Suspended: the line waits for something outside. It clears by itself.<br>Suspended: الخط بيستنى شي من برا. وبيروح لحاله. | L12 |
| **Held** | محتجز (عطل داخلي) | Held: a fault inside the line. The operator must restart it.<br>Held: عطل جوّا الخط. المشغّل لازم يرجّعه يشتغل. | L12 |
| **starved** | جائع (ما في منتج واصل) | Starved means no bottles arrive at the line.<br>Starved معناه ما في قناني بتوصل للخط. | L12 |
| **blocked** | مسدود (المصبّ ما بيستقبل) | Blocked means the next machine does not take the bottles.<br>Blocked معناه الماكينة اللي بعدها ما بتاخد القناني. | L12 |
| **availability** | الجاهزية | Availability is the time the line really runs divided by the total time.<br>الجاهزية هي الوقت اللي الخط بيشتغل فيه فعلًا مقسوم على الوقت الكلي. | L12 |
| **performance** | الأداء | Performance is the real speed divided by the ideal speed.<br>الأداء هو السرعة الحقيقية مقسومة على السرعة المثالية. | L12 |
| **quality** | الجودة | Quality is the good bottles divided by all bottles.<br>الجودة هي القناني السليمة مقسومة على كل القناني. | L12 |
| **OEE** | الفعالية الكلية للمعدات (OEE) | OEE = availability x performance x quality.<br>الـ OEE = الجاهزية × الأداء × الجودة. | L12 |
| **GMP (good manufacturing practice)** | الممارسة الصناعية الجيدة (GMP) | GMP rules say who must check the line.<br>قواعد GMP بتحكي مين لازم يفحص الخط. | L13 |
| **line clearance** | تفريغ وتنظيف الخط | Line clearance: remove old bottles and labels before a new batch.<br>line clearance: شيل القناني والملصقات القديمة قبل دفعة جديدة. | L13 |
| **sign-off** | توقيع اعتماد | Two people give a sign-off before the start.<br>شخصين بيعطوا sign-off قبل التشغيل. | L13 |
| **challenge test** | اختبار التحدّي | The challenge test uses a bottle that must be rejected.<br>challenge test بيستخدم قنينة لازم تنرفض. | L13 |
| **batch record** | سجل الدفعة | The batch record lists the signs, the tests and the count.<br>batch record فيه التواقيع والاختبارات والعدد. | L13 |
| **audit trail** | سجل التدقيق | The audit trail shows who changed a value, and when.<br>audit trail بيبيّن مين غيّر القيمة ومتى. | L13 |
| **setpoint** | قيمة الضبط | The fill time is a setpoint.<br>زمن التعبئة هو setpoint. | L13 |
| **supervisor key** | مفتاح المشرف | Only the supervisor key can change a setpoint.<br>بس supervisor key بيقدر يغيّر setpoint. | L13 |
| **CIP (clean in place)** | التنظيف الموضعي (CIP) | CIP cleans the tank and the pipes without opening them.<br>CIP بينظّف الخزان والأنابيب بدون ما نفتحهم. | L14 |
| **caustic** | قلوي (صودا كاوية) | Hot caustic removes the syrup from the pipes.<br>القلوي الساخن بيشيل الشراب من الأنابيب. | L14 |
| **rinse** | شطف | The final rinse washes the caustic out.<br>الشطف الأخير بيغسل القلوي. | L14 |
| **conductivity** | الموصلية | High conductivity means caustic is still in the water.<br>الموصلية العالية يعني لسا في قلوي بالمي. | L14 |
| **hold** | تثبيت (انتظار) | On hold, the timer waits and keeps its time.<br>أثناء hold المؤقّت بيستنى وبيحتفظ بوقته. | L14 |
| **retentive timer** | مؤقّت يحتفظ بالزمن | A retentive timer keeps its time when IN drops.<br>retentive timer بيحتفظ بوقته لما IN يسقط. | L14 |
| **recipe** | وصفة (تسلسل الخطوات) | The CIP recipe lists the steps and the times.<br>وصفة CIP فيها الخطوات والأوقات. | L14 |
| **phase** | مرحلة | The pre-rinse is the first phase of the recipe.<br>الشطف الأولي هو المرحلة الأولى من الوصفة. | L14 |
