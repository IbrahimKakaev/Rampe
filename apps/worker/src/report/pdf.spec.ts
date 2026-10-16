import { describe, expect, it } from '@jest/globals';

import { createReportHandler } from './pdf.js';

describe('createReportHandler', () => {
  it('renders the HTML of the job and returns the PDF in base64', async () => {
    const rendered: string[] = [];
    const handle = createReportHandler({
      render: (html) => {
        rendered.push(html);
        return Promise.resolve(Buffer.from('%PDF-1.7'));
      },
    });

    const result = await handle({ html: '<h1>Rapport</h1>' });

    expect(rendered).toEqual(['<h1>Rapport</h1>']);
    expect(Buffer.from(result.pdf, 'base64').toString()).toBe('%PDF-1.7');
  });

  it('refuses a job that is not a report, without rendering anything', async () => {
    let calls = 0;
    const handle = createReportHandler({
      render: () => {
        calls += 1;
        return Promise.resolve(Buffer.alloc(0));
      },
    });

    await expect(handle({ url: 'http://exemple.fr/' })).rejects.toThrow();
    expect(calls).toBe(0);
  });
});
