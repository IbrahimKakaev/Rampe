import { reportJobSchema, type ReportResult } from '@rampe/shared';
import type { Browser } from 'playwright-core';

/** Footer of every page: the nature of the document and the page number. */
const FOOTER =
  '<div style="width:100%;padding:0 15mm;font:8px sans-serif;color:#4a4a55;display:flex;justify-content:space-between">' +
  '<span>Rampe — rapport de pré-audit automatique</span>' +
  '<span>Page <span class="pageNumber"></span> sur <span class="totalPages"></span></span></div>';

/**
 * Prints the HTML of a report to a tagged PDF, the accessible kind: headings,
 * lists and tables keep their structure for screen readers.
 *
 * The report quotes the scanned site (extracts of code, page titles), so the
 * rendering trusts nothing: JavaScript is off, the context is offline and
 * every request is refused. The API escapes what it quotes; this is the
 * second line of defence.
 */
export async function renderPdf(browser: Browser, html: string): Promise<Buffer> {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    offline: true,
    acceptDownloads: false,
    serviceWorkers: 'block',
    locale: 'fr-FR',
  });
  try {
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 30_000 });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: FOOTER,
      margin: { top: '15mm', right: '15mm', bottom: '18mm', left: '15mm' },
    });
  } finally {
    await context.close();
  }
}

/** Handles a report job: validates it, renders it, returns the PDF as base64. */
export function createReportHandler(deps: {
  readonly render: (html: string) => Promise<Buffer>;
}): (data: unknown) => Promise<ReportResult> {
  return async (data) => {
    const { html } = reportJobSchema.parse(data);
    return { pdf: (await deps.render(html)).toString('base64') };
  };
}
