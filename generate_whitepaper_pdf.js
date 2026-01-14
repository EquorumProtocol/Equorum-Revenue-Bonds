#!/usr/bin/env node
/**
 * Generate professional PDF from WHITEPAPER.md with Mermaid diagrams rendered
 */

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Read markdown file
const markdownContent = fs.readFileSync('WHITEPAPER.md', 'utf-8');

// Simple but effective Markdown to HTML converter
function convertMarkdownToHTML(markdown) {
    let html = markdown;
    
    // First, extract and preserve code blocks (including Mermaid)
    const codeBlocks = [];
    html = html.replace(/```(\w+)\r?\n([\s\S]*?)\r?\n```/g, (match, lang, code) => {
        const placeholder = `\n___CODE_BLOCK_${codeBlocks.length}___\n`;
        codeBlocks.push({ lang: lang, code: code.trim() });
        console.log(`✓ Captured ${lang} block #${codeBlocks.length - 1} (${code.trim().split('\n').length} lines)`);
        return placeholder;
    });
    
    // Convert headers (process line by line to avoid issues)
    const lines = html.split('\n');
    const processedLines = lines.map(line => {
        if (line.startsWith('#### ')) return '<h4>' + line.substring(5) + '</h4>';
        if (line.startsWith('### ')) return '<h3>' + line.substring(4) + '</h3>';
        if (line.startsWith('## ')) return '<h2>' + line.substring(3) + '</h2>';
        if (line.startsWith('# ')) return '<h1>' + line.substring(2) + '</h1>';
        if (line.trim() === '---') return '<hr>';
        return line;
    });
    html = processedLines.join('\n');
    
    // Convert bold and italic (avoid matching in placeholders)
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
    
    // Convert inline code (but not placeholders)
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    
    // Convert links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    
    // Convert lists
    html = html.replace(/^\* (.+)$/gim, '<li>$1</li>');
    html = html.replace(/^- (.+)$/gim, '<li>$1</li>');
    html = html.replace(/^\d+\. (.+)$/gim, '<li>$1</li>');
    
    // Wrap consecutive list items in ul
    html = html.replace(/(<li>.*?<\/li>\n?)+/g, (match) => {
        return '<ul>\n' + match + '</ul>\n';
    });
    
    // Convert paragraphs BEFORE restoring code blocks
    const finalLines = html.split('\n');
    let inParagraph = false;
    let result = [];
    
    for (let i = 0; i < finalLines.length; i++) {
        const line = finalLines[i];
        const trimmed = line.trim();
        
        // Skip empty lines
        if (trimmed === '') {
            if (inParagraph) {
                result.push('</p>');
                inParagraph = false;
            }
            continue;
        }
        
        // Skip lines that are already HTML tags, special elements, or placeholders
        if (trimmed.startsWith('<h') || 
            trimmed.startsWith('<div') || 
            trimmed.startsWith('<pre') ||
            trimmed.startsWith('<ul') ||
            trimmed.startsWith('<li') ||
            trimmed.startsWith('<hr') ||
            trimmed.startsWith('</') ||
            trimmed.startsWith('___CODE_BLOCK_')) {
            if (inParagraph) {
                result.push('</p>');
                inParagraph = false;
            }
            result.push(line);
            continue;
        }
        
        // Start new paragraph for regular text
        if (!inParagraph) {
            result.push('<p>');
            inParagraph = true;
        }
        
        result.push(line);
    }
    
    if (inParagraph) {
        result.push('</p>');
    }
    
    html = result.join('\n');
    
    // Restore code blocks AFTER paragraph processing
    codeBlocks.forEach((block, index) => {
        const placeholder = `___CODE_BLOCK_${index}___`;
        if (block.lang === 'mermaid') {
            html = html.replace(placeholder, `<div class="mermaid">\n${block.code}\n</div>`);
        } else {
            html = html.replace(placeholder, `<pre><code class="language-${block.lang}">${block.code}</code></pre>`);
        }
    });
    
    return html;
}

// Convert markdown to HTML
const htmlContent = convertMarkdownToHTML(markdownContent);

