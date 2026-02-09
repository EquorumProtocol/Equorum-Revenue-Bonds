#!/usr/bin/env python3
"""Pre-render Mermaid diagrams and generate PDF from WHITEPAPER.md"""
import re, os, subprocess, sys, json

WHITEPAPER = "/home/leo/Equorum-Protocol/WHITEPAPER.md"
OUTPUT_PDF = "/home/leo/Equorum-Protocol/WHITEPAPER_V2.pdf"
DIAGRAM_DIR = "/tmp/mermaid_diagrams"
PUPPETEER_CFG = "/tmp/puppeteer.json"
WORK_MD = "/tmp/whitepaper_rendered.md"

os.makedirs(DIAGRAM_DIR, exist_ok=True)

# Write puppeteer config with no-sandbox for WSL compatibility
with open(PUPPETEER_CFG, "w") as f:
    json.dump({
        "executablePath": "/usr/bin/chromium-browser",
        "args": ["--no-sandbox", "--disable-setuid-sandbox"]
    }, f)

print(f"Puppeteer config: {open(PUPPETEER_CFG).read()}")

with open(WHITEPAPER, "r") as f:
    content = f.read()

blocks = list(re.finditer(r'```mermaid\n(.*?)```', content, re.DOTALL))
print(f"Found {len(blocks)} mermaid blocks")

# Render each diagram
rendered = {}
for i, match in enumerate(blocks):
    mmd = os.path.join(DIAGRAM_DIR, f"d{i}.mmd")
    png = os.path.join(DIAGRAM_DIR, f"d{i}.png")
    with open(mmd, "w") as f:
        f.write(match.group(1))
    try:
        r = subprocess.run(
            ["/tmp/mmdc_local/node_modules/.bin/mmdc", "-i", mmd, "-o", png, "-p", PUPPETEER_CFG, "-w", "800", "-b", "white"],
            capture_output=True, text=True, timeout=60
        )
        if os.path.exists(png):
            rendered[i] = png
            print(f"  Diagram {i}: OK ({os.path.getsize(png)} bytes)")
        else:
            print(f"  Diagram {i}: FAILED")
            print(f"    stdout: {r.stdout[:200]}")
            print(f"    stderr: {r.stderr[:200]}")
    except Exception as e:
        print(f"  Diagram {i}: ERROR - {e}")

# Replace mermaid blocks with image references
counter = 0
def replace_block(match):
    global counter
    idx = counter
    counter += 1
    if idx in rendered:
        return f"![Diagram {idx}]({rendered[idx]})"
    return match.group(0)

output = re.sub(r'```mermaid\n(.*?)```', replace_block, content, flags=re.DOTALL)

with open(WORK_MD, "w") as f:
    f.write(output)

print(f"\nReplaced {len(rendered)}/{len(blocks)} diagrams")
print("Generating PDF...")

r = subprocess.run([
    "pandoc", WORK_MD,
    "-o", OUTPUT_PDF,
    "--pdf-engine=xelatex",
    "-V", "geometry:margin=1in",
    "-V", "mainfont=DejaVu Sans",
    "-V", "monofont=DejaVu Sans Mono",
    "-V", "fontsize=11pt",
    "-V", "colorlinks=true",
    "-V", "linkcolor=blue",
    "-V", "urlcolor=blue",
    "--highlight-style=tango",
    "--toc"
], capture_output=True, text=True)

if r.returncode == 0:
    size = os.path.getsize(OUTPUT_PDF)
    print(f"PDF generated: {OUTPUT_PDF} ({size} bytes)")
else:
    print(f"PDF generation failed:\n{r.stderr[:500]}")
    sys.exit(1)
