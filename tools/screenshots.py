#!/usr/bin/env python3
"""Take the README screenshots with headless Chrome (no extra tools needed).

  python tools/screenshots.py

Writes docs/screenshots/{map,level,report,ladder,l02}.png from the built index.html.
The pages are driven with URL parameters (see src/ui/app-ui.js): ?level=L02  &demo=["ladder text",...]  &fat=1  &focus=ladder|report|fat|plant
The ladder examples use the sandbox demo program and the L02 starter (a completion exercise) — they are NOT level solutions.
"""
import json
import os
import subprocess
import sys
import tempfile
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHROME = [r"C:\Program Files\Google\Chrome\Application\chrome.exe", r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
          r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe"]
SANDBOX_DEMO = None


def chrome():
    for c in CHROME:
        if os.path.exists(c):
            return c
    sys.exit("Chrome not found")


def shot(name, query, w, h, budget=9000, frag=""):
    base = "file:///" + os.path.join(ROOT, "index.html").replace("\\", "/")
    sep = "&" if query else "?"
    url = base + query + sep + "theme=light" + frag
    out = os.path.join(ROOT, "docs", "screenshots", name + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with tempfile.TemporaryDirectory() as prof:
        subprocess.run([chrome(), "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", f"--user-data-dir={prof}",
                        f"--window-size={w},{h}", f"--virtual-time-budget={budget}", f"--screenshot={out}", url],
                       capture_output=True, timeout=120)
    print(name, "ok" if os.path.exists(out) else "FAILED", out)


def q(**kw):
    return "?" + "&".join(f"{k}={urllib.parse.quote(v if isinstance(v, str) else json.dumps(v), safe='')}" for k, v in kw.items())


def main():
    subprocess.check_call([sys.executable, os.path.join(ROOT, "tools", "build.py")], stdout=subprocess.DEVNULL)
    shot("map", "", 1100, 640)
    shot("level", q(level="L02"), 1280, 800)
    # a deliberately wrong L01 program so the failure report shows
    shot("report", q(level="L01", demo=["/Start_PB (Conveyor_Motor)"], fat="1", focus="report"), 1100, 900, 12000)
    # ladder examples: not level solutions
    shot("ladder", q(level="L02", focus="ladder"), 1100, 480)
    shot("ladder_demo", q(focus="ladder"), 1100, 1000, 9000, "#sandbox")
    print("done")


if __name__ == "__main__":
    main()
