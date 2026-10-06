#!/usr/bin/env python3
"""Run the in-browser self-test headlessly (Edge/Chrome/Brave) and print a summary.

Usage:
  python tools/selftest.py              # build (into a temp dir) + run everything
  python tools/selftest.py --only L05   # only suites/levels whose name contains L05
  python tools/selftest.py --verbose    # print every row, not just failures

Exit code 0 = all passed.
"""
import html
import json
import os
import re
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BROWSERS = [  # Chrome first: Edge prints nothing with --dump-dom on some Windows setups
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
]


def find_browser():
    for b in BROWSERS:
        if os.path.exists(b):
            return b
    sys.exit("No Edge/Chrome/Brave found")


def main():
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    args = sys.argv[1:]
    # build into a private temp dir so parallel runs never overwrite each other (or the repo's index.html)
    work = tempfile.mkdtemp(prefix="sc-build-")
    subprocess.check_call([sys.executable, os.path.join(ROOT, "tools", "build.py"), "--out", work], stdout=subprocess.DEVNULL)
    only = None
    if "--only" in args:
        only = args[args.index("--only") + 1]
    verbose = "--verbose" in args
    url = "file:///" + os.path.join(work, "selftest.html").replace("\\", "/")
    url += "?selftest" + (f"&only={only}" if only else "")
    with tempfile.TemporaryDirectory() as prof:
        cmd = [
            find_browser(), "--headless=new", "--disable-gpu", "--no-first-run",
            "--no-default-browser-check", f"--user-data-dir={prof}",
            "--virtual-time-budget=120000", "--dump-dom", url,
        ]
        res = subprocess.run(cmd, capture_output=True, timeout=600)
    dom = res.stdout.decode("utf-8", errors="replace")
    m = re.search(r'<pre id="sc-selftest-json"[^>]*>(.*?)</pre>', dom, re.S)
    if not m:
        print("No self-test result found in page. Raw DOM tail:")
        print(dom[-1500:])
        sys.exit(2)
    data = json.loads(html.unescape(m.group(1)))
    rows = data["rows"]
    fails = [r for r in rows if not r["ok"]]
    if verbose:
        for r in rows:
            print(("PASS " if r["ok"] else "FAIL ") + r["suite"] + " :: " + r["name"] + (("  -> " + r.get("detail", "")) if not r["ok"] else ""))
    else:
        for r in fails:
            print("FAIL " + r["suite"] + " :: " + r["name"] + "  -> " + r.get("detail", ""))
    print(f"\n{len(rows) - len(fails)}/{len(rows)} passed, {len(fails)} failed  ({data.get('ms', 0)} ms)")
    if data.get("summary"):
        print(data["summary"])
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