// Create professional HTML template
const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Revenue Bonds Protocol - Whitepaper v1.0</title>
    <style>
        @page {
            size: A4;
            margin: 25mm 20mm;
        }
        
        @page :first {
            margin-top: 30mm;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica Neue', Arial, sans-serif;
            line-height: 1.6;
            color: #1a1a1a;
            max-width: 100%;
            padding: 0;
            margin: 0;
            font-size: 11pt;
        }
        
        h1, h2, h3, h4, h5, h6 {
            margin-top: 1.5em;
            margin-bottom: 0.75em;
            font-weight: 600;
            line-height: 1.3;
            page-break-after: avoid;
            color: #000;
        }
        
        h1 { 
            font-size: 2.2em; 
            border-bottom: 2px solid #e1e4e8; 
            padding-bottom: 0.4em;
            page-break-before: always;
            margin-top: 0;
        }
        
        h1:first-of-type {
            page-break-before: avoid;
            border-bottom: 3px solid #0366d6;
            color: #0366d6;
        }
        
        h2 { 
            font-size: 1.75em; 
            border-bottom: 1px solid #e1e4e8; 
            padding-bottom: 0.3em;
            margin-top: 2em;
        }
        
        h3 { 
            font-size: 1.4em;
            margin-top: 1.5em;
        }
        
        h4 { 
            font-size: 1.15em;
        }
        
        code {
            background-color: #f6f8fa;
            padding: 3px 6px;
            border-radius: 3px;
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 0.9em;
            color: #e83e8c;
        }
        
        pre {
            background-color: #f6f8fa;
            padding: 16px;
            border-radius: 6px;
            overflow-x: auto;
            page-break-inside: avoid;
            border-left: 3px solid #0366d6;
            margin: 1em 0;
        }
        
        pre code {
            background-color: transparent;
            padding: 0;
            color: #24292e;
            font-size: 0.85em;
            line-height: 1.45;
        }
        
        table {
            border-collapse: collapse;
            width: 100%;
            margin: 1.5em 0;
            page-break-inside: avoid;
        }
        
        th, td {
            border: 1px solid #dfe2e5;
            padding: 10px 14px;
            text-align: left;
        }
        
        th {
            background-color: #f6f8fa;
            font-weight: 600;
            color: #000;
        }
        
        tr:nth-child(even) {
            background-color: #fafbfc;
        }
        
        blockquote {
            border-left: 4px solid #0366d6;
            padding-left: 16px;
            color: #586069;
            margin: 1em 0;
            font-style: italic;
        }
        
        a {
            color: #0366d6;
            text-decoration: none;
        }
        
        a:hover {
            text-decoration: underline;
        }
        
        .mermaid {
            text-align: center;
            margin: 2em 0;
            page-break-inside: avoid;
            background-color: #ffffff;
            padding: 20px;
            border: 1px solid #e1e4e8;
            border-radius: 6px;
        }
        
        ul, ol {
            padding-left: 2em;
            margin: 1em 0;
        }
        
        li {
            margin: 0.5em 0;
        }
        
        hr {
            border: none;
            border-top: 1px solid #e1e4e8;
            margin: 2em 0;
        }
        
        p {
            margin: 1em 0;
            text-align: justify;
        }
        
        strong {
            font-weight: 600;
            color: #000;
        }
    </style>
</head>
<body>
    ${htmlContent}
    <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
    <script>
        console.log('Initializing Mermaid...');
        
        mermaid.initialize({ 
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            flowchart: { 
                useMaxWidth: true,
                htmlLabels: true,
                curve: 'basis'
            },
            sequence: {
                useMaxWidth: true,
                wrap: true,
                diagramMarginX: 50,
                diagramMarginY: 10
            }
        });
        
        window.addEventListener('load', async function() {
            console.log('Page loaded, rendering Mermaid diagrams...');
            try {
                await mermaid.run();
                console.log('✅ All Mermaid diagrams rendered successfully!');
                window.mermaidReady = true;
            } catch (err) {
                console.error('❌ Mermaid rendering error:', err);
                window.mermaidReady = false;
            }
        });
    </script>
</body>
</html>
`;

// Save temporary HTML file
const tempHtmlPath = path.join(__dirname, 'temp_whitepaper.html');
fs.writeFileSync(tempHtmlPath, htmlTemplate);

// Also save a debug copy
const debugHtmlPath = path.join(__dirname, 'debug_whitepaper.html');
fs.writeFileSync(debugHtmlPath, htmlTemplate);

console.log('🚀 Generating professional PDF from WHITEPAPER.md...');
console.log('📝 HTML template created');
console.log('🔍 Debug HTML saved to: debug_whitepaper.html');

// Generate PDF using Puppeteer
(async () => {
    let browser;
    try {
        console.log('🌐 Launching browser...');
        browser = await puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });
        
        const page = await browser.newPage();
        
        // Enable console logging from the page
        page.on('console', msg => console.log('  Browser:', msg.text()));
        
        console.log('📄 Loading HTML content...');
        await page.goto(`file://${tempHtmlPath}`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        
        // Wait for Mermaid to be ready
        console.log('🎨 Waiting for Mermaid diagrams to render...');
        await page.waitForFunction(
            'window.mermaidReady === true || window.mermaidReady === false',
            { timeout: 15000 }
        );
        
        // Check if rendering was successful
        const mermaidReady = await page.evaluate(() => window.mermaidReady);
        if (mermaidReady) {
            console.log('✅ Mermaid diagrams rendered successfully!');
        } else {
            console.log('⚠️  Warning: Mermaid rendering may have failed');
        }
        
        // Additional wait to ensure everything is settled
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        console.log('📦 Generating PDF...');
        await page.pdf({
            path: 'WHITEPAPER.pdf',
            format: 'A4',
            margin: {
                top: '25mm',
                right: '20mm',
                bottom: '25mm',
                left: '20mm'
            },
            printBackground: true,
            preferCSSPageSize: false,
            displayHeaderFooter: false
        });
        
        await browser.close();
        
        // Clean up temporary HTML file
        fs.unlinkSync(tempHtmlPath);
        
        console.log('');
        console.log('✅ PDF generated successfully!');
        console.log('📄 Output: WHITEPAPER.pdf');
        console.log('📊 Professional PDF with all Mermaid diagrams rendered');
        console.log('');
        
    } catch (error) {
        console.error('❌ Error generating PDF:', error.message);
        
        if (browser) {
            await browser.close();
        }
        
        // Clean up on error
        if (fs.existsSync(tempHtmlPath)) {
            fs.unlinkSync(tempHtmlPath);
        }
        
        process.exit(1);
    }
})();
