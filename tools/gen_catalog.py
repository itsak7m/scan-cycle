#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build docs/catalog.html — the complete game catalog in Jordanian Arabic (RTL, searchable, printable).

  python tools/gen_catalog.py

Hand-written explanations live in tools/catalog_content.py; everything else (I/O list, instruction unlock levels, work orders,
test lists, datasheets, new terms, glossary) is generated from src/core/iolist.js, src/ui/symbols.js and levels/*.json,
so the catalog never drifts from the game.
"""
import glob
import html
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import catalog_content as C  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def esc(s):
    return html.escape(str(s), quote=True)


def bdi(s):
    """Arabic text with {{English term}} markers -> escaped HTML with <bdi dir=ltr>."""
    return re.sub(r"\{\{(.+?)\}\}", lambda m: f'<bdi dir="ltr">{m.group(1)}</bdi>', esc(s))


# ---------------------------------------------------------------- data
def load_levels():
    out = []
    for p in sorted(glob.glob(os.path.join(ROOT, "levels", "L*.json"))):
        with open(p, encoding="utf-8") as f:
            out.append(json.load(f))
    out.sort(key=lambda L: L["order"])
    return out


def load_io():
    src = read("src/core/iolist.js")
    rows = re.findall(r"T\('([^']+)', '([^']+)', '([^']+)', '([^']+)', (?:'([^']*)'|null), '([^']*)', '([^']*)', '([^']*)'(?:, (\d))?\)", src)
    return [dict(name=r[0], addr=r[1], type=r[2], src=r[3], wiring=r[4], role=r[5], en=r[6], ar=r[7]) for r in rows]


def codesys(addr):
    m = re.match(r"^([IQM])(\d+)\.(\d)$", addr)
    if m:
        return f"%{m.group(1)}X{m.group(2)}.{m.group(3)}"
    m = re.match(r"^(IW|QW|MW)(\d+)$", addr)
    return f"%{m.group(1)}{m.group(2)}" if m else addr


def load_instr_meta():
    src = read("src/ui/symbols.js")
    rows = re.findall(r"\{ t: '(\w+)', group: '(\w+)', key: '([^']*)', en: '([^']*)', ar: '([^']*)'", src)
    return {r[0]: dict(group=r[1], key=r[2], en=r[3], ar=r[4]) for r in rows}


# ---------------------------------------------------------------- timing diagrams (inline SVG)
def timing_svg(title, signals, notes, slot=34):
    label_w, row_h = 70, 28
    n = max(len(w) for _, w in signals)
    width = label_w + n * slot + 10
    height = len(signals) * row_h + 26
    s = [f'<svg class="timing" dir="ltr" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-label="{esc(title)}">']
    for i, (name, wave) in enumerate(signals):
        y0 = i * row_h + 6
        hi, lo = y0 + 4, y0 + 18
        s.append(f'<text class="tl" x="2" y="{y0 + 16}">{esc(name)}</text>')
        d, prev = "", None
        for k, ch in enumerate(wave):
            v = 1 if ch == "1" else 0
            x = label_w + k * slot
            y = hi if v else lo
            if prev is None:
                d += f"M{x} {y}"
            elif v != prev:
                d += f"L{x} {hi if prev else lo}L{x} {y}"
            d += f"L{x + slot} {y}"
            prev = v
        s.append(f'<path class="tw" d="{d}" fill="none"/>')
    ay = len(signals) * row_h + 14
    for k in range(n + 1):
        x = label_w + k * slot
        s.append(f'<path class="tg" d="M{x} 2V{ay - 10}"/><text class="tv" x="{x}" y="{ay + 4}" text-anchor="middle">{k}</text>')
    s.append("</svg>")
    return f'<figure class="fig"><figcaption><b>{esc(title)}</b></figcaption>' + "".join(s) + f'<p class="small">{notes}</p></figure>'


TIMINGS = {
    "{TIMING_TON}": timing_svg("TON — PT = 3 وحدات", [("IN", "0011111000"), ("Q", "0000011000")], "الـ Q بيشتغل بعد <b>3 وحدات</b> من وقت ما IN صار 1، وبينطفي فورًا لما IN ينطفي. (كل رقم تحت = وحدة زمن، مثلًا ثانية.)"),
    "{TIMING_TOF}": timing_svg("TOF — PT = 3 وحدات", [("IN", "0011100000"), ("Q", "0011111100")], "الـ Q بيشتغل <b>مع</b> IN مباشرة، وبعد ما IN ينطفي بيضل شغّال 3 وحدات."),
    "{TIMING_TP}": timing_svg("TP — PT = 3 وحدات", [("IN", "0011111101"), ("Q", "0011100011")], "نبضة بمدة <b>3 بالضبط</b> من أول حافة صاعدة، حتى لو IN ضل مضغوط. حافة جديدة بعد النبضة بتبدأ نبضة جديدة."),
    "{TIMING_TONR}": timing_svg("TONR — PT = 4 وحدات", [("IN", "0110011100"), ("R", "0000000001"), ("Q", "0000001110")], "الـ IN اشتغل وحدتين ثم انقطع (الوقت انحفظ)، وبعدين اشتغل 2 كمان فوصل 4 ← Q. الـ R بيصفّر."),
}


# ---------------------------------------------------------------- HTML pieces
CSS = """
:root{--bg:#f3f6f6;--card:#fff;--ink:#14262d;--muted:#46595f;--line:#c9d4d6;--accent:#0b6e78;--warn:#b3461e;--ok:#2f6b4c;--note:#e6f1f2;--warnbg:#fbece6;--code:#eef2f2}
@media (prefers-color-scheme:dark){:root{--bg:#0f191d;--card:#16242a;--ink:#e6eef0;--muted:#a2b6bc;--line:#2c4249;--accent:#4cc3cf;--warn:#ff9b73;--ok:#79d3a1;--note:#173238;--warnbg:#3a2218;--code:#1c2d33}}
*{box-sizing:border-box}html{scroll-behavior:smooth}a{color:var(--accent)}
body{margin:0;background:var(--bg);color:var(--ink);font:17px/1.8 system-ui,"Segoe UI","Noto Sans Arabic",Tahoma,sans-serif}
header.top{position:sticky;top:0;z-index:5;background:var(--card);border-bottom:1px solid var(--line);padding:8px 18px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
header.top h1{margin:0;font-size:1.15rem}header.top input{flex:1;min-width:180px;max-width:360px;min-height:44px;padding:0 12px;border:1.5px solid var(--muted);border-radius:8px;background:var(--bg);color:var(--ink);font:inherit}
.layout{display:grid;grid-template-columns:270px 1fr;gap:22px;max-width:1280px;margin:0 auto;padding:18px}
nav#toc{position:sticky;top:76px;align-self:start;max-height:calc(100vh - 92px);overflow:auto;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;font-size:.92rem}
nav#toc a{display:block;color:var(--ink);text-decoration:none;padding:3px 4px;border-radius:5px}nav#toc a:hover{background:var(--note)}nav#toc h4{margin:10px 0 2px;color:var(--muted);font-size:.8rem}
main section.part{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:6px 22px 18px;margin-bottom:22px}
h2{font-size:1.5rem;border-bottom:3px solid var(--accent);padding-bottom:6px;margin-top:20px}h3{font-size:1.2rem;color:var(--accent);margin-top:26px}h4{margin:16px 0 4px}
table{border-collapse:collapse;width:100%;margin:10px 0;font-size:.95rem}th,td{border:1px solid var(--line);padding:6px 10px;text-align:right;vertical-align:top}th{background:var(--note)}
code{background:var(--code);padding:1px 6px;border-radius:4px;font-family:ui-monospace,Consolas,monospace;font-size:.9em;direction:ltr;unicode-bidi:isolate}
kbd{border:1px solid var(--muted);border-radius:4px;padding:0 5px;font-family:ui-monospace,Consolas,monospace;font-size:.85em}
pre{background:var(--code);padding:12px 14px;border-radius:8px;overflow:auto;font-family:ui-monospace,Consolas,monospace;font-size:.88rem;line-height:1.5;direction:ltr;text-align:left}
.note,.warn{border-radius:8px;padding:10px 14px;margin:12px 0}.note{background:var(--note);border-right:5px solid var(--accent)}.warn{background:var(--warnbg);border-right:5px solid var(--warn)}
.small{font-size:.85rem;color:var(--muted)}.badge{display:inline-block;background:var(--accent);color:#fff;border-radius:999px;padding:0 10px;font-size:.8rem;margin-inline-start:6px}
details.level{border:1px solid var(--line);border-radius:10px;margin:14px 0;background:var(--bg)}details.level>summary{cursor:pointer;padding:12px 16px;font-weight:700;font-size:1.1rem;min-height:44px}
details.level .body{padding:2px 18px 16px}
.wo{background:var(--note);border-radius:8px;padding:8px 14px}.wo p{margin:4px 0}.cols{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.fig{margin:12px 0}.fig svg{max-width:100%;height:auto;background:var(--card);border:1px solid var(--line);border-radius:8px}svg.timing,svg.timing text{direction:ltr}
svg.timing .tl{font:600 11px ui-monospace,Consolas,monospace;fill:var(--ink)}svg.timing .tw{stroke:var(--accent);stroke-width:2.6}svg.timing .tg{stroke:var(--line);stroke-dasharray:2 3}svg.timing .tv{font:10px ui-monospace,Consolas,monospace;fill:var(--muted)}
.chips span{display:inline-block;border:1px solid var(--line);border-radius:999px;padding:0 10px;margin:2px;background:var(--card)}
ul.tests{padding-inline-start:1.2em}.hide{display:none}
@media (max-width:900px){.layout{grid-template-columns:1fr}nav#toc{position:static;max-height:none}.cols{grid-template-columns:1fr}}
@media print{header.top,nav#toc{display:none}.layout{display:block}main section.part{break-inside:auto;border:0}details.level{break-inside:avoid}}
"""

SEARCH_JS = """
document.getElementById('q').addEventListener('input', function(){
  var q=this.value.trim().toLowerCase();
  document.querySelectorAll('table.filterable tbody tr').forEach(function(tr){ tr.classList.toggle('hide', q && tr.textContent.toLowerCase().indexOf(q)<0); });
  document.querySelectorAll('details.level').forEach(function(d){ var m = !q || d.textContent.toLowerCase().indexOf(q)>=0; d.classList.toggle('hide', !m); if(q && m) d.open=true; });
});
"""


def main():
    levels = load_levels()
    io = load_io()
    io_by = {t["name"]: t for t in io}
    meta = load_instr_meta()

    # first level that uses each tag / unlocks each instruction
    first_tag, first_instr = {}, {}
    seen_pal = set()
    for L in levels:
        for t in L["tags"]:
            nm = t if isinstance(t, str) else t["name"]
            first_tag.setdefault(nm, L["id"])
        for p in L["palette"]:
            if p not in seen_pal:
                first_instr[p] = L["id"]
                seen_pal.add(p)
    new_pal = {}
    prev = set()
    for L in levels:
        new_pal[L["id"]] = [p for p in L["palette"] if p not in prev]
        prev |= set(L["palette"])

    out = []
    toc = []

    def part(pid, title, body):
        toc.append((pid, title))
        out.append(f'<section class="part" id="{pid}"><h2>{title}</h2>{body}</section>')

    # ---- A: how to read
    part("start", "قبل ما تبدأ: كيف تقرا هالدليل", f"""
<p>هالدليل مكتوب لإنك <b>بسنة ثانية ميكاترونكس</b> وما اشتغلت على PLC من قبل، فما بنفترض إنك تعرف أي شي مسبقًا. كل مصطلح تقني بنكتبه بالإنجليزي (لأنه هيك بتلاقيه بالمصانع وبالبرامج) ومعه شرحه بالعربي.</p>
<table><tr><th>إذا عندك…</th><th>اقرا</th></tr>
<tr><td><b>10 دقايق</b></td><td><a href="#game">اللعبة بالمختصر</a> + <a href="#c2">دورة المسح</a> + <a href="#c4">NO و NC</a></td></tr>
<tr><td><b>ساعة</b></td><td>كل قسم "الأساسيات" (c1–c13) ثم افتح Sandbox وجرّب</td></tr>
<tr><td><b>وقت لكل مستوى</b></td><td>اقرا بطاقة المستوى بقسم <a href="#levels">كتالوج المستويات</a> قبل ما تلعبه (فيها الفكرة وأسئلة تفكير)</td></tr>
<tr><td>تدوّر على معنى كلمة</td><td><a href="#gloss">القاموس</a> (فيه {sum(len(L.get('glossaryDefs', [])) for L in levels)} مصطلح) — وفي مربع البحث فوق</td></tr></table>
<div class="note"><b>قاعدة المشروع:</b> هالدليل بيشرح <b>المفاهيم</b> ويسألك أسئلة، بس <b>ما بيكتبلك الحل</b> (الـ rungs). الهدف إنك إنت اللي تحلّ وتفهم، واللعبة بتفحص منطقك إنت. الأمثلة بالدليل بأجهزة مختلفة (مضخة، فرن...) مش أجهزة المستويات.</div>""")

    # ---- B: the game
    steps = "".join(f"<li><b>{t}</b><br>{d}</li>" for t, d in C.GAME_STEPS)
    learn = "".join(f"<li>{x}</li>" for x in C.GAME_LEARN)
    screen = "".join(f"<tr><td><b>{a}</b></td><td>{b}</td></tr>" for a, b in C.SCREEN_PARTS)
    part("game", "اللعبة بالمختصر", f"""{C.GAME_INTRO}
<h3>شو رح تتعلم</h3><ul>{learn}</ul>
<h3>كيف بتلعب مستوى (7 خطوات)</h3><ol>{steps}</ol>
<h3>أجزاء الشاشة</h3><table><tr><th>الجزء</th><th>شو هو</th></tr>{screen}</table>
<h3>النجوم والتقدّم</h3>
<p>★ = كل الفحوصات (ظاهرة ومخفية) نجحت. ★★ = ★ + بدون تحذيرات + بدون التلميح 3. ★★★ = ★★ + شرحت منطقك بالإنجليزي. <b>النجاح بيحتاج ★ بس</b>؛ الباقي للتحدي. ما في ضغط وقت، ما في "ستريك"، ما في شي بينقص لو غبت: الخريطة بتتذكّر وين وصلت. الـ <b>Sandbox</b> (∞) فيه كل التعليمات والخط كامل بدون أمر شغل.</p>""")

    # ---- C: primer
    for pid, title, body in C.PRIMER:
        for k, v in TIMINGS.items():
            body = body.replace(k, v)
        body = body.replace("cuoil", "coil")
        toc.append((pid, f"أساسيات: {title}"))
        out.append(f'<section class="part" id="{pid}"><h2>{title}</h2>{body}</section>')

    # ---- D: the line
    svg = read("docs/line.svg")
    svg = re.sub(r"<\?xml.*?\?>", "", svg)
    st_rows = "".join(f"<tr><td><b>{a}</b></td><td>{b}</td><td dir='ltr'>{c}</td><td dir='ltr'>{d}</td><td>{e}</td></tr>" for a, b, c, d, e in C.STATIONS)
    part("line", "خط التعبئة: المحطات والأجهزة", f"""{C.LINE_INTRO}
<figure class="fig">{svg}<figcaption class="small">رسمة المحطات والحساسات (الأحمر: حساسات، الأخضر: مشغّلات).</figcaption></figure>
{C.SAFETY_BOX}
<table class="filterable"><thead><tr><th>المحطة</th><th>شو بتعمل</th><th>مداخل (حساسات)</th><th>مخارج</th><th>أول ظهور</th></tr></thead><tbody>{st_rows}</tbody></table>""")

    # ---- E: I/O catalog
    def io_row(t):
        nm = t["name"]
        wiring = f" · NC" if t["wiring"] == "NC" else ""
        note = C.TAG_NOTES.get(nm, "")
        first = first_tag.get(nm, "Sandbox")
        return (f"<tr><td dir='ltr'><code>{esc(nm)}</code></td><td dir='ltr'><code>{esc(t['addr'])}</code><br><span class='small'>{esc(codesys(t['addr']))}</span></td>"
                f"<td>{esc(t['type'])}{wiring}</td><td>{esc(t['ar'])}<br><span class='small' dir='ltr'>{esc(t['en'])}</span></td><td>{note}</td><td>{first}</td></tr>")

    groups = ""
    for gname, names in C.TAG_GROUPS:
        rows = "".join(io_row(io_by[n]) for n in names if n in io_by)
        groups += f"<h3>{gname}</h3><table class='filterable'><thead><tr><th>Tag</th><th>العنوان (Siemens / CODESYS)</th><th>النوع</th><th>الوصف</th><th>ملاحظة</th><th>أول مستوى</th></tr></thead><tbody>{rows}</tbody></table>"
    part("io", f"كتالوج المداخل والمخارج (I/O) — {len(io)} نقطة", f"""
<p>هاي كل <b>النقاط</b> اللي بتربط الـ PLC بالخط. كل مستوى بيعرض جزء منها بس. العناوين <b>ثابتة</b> عبر المستويات. (عنوان بالشكل <code>I0.5</code>: <b>I</b> = مدخل، <b>0</b> = رقم البايت، <b>5</b> = رقم البت.)</p>
<div class="note"><b>تذكير:</b> أي مدخل مكتوب عنده "NC" بالنوع (مثل Stop_PB) بيعطي <b>1 وهو سليم</b>.</div>{groups}
<p class="small">بالإضافة للأسماء اللي فوق، بتنشئ إنت بتات ذاكرة (<code>M0.0…</code>) وأرقام (<code>MW10…</code>) بأسماء من اختيارك، وبعض المستويات بتقدّم أسماء جاهزة مثل <code>Step</code> و<code>Track</code> و<code>Filled</code>.</p>""")

    # ---- F: instruction catalog
    grp_titles = {"contacts": "شروط (Contacts) — بتحكم إذا الـ power يكمل", "outputs": "مخارج وحساب", "blocks": "مؤقتات وعدّادات (Blocks)"}
    inst_html = ""
    for g in ("contacts", "outputs", "blocks"):
        rows = ""
        for t, m in meta.items():
            if m["group"] != g:
                continue
            sym, what, use, pit = C.INSTR.get(t, ("", "", "", ""))
            rows += (f"<tr><td><b dir='ltr'>{esc(t)}</b><br><span class='small'>{bdi(m['ar'])}</span></td><td dir='ltr'><code>{esc(sym)}</code></td>"
                     f"<td>{what}</td><td>{use}</td><td>{pit}</td><td>{first_instr.get(t, 'Sandbox')}</td></tr>")
        inst_html += f"<h3>{grp_titles[g]}</h3><table class='filterable'><thead><tr><th>التعليمة</th><th>الرمز</th><th>شو بتعمل</th><th>مثال استخدام</th><th>انتبه</th><th>بتنفتح بـ</th></tr></thead><tbody>{rows}</tbody></table>"
    b = C.INSTR["BRANCH"]
    inst_html += f"<h3>الفروع المتوازية</h3><p><b>Branch</b> ({b[0]}): {b[1]} مثال: {b[2]} انتبه: {b[3]} بتنفتح بـ <b>{first_instr.get('BRANCH', 'L02')}</b>.</p>"
    inst_html += "<div class='note'><b>اختصارات الكيبورد بالمحرر:</b> الأسهم للتنقل · <kbd>Enter</kbd>/<kbd>F2</kbd> تعديل · <kbd>N</kbd> NO · <kbd>C</kbd> NC · <kbd>O</kbd> coil · <kbd>S</kbd> set · <kbd>R</kbd> reset · <kbd>P</kbd> edge · <kbd>T</kbd> مؤقت · <kbd>U</kbd> عدّاد · <kbd>=</kbd> مقارنة · <kbd>M</kbd> move · <kbd>B</kbd> فرع · <kbd>Delete</kbd> مسح · <kbd>Ctrl+Z</kbd>/<kbd>Ctrl+Y</kbd>.</div>"
    part("instr", f"كتالوج التعليمات ({len(meta)} تعليمة)", inst_html)

    # ---- G: levels
    cards = ""
    for L in levels:
        lid = L["id"]
        T = C.LEVELS[lid]
        tag_rows = ""
        for t in L["tags"]:
            nm = t if isinstance(t, str) else t["name"]
            if isinstance(t, str) and nm in io_by:
                d = io_by[nm]
                desc, addr = d["ar"], d["addr"]
            else:
                tt = t if isinstance(t, dict) else {}
                addr = tt.get("addr", "")
                desc = (tt.get("desc") or {}).get("ar") or "اسم يعرّفه المستوى (ذاكرة)"
            tag_rows += f"<tr><td dir='ltr'><code>{esc(nm)}</code></td><td dir='ltr'><code>{esc(addr)}</code></td><td>{esc(desc)}</td></tr>"
        tests = "".join(f"<li>{esc(s['title']['en'])} — {bdi(s['title']['ar'])}</li>" for s in L["scenarios"])
        sheets = "".join(f"<li>{esc(d['title']['en'])} — {esc(d['title']['ar'])}</li>" for d in L["datasheets"])
        terms = "".join(f"<span><b dir='ltr'>{esc(d['en'])}</b> = {bdi(d['ar'])}</span>" for d in L.get("glossaryDefs", []))
        newp = ", ".join(new_pal[lid]) or "لا شي جديد (استخدم اللي فتحته قبل)"
        stations = ", ".join(L["plant"].get("stations", []))
        qs = "".join(f"<li>{q}</li>" for q in T["questions"])
        traps = "".join(f"<li>{x}</li>" for x in T["traps"])
        ex = L["example"]["mode"]
        extype = {"full": "فيه مثال محلول كامل (لمهمة مشابهة بأجهزة ثانية) بورقة البيانات.", "completion": "تمرين إكمال: المحرر بيبدأ ببرنامج ناقص وإنت بتكمّله.", "none": "ما في مثال محلول؛ إنت بتبني من الصفر."}[ex]
        cards += f"""
<details class="level" id="{lid}" open><summary>{lid} · {esc(L['title']['en'])} — {bdi(L['title']['ar'])} <span class="badge">{esc(L['concept'])}</span></summary>
<div class="body">
<h4>الفكرة</h4>{T['story']}
<h4>المطلوب منك (Work order)</h4>
<div class="wo cols"><div lang="en" dir="ltr"><p>{esc(L['workOrder']['en'])}</p></div><div lang="ar" dir="rtl"><p>{bdi(L['workOrder']['ar'])}</p></div></div>
<h4>أسئلة فكّر فيها قبل ما تبدأ</h4><ul>{qs}</ul>
<h4>تعليمات جديدة بهالمستوى</h4><p dir="ltr" style="text-align:right"><code>{esc(newp)}</code></p>
<h4>الأجهزة اللي بتتعامل معها</h4><table><thead><tr><th>Tag</th><th>العنوان</th><th>شو هو</th></tr></thead><tbody>{tag_rows}</tbody></table>
<p class="small">محطات الخط الظاهرة: <code>{esc(stations)}</code></p>
<h4>كيف بيفحصوك (الفحوصات الظاهرة)</h4><ul class="tests">{tests}</ul><p class="small">+ {L['hidden']['count']} فحوصات مخفية بتوقيتات مختلفة.</p>
<h4>بطاقات ورقة البيانات</h4><ul class="tests">{sheets}</ul><p class="small">{extype}</p>
<h4>غلطات شائعة (انتبه منها)</h4><ul>{traps}</ul>
<h4>مصطلحات جديدة</h4><div class="chips">{terms}</div>
<div class="note"><b>نصيحة:</b> {T['tip']}</div>
</div></details>"""
    part("levels", f"كتالوج المستويات ({len(levels)} مستوى)", "<p>كل بطاقة بتشرح المستوى من غير ما تعطيك الحل. افتحها قبل ما تلعب، وارجع لها لما تعلق (وأسئلة التفكير هي المفتاح).</p>" + cards)

    # ---- H: glossary
    g_rows = ""
    seen = set()
    for L in levels:
        for d in L.get("glossaryDefs", []):
            if d["id"] in seen:
                continue
            seen.add(d["id"])
            g_rows += (f"<tr><td dir='ltr'><b>{esc(d['en'])}</b></td><td>{bdi(d['ar'])}</td><td dir='ltr' class='small'>{esc(d['ex']['en'])}</td><td>{bdi(d['ex'].get('ar', ''))}</td><td>{L['id']}</td></tr>")
    part("gloss", f"القاموس: {len(seen)} مصطلح إنجليزي/عربي", f"<p>بالترتيب اللي بتظهر فيه بالمستويات. اكتب بمربع البحث فوق لتفلتر.</p><table class='filterable'><thead><tr><th>المصطلح</th><th>بالعربي</th><th>مثال (EN)</th><th>مثال (AR)</th><th>مستوى</th></tr></thead><tbody>{g_rows}</tbody></table>")

    # ---- I: FAQ
    faq = "".join(f"<details class='level'><summary>{q}</summary><div class='body'><p>{a}</p></div></details>" for q, a in C.FAQ)
    part("faq", "أسئلة شائعة وحلّ المشاكل", faq)

    # ---- J: files
    part("files", "وين الأشياء بالمشروع", """
<table><tr><th>الملف</th><th>شو فيه</th></tr>
<tr><td dir="ltr"><code>index.html</code></td><td>اللعبة كلها بملف واحد. افتحه بالضغط المزدوج.</td></tr>
<tr><td dir="ltr"><code>levels/L01.json … L14.json</code></td><td>المستويات (أمر الشغل، الفحوصات، التلميحات، المصطلحات).</td></tr>
<tr><td dir="ltr"><code>src/core/</code></td><td>المحرّك: دورة المسح، المؤقتات، الـ plant (الخط الافتراضي)، منفّذ الفحوصات.</td></tr>
<tr><td dir="ltr"><code>src/ui/</code></td><td>الواجهة: المحرر، الرسم، التقرير، القاموس.</td></tr>
<tr><td dir="ltr"><code>tools/build.py</code></td><td>بيجمّع كل شي بـ index.html.</td></tr>
<tr><td dir="ltr"><code>tools/selftest.py</code></td><td>بيشغّل كل الفحوصات الآلية (محرك + مستويات + حلول مخفية).</td></tr>
<tr><td dir="ltr"><code>docs/level-format.md</code></td><td>كيف تكتب مستوى جديد.</td></tr>
<tr><td dir="ltr"><code>docs/glossary.md</code></td><td>القاموس كملف.</td></tr>
<tr><td dir="ltr"><code>docs/catalog.html</code></td><td>هالدليل (بيتولّد من <code>tools/gen_catalog.py</code>).</td></tr></table>
<div class="warn">لا تفتح <code>levels/solutions/</code> وإنت بتلعب: فيها الحلول المخفية اللي بتُستخدم بالفحص الآلي بس.</div>""")

    toc_html = "<h4>الأقسام</h4>" + "".join(f'<a href="#{pid}">{esc(re.sub("<[^>]+>", "", title))}</a>' for pid, title in toc if not pid.startswith("c"))
    toc_html += "<h4>الأساسيات</h4>" + "".join(f'<a href="#{pid}">{esc(re.sub("<[^>]+>", "", title).replace("أساسيات: ", ""))}</a>' for pid, title in toc if pid.startswith("c"))
    toc_html += "<h4>المستويات</h4>" + "".join(f'<a href="#{L["id"]}">{L["id"]} · {esc(L["title"]["en"])}</a>' for L in levels)

    doc = f"""<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>دليل Scan Cycle الكامل</title><style>{CSS}</style></head><body>
<header class="top"><h1>📖 دليل Scan Cycle الكامل</h1><input id="q" type="search" placeholder="ابحث: مصطلح، tag، تعليمة، مستوى…" aria-label="بحث"><a href="../index.html" style="color:var(--accent)">← للعبة</a></header>
<div class="layout"><nav id="toc" aria-label="فهرس">{toc_html}</nav><main>{''.join(out)}</main></div>
<script>{SEARCH_JS}</script></body></html>"""
    with open(os.path.join(ROOT, "docs", "catalog.html"), "w", encoding="utf-8", newline="\n") as f:
        f.write(doc)
    print(f"docs/catalog.html  {len(doc.encode('utf-8')) / 1024:.0f} KB  ({len(levels)} levels, {len(io)} tags, {len(meta)} instructions, {len(seen)} terms)")


if __name__ == "__main__":
    main()
