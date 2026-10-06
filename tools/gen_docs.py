#!/usr/bin/env python3
"""Regenerate the generated parts of the docs:
  * README.md between <!--IO:START--> ... <!--IO:END-->        I/O list (from src/core/iolist.js)
  * README.md between <!--TESTLOG:START--> ... <!--TESTLOG:END--> test scenarios + results (from levels/*.json + the self-test)
  * docs/test-log.md                                           the same test log, with every level
  * docs/glossary.md                                           (written by tools/build.py)

Usage: python tools/gen_docs.py            (runs the self-test to get the results)
"""
import glob
import html
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def read(p):
    with open(os.path.join(ROOT, p), encoding="utf-8") as f:
        return f.read()


def write(p, text):
    with open(os.path.join(ROOT, p), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def strip_br(s):
    return s.replace("{{", "").replace("}}", "")


# ---------------------------------------------------------------- I/O list
def io_table():
    src = read("src/core/iolist.js")
    rows = re.findall(r"T\('([^']+)', '([^']+)', '([^']+)', '([^']+)', (?:'([^']*)'|null), '([^']*)', '([^']*)', '([^']*)'", src)
    out = ["| Tag | Address | Type | Wiring / role | Description (EN) | الوصف (AR) |", "|---|---|---|---|---|---|"]
    for name, addr, typ, srcs, wiring, role, en, ar in rows:
        w = (wiring + " · " if wiring else "") + role
        out.append(f"| `{name}` | `{addr}` | {typ} | {w} | {en} | {ar} |")
    return "\n".join(out), len(rows)


# ---------------------------------------------------------------- test log
def mode_of(sc):
    ev = sc.get("events", [])
    pl = sc.get("plant", {})
    if any("estop" in e or "door" in e for e in ev):
        return "E-stop / door"
    if any("fault" in e for e in ev) or any(k in pl for k in ("badIdx", "missingCapIdx", "noFoilIdx", "challengeIdx", "fallenIdx")):
        return "Fault injection"
    if any("plantSet" in e for e in ev):
        return "Process disturbance"
    if re.search(r"tap|short|long|hold|held|two|close|queue|stuck|power|break|clos|during|flicker|drop", sc["id"], re.I):
        return "Edge case"
    return "Nominal"


def inputs_of(sc):
    parts = []
    for e in sc.get("events", [])[:6]:
        t = f"{e['t'] / 1000:g} s"
        if "press" in e:
            parts.append(f"press {e['press']} {e.get('ms', 200) / 1000:g} s @ {t}")
        elif "set" in e:
            parts.append("set " + ", ".join(f"{k}={'1' if v is True else '0' if v is False else v}" for k, v in e["set"].items()) + f" @ {t}")
        elif "estop" in e:
            parts.append(f"E-stop {'pressed' if e['estop'] else 'released'} @ {t}")
        elif "door" in e:
            parts.append(f"door {e['door']} @ {t}")
        elif "fault" in e:
            parts.append(f"fault {e['fault']} {e.get('arg', '')} @ {t}")
        elif "clear" in e:
            parts.append(f"clear {e['clear']} @ {t}")
        elif "plantSet" in e:
            parts.append("plant " + ", ".join(f"{k}={v}" for k, v in e["plantSet"].items()) + f" @ {t}")
    if len(sc.get("events", [])) > 6:
        parts.append("…")
    return "; ".join(parts) or "—"


def expected_of(sc):
    msgs = []
    for a in sc.get("asserts", []):
        m = a.get("msg", {}).get("en")
        if m and m not in msgs:
            msgs.append(m)
    return "; ".join(msgs[:2]) or f"{len(sc.get('asserts', []))} assertions"


def run_selftest():
    cmd = [sys.executable, os.path.join(ROOT, "tools", "selftest.py"), "--verbose"] + (["--levels", ONLY] if ONLY else [])
    r = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8")
    return r.stdout


def test_log(levels, st_out):
    res = {}
    for L in levels:
        ok = re.search(rf"PASS .*{L['id']} reference solution passes all (\d+) scenarios", st_out)
        w = re.findall(rf"PASS .*{L['id']}-[\w-]+ is diagnosed as", st_out)
        res[L["id"]] = (int(ok.group(1)) if ok else 0, len(w))
    lines = ["| Test ID | Level | Mode | Inputs | Expected | Result |", "|---|---|---|---|---|---|"]
    summary = []
    for L in levels:
        n, wrong = res[L["id"]]
        for sc in L["scenarios"]:
            lines.append(f"| `{sc['id']}` | {L['id']} | {mode_of(sc)} | {inputs_of(sc)} | {expected_of(sc)} | {'✔ pass' if n else '✖'} |")
        lines.append(f"| *{L['id']} hidden* | {L['id']} | Randomised | {L['hidden']['count']} variants (seeds {L['hidden'].get('seedBase', 0)}+, shifted timing, jitter) | same assertions as the visible tests | {'✔ pass' if n else '✖'} |")
        summary.append(f"- **{L['id']} {L['title']['en']}** — {len(L['scenarios'])} visible + {L['hidden']['count']} hidden scenarios pass with the reference solution; {wrong} documented wrong solutions are rejected with the right diagnosis.")
    return "\n".join(lines), "\n".join(summary)


def splice(text, tag, body):
    a, b = f"<!--{tag}:START-->", f"<!--{tag}:END-->"
    i, j = text.index(a) + len(a), text.index(b)
    return text[:i] + "\n" + body + "\n" + text[j:]


ONLY = None  # --levels L01,L02,L03 restricts everything to those levels


def main():
    global ONLY
    if "--levels" in sys.argv:
        ONLY = sys.argv[sys.argv.index("--levels") + 1]
    levels = []
    for p in sorted(glob.glob(os.path.join(ROOT, "levels", "L*.json"))):
        with open(p, encoding="utf-8") as f:
            lv = json.load(f)
        if ONLY is None or lv["id"] in ONLY.split(","):
            levels.append(lv)
    levels.sort(key=lambda L: L["order"])
    io, n_io = io_table()
    st = run_selftest()
    log, summary = test_log(levels, st)
    m = re.search(r"(\d+)/(\d+) passed", st)
    total = m.group(0) if m else "?"
    readme = read("README.md")
    readme = splice(readme, "IO", io)
    readme = splice(readme, "TESTLOG", summary + "\n\n<details><summary>Full test table (" + str(sum(len(L['scenarios']) for L in levels)) + " visible scenarios)</summary>\n\n" + log + "\n\n</details>\n\nSelf-test total: **" + total + "** (engine unit tests, plant model, editor, share links, every level).")
    write("README.md", readme)
    write("docs/test-log.md", "# Test log\n\nGenerated by `python tools/gen_docs.py`. Every scenario is run against the (hidden) reference solution; every documented wrong solution must fail.\n\n" + summary + "\n\n" + log + "\n")
    print(f"I/O list: {n_io} tags; levels: {len(levels)}; self-test: {total}")


if __name__ == "__main__":
    main()
