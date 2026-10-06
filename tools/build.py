#!/usr/bin/env python3
"""Scan Cycle build script (zero dependencies, Python 3).

Inlines src/ into two single-file pages:
  index.html     the game (levels embedded, NO solutions)
  selftest.html  same code + hidden fixtures (reference + wrong solutions); auto-runs the self-test

Usage:  python tools/build.py
"""
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CORE_ORDER = [
    "prng", "addr", "dsl", "compile", "blocks", "scan", "lint",
    "iolist", "plant", "sim", "scenario", "fixtures", "diagnostics", "levels", "demo",
]
UI_ORDER = [
    "dom", "i18n", "glossary", "symbols", "plantView", "palette", "grid", "tagtable", "report", "share", "app-ui",
]


def read(path):
    with open(os.path.join(ROOT, path), encoding="utf-8") as f:
        return f.read()


def write(path, text):
    with open(os.path.join(ROOT, path), "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def exists(path):
    return os.path.exists(os.path.join(ROOT, path))


def js_files():
    files = []
    for name in CORE_ORDER:
        p = f"src/core/{name}.js"
        if exists(p):
            files.append(p)
    # per-level diagnostics: src/core/diag/*.js (alphabetical)
    files += sorted(os.path.relpath(p, ROOT).replace("\\", "/")
                    for p in glob.glob(os.path.join(ROOT, "src/core/diag/*.js")))
    for name in UI_ORDER:
        p = f"src/ui/{name}.js"
        if exists(p):
            files.append(p)
    # any other ui files not in the list
    extra = sorted(os.path.relpath(p, ROOT).replace("\\", "/")
                   for p in glob.glob(os.path.join(ROOT, "src/ui/*.js")))
    files += [p for p in extra if p not in files]
    files += sorted(os.path.relpath(p, ROOT).replace("\\", "/")
                    for p in glob.glob(os.path.join(ROOT, "src/data/*.js")))
    files += sorted(os.path.relpath(p, ROOT).replace("\\", "/")
                    for p in glob.glob(os.path.join(ROOT, "src/selftest/*.js")))
    if exists("src/app.js"):
        files.append("src/app.js")
    return files


def safe_json(obj):
    text = json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    return text.replace("</", "<\\/")


def load_levels():
    levels = []
    for p in sorted(glob.glob(os.path.join(ROOT, "levels", "L*.json"))):
        with open(p, encoding="utf-8") as f:
            levels.append(json.load(f))
    levels.sort(key=lambda l: l.get("order", 0))
    return levels


def load_fixtures():
    fx = {"solutions": {}, "wrong": {}}
    for p in sorted(glob.glob(os.path.join(ROOT, "levels", "solutions", "*.json"))):
        with open(p, encoding="utf-8") as f:
            fx["solutions"][os.path.splitext(os.path.basename(p))[0]] = json.load(f)
    for p in sorted(glob.glob(os.path.join(ROOT, "levels", "wrong", "*.json"))):
        with open(p, encoding="utf-8") as f:
            fx["wrong"][os.path.splitext(os.path.basename(p))[0]] = json.load(f)
    return fx


def build(with_fixtures):
    tpl = read("src/index.template.html")
    css = "\n".join(read(os.path.relpath(p, ROOT)) for p in sorted(glob.glob(os.path.join(ROOT, "src/css/*.css"))))
    scripts = []
    for p in js_files():
        scripts.append(f"<script>\n/* ==== {p} ==== */\n{read(p)}\n</script>")
    levels_block = f'<script type="application/json" id="levels">{safe_json(load_levels())}</script>'
    fx_block = ""
    if with_fixtures:
        fx_block = f'<script type="application/json" id="fixtures">{safe_json(load_fixtures())}</script>'
    out = tpl
    out = out.replace("<!--@css-->", f"<style>\n{css}\n</style>")
    out = out.replace("<!--@levels-->", levels_block)
    out = out.replace("<!--@fixtures-->", fx_block)
    out = out.replace("<!--@scripts-->", "\n".join(scripts))
    if with_fixtures:
        out = out.replace("<title>Scan Cycle</title>", "<title>Scan Cycle — self-test</title>")
        out = out.replace("<body>", '<body data-autotest="1">', 1)
    return out


def main():
    out = None
    if "--out" in sys.argv:
        out = sys.argv[sys.argv.index("--out") + 1]
    idx = build(False)
    st = build(True)
    if out:
        os.makedirs(out, exist_ok=True)
        for name, text in (("index.html", idx), ("selftest.html", st)):
            with open(os.path.join(out, name), "w", encoding="utf-8", newline="\n") as f:
                f.write(text)
    else:
        write("index.html", idx)
        write("selftest.html", st)
    print(f"index.html     {len(idx.encode('utf-8')) / 1024:.0f} KB")
    print(f"selftest.html  {len(st.encode('utf-8')) / 1024:.0f} KB")
    if len(idx.encode("utf-8")) > 1024 * 1024:
        print("ERROR: index.html exceeds 1 MB", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
