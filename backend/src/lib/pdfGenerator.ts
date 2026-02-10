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
    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #333;
      padding: 0;
    }
    h1 {
      font-size: 22pt;
      margin-bottom: 6pt;
      color: #1a1a1a;
      border-bottom: 2px solid #2563eb;
      padding-bottom: 4pt;
    }
    h2 {
      font-size: 13pt;
      margin-top: 14pt;
      margin-bottom: 6pt;
      color: #2563eb;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
    h3 {
      font-size: 11.5pt;
      margin-top: 8pt;
      margin-bottom: 3pt;
      color: #1a1a1a;
    }
    p {
      margin-bottom: 6pt;
    }
    ul, ol {
      margin-left: 18pt;
      margin-bottom: 6pt;
    }
    li {
      margin-bottom: 3pt;
    }
    strong {
      color: #1a1a1a;
    }
    a {
      color: #2563eb;
      text-decoration: none;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8pt;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 4pt 8pt;
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
      margin: 10pt 0;
    }
    h2 { page-break-after: avoid; }
    h3 { page-break-after: avoid; }
    @media print {
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
    }
  </style>
</head>
<body>
${bodyContent}
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
