#!/usr/bin/env python3
"""
Build WHITEPAPER.pdf from WHITEPAPER.md.

The markdown keeps its mermaid diagrams, which GitHub renders. The PDF has no
network access to a mermaid runtime, so the blocks below are swapped for plain
ASCII equivalents before pandoc runs.

    python3 tools/build_whitepaper_pdf.py

Needs pandoc and a chromium binary (PLAYWRIGHT_BROWSERS_PATH or CHROME).
"""
import os
import re
import shutil
import subprocess
import sys
import tempfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

LIFECYCLE = """            finalize (raised >= minRaise)
   SALE ---------------------------------> ACTIVE ---- mature() ----> MATURED
    |                                        |   (all coupons paid)
    | deadline passed below minRaise         |
    | or issuer cancels                      | triggerDefault()
    v                                        v (coupon missed past grace)
  FAILED                                  DEFAULTED
  holders redeem at cost,                 holders redeem undrawn
  issuer recovers collateral              capital + collateral"""

ARCHITECTURE = """                        +------------------+
      Issuer -----------> |  TapBondFactory  | -- registers --> EquorumRegistry
   (+ collateral)         +--------+---------+                  (append-only)
                                   | deploys
                     +-------------+-------------+
                     v                           v
             +---------------+           +---------------+
             |    TapBond    |           |   TapRouter   | <--- revenue --- Issuer
  buy /      |    (ERC-20)   | <---------+ revenueShareBps|
  claim /    +-------+-------+           +-------+-------+
  redeem  <----------+                           +--- remainder ---> Issuer
                     | draw fee
                     v
                +-------------+  80%  Treasury multisig
                | FeeSplitter | ---->
                +-------------+  20%  Builder"""

CSS = """
@page { size: A4; margin: 20mm 18mm 18mm 18mm; }
body {
  font-family: "IBM Plex Sans", "Segoe UI", Helvetica, Arial, sans-serif;
  font-size: 10.5pt; line-height: 1.55; color: #16202F; margin: 0;
}
h1, h2, h3, h4 { font-family: "Space Grotesk", Georgia, serif; color: #000A21; line-height: 1.2; }
h1 { font-size: 26pt; margin: 0 0 6pt 0; letter-spacing: -0.02em; }
h2 {
  font-size: 16pt; margin: 26pt 0 8pt 0; padding-top: 8pt;
  border-top: 2px solid #FF6224; page-break-after: avoid;
}
h3 { font-size: 12pt; margin: 16pt 0 5pt 0; page-break-after: avoid; }
p { margin: 0 0 8pt 0; }
a { color: #C8461A; text-decoration: none; word-break: break-word; }
strong { color: #000A21; }
hr { display: none; }
ul, ol { margin: 0 0 10pt 0; padding-left: 16pt; }
li { margin-bottom: 3pt; }
table {
  width: 100%; border-collapse: collapse; margin: 10pt 0 14pt 0;
  font-size: 9pt; page-break-inside: avoid;
}
th {
  background: #000A21; color: #fff; text-align: left; padding: 5pt 7pt;
  font-weight: 600; font-size: 8.5pt; letter-spacing: 0.02em;
}
td { padding: 5pt 7pt; border-bottom: 1px solid #E2E6ED; vertical-align: top; }
tr:nth-child(even) td { background: #F7F8FA; }
code {
  font-family: "IBM Plex Mono", ui-monospace, Consolas, monospace;
  font-size: 8.8pt; background: #F0F2F6; padding: 1pt 3pt; border-radius: 3px;
  color: #17304F;
}
pre {
  background: #F7F8FA; border: 1px solid #E2E6ED; border-left: 3px solid #FF6224;
  border-radius: 4px; padding: 9pt 11pt; overflow: visible;
  font-size: 8.2pt; line-height: 1.38; page-break-inside: avoid;
  white-space: pre-wrap; word-break: break-word;
}
pre code { background: none; padding: 0; font-size: inherit; }
blockquote {
  margin: 12pt 0; padding: 9pt 12pt; background: #FFF4EF;
  border-left: 3px solid #FF6224; page-break-inside: avoid;
}
blockquote p { margin: 0 0 5pt 0; }
blockquote p:last-child { margin-bottom: 0; }
h1 + p, h1 + p + p { color: #55617A; }
"""


def ascii_diagrams(md: str) -> str:
    blocks = re.findall(r"```mermaid\n.*?\n```", md, flags=re.S)
    if len(blocks) != 2:
        print(f"warning: expected 2 mermaid blocks, found {len(blocks)}", file=sys.stderr)
    for block, art in zip(blocks, (LIFECYCLE, ARCHITECTURE)):
        md = md.replace(block, "```\n" + art + "\n```", 1)
    return md


def find_chromium() -> str:
    for candidate in (
        os.environ.get("CHROME"),
        "/opt/pw-browsers/chromium/chrome-linux/chrome",
        "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
        shutil.which("chromium"),
        shutil.which("google-chrome"),
    ):
        if candidate and os.path.exists(candidate):
            return candidate
    raise SystemExit("no chromium binary found")


def main() -> int:
    src = os.path.join(ROOT, "WHITEPAPER.md")
    out = os.path.join(ROOT, "WHITEPAPER.pdf")
    md = ascii_diagrams(open(src, encoding="utf-8").read())

    with tempfile.TemporaryDirectory() as tmp:
        md_path = os.path.join(tmp, "wp.md")
        css_path = os.path.join(tmp, "wp.css")
        html_path = os.path.join(tmp, "wp.html")
        open(md_path, "w", encoding="utf-8").write(md)
        open(css_path, "w", encoding="utf-8").write(CSS)

        subprocess.run(
            ["pandoc", md_path, "-f", "gfm", "-t", "html5", "--standalone",
             "--metadata", "title=Equorum Revenue Bonds — Whitepaper V3",
             "-c", css_path, "-o", html_path],
            check=True,
        )
        # pandoc links the stylesheet; inline it so chromium needs no file access rules
        html = open(html_path, encoding="utf-8").read()
        html = html.replace(
            f'<link rel="stylesheet" href="{css_path}" />',
            f"<style>{CSS}</style>",
        )
        # pandoc's own title block would repeat the document's first heading
        html = re.sub(r"<header id=\"title-block-header\">.*?</header>", "", html, flags=re.S)
        open(html_path, "w", encoding="utf-8").write(html)

        subprocess.run(
            [find_chromium(), "--headless", "--disable-gpu", "--no-sandbox",
             "--no-pdf-header-footer", f"--print-to-pdf={out}", "file://" + html_path],
            check=True, capture_output=True,
        )

    size = os.path.getsize(out)
    print(f"wrote {os.path.relpath(out, ROOT)} ({size / 1024:.0f} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
