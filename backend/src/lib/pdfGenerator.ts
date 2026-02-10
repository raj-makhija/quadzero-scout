import { marked } from 'marked';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

function generateResumeHtml(bodyContent: string): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    @page { margin: 0; }
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #333;
      padding: 15mm;
    }
    .page-container {
      padding: 20pt;
      min-height: 100%;
    }
    .header {
      text-align: center;
      margin-bottom: 20pt;
      padding-bottom: 10pt;
      border-bottom: 2px solid #1E90FF;
    }
    .header .logo {
      font-size: 24pt;
      font-weight: 300;
      color: #666;
      margin-bottom: 5pt;
    }
    .header .logo .highlight {
      color: #1E90FF;
      font-weight: 500;
    }
    .header .contact {
      font-size: 10pt;
      color: #666;
    }
    .header .contact a {
      color: #1E90FF;
      text-decoration: none;
    }
    h1 {
      font-size: 24pt;
      font-weight: bold;
      margin: 15pt 0 20pt 0;
      color: #1a1a1a;
      text-align: left;
    }
    h2 {
      font-size: 11pt;
      margin-top: 18pt;
      margin-bottom: 8pt;
      color: #1E90FF;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      font-weight: bold;
      text-decoration: underline;
    }
    h3 {
      font-size: 11pt;
      margin-top: 10pt;
      margin-bottom: 5pt;
      color: #1a1a1a;
      font-weight: bold;
    }
    p {
      margin-bottom: 8pt;
      text-align: justify;
    }
    ul, ol {
      margin-left: 25pt;
      margin-bottom: 8pt;
    }
    li {
      margin-bottom: 4pt;
    }
    strong {
      color: #1a1a1a;
      font-weight: bold;
    }
    a {
      color: #1E90FF;
      text-decoration: none;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 10pt;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 5pt 10pt;
      text-align: left;
      font-size: 10pt;
    }
    th {
      background-color: #f5f5f5;
      font-weight: bold;
    }
    hr {
      border: none;
      border-top: 1px solid #ddd;
      margin: 12pt 0;
    }
    h2 { page-break-after: avoid; }
    h3 { page-break-after: avoid; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
  <div class="page-container">
    <div class="header">
      <div class="logo">Quad<span class="highlight">zero</span></div>
      <div class="contact">www.quadzero.com | 9820317850 | <a href="mailto:info@quadzero.com">info@quadzero.com</a></div>
    </div>
${bodyContent}
  </div>
</body>
</html>`;
}

export async function markdownToPdf(markdown: string): Promise<Buffer> {
  const htmlContent = await marked.parse(markdown);
  const fullHtml = generateResumeHtml(htmlContent);

  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath: await chromium.executablePath(),
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '18mm',
        right: '15mm',
        bottom: '18mm',
        left: '15mm',
      },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
