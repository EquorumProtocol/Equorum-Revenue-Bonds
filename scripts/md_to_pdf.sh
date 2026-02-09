#!/bin/bash
# Convert WHITEPAPER.md to PDF with Mermaid diagrams pre-rendered
set -e

cd /home/leo/Equorum-Protocol

PUPPETEER_CONFIG=/tmp/puppeteer.json
echo '{"executablePath": "/usr/bin/chromium-browser"}' > "$PUPPETEER_CONFIG"

INPUT="WHITEPAPER.md"
WORK="/tmp/whitepaper_work.md"
DIAGRAM_DIR="/tmp/mermaid_diagrams"
rm -rf "$DIAGRAM_DIR"
mkdir -p "$DIAGRAM_DIR"

echo "=== Extracting and rendering Mermaid diagrams ==="

# Extract mermaid blocks, render each to PNG, replace in markdown
cp "$INPUT" "$WORK"

COUNTER=0
# Use awk to find mermaid blocks
awk '/^```mermaid$/{flag=1; block=""; next} /^```$/ && flag{print NR" "block; flag=0; next} flag{block=block"\n"$0}' "$INPUT" | while IFS= read -r line; do
    COUNTER=$((COUNTER + 1))
    LINENO_END=$(echo "$line" | cut -d' ' -f1)
    CONTENT=$(echo "$line" | cut -d' ' -f2-)
    
    MMD_FILE="$DIAGRAM_DIR/diagram_${COUNTER}.mmd"
    PNG_FILE="$DIAGRAM_DIR/diagram_${COUNTER}.png"
    
    printf "%b" "$CONTENT" > "$MMD_FILE"
    
    echo "  Rendering diagram $COUNTER..."
    mmdc -i "$MMD_FILE" -o "$PNG_FILE" -p "$PUPPETEER_CONFIG" -w 800 -b white 2>/dev/null || {
        echo "  WARNING: Failed to render diagram $COUNTER, skipping"
        continue
    }
    
    echo "  Diagram $COUNTER rendered: $PNG_FILE"
done

# Now replace mermaid blocks with image references in the work file
echo "=== Replacing mermaid blocks with images ==="

python3 << 'PYEOF'
import re
import os

with open("/tmp/whitepaper_work.md", "r") as f:
    content = f.read()

diagram_dir = "/tmp/mermaid_diagrams"
counter = 0

def replace_mermaid(match):
    global counter
    counter += 1
    png_file = f"{diagram_dir}/diagram_{counter}.png"
    if os.path.exists(png_file):
        return f"![Diagram {counter}]({png_file})"
    else:
        return match.group(0)

content = re.sub(r'```mermaid\n(.*?)```', replace_mermaid, content, flags=re.DOTALL)

with open("/tmp/whitepaper_work.md", "w") as f:
    f.write(content)

print(f"  Replaced {counter} mermaid blocks")
PYEOF

echo "=== Generating PDF ==="
pandoc /tmp/whitepaper_work.md \
    -o WHITEPAPER_V2.pdf \
    --pdf-engine=xelatex \
    -V geometry:margin=1in \
    -V mainfont='DejaVu Sans' \
    -V monofont='DejaVu Sans Mono' \
    -V fontsize=11pt \
    -V colorlinks=true \
    -V linkcolor=blue \
    -V urlcolor=blue \
    --highlight-style=tango \
    --toc

echo "=== Done! Output: WHITEPAPER_V2.pdf ==="
