# PLC glossary — English / Arabic

Generated from the level files by `python tools/build.py`. Every term is real IDE / FAT vocabulary, introduced in the level shown.

24 terms.

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
