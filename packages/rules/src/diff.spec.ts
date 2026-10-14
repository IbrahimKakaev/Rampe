import { describe, expect, it } from '@jest/globals';

import { compareScans } from './diff.js';

describe('compareScans', () => {
  it('lists the defects that appeared, were fixed or remain', () => {
    const comparison = compareScans(
      {
        comparablePages: ['/', '/contact'],
        findings: [
          { fingerprint: 'image-alt|/|img', pagePath: '/' },
          { fingerprint: 'label|/contact|input', pagePath: '/contact' },
        ],
      },
      {
        comparablePages: ['/', '/contact'],
        findings: [
          { fingerprint: 'image-alt|/|img', pagePath: '/' },
          { fingerprint: 'link-name|/contact|a', pagePath: '/contact' },
        ],
      },
    );

    expect(comparison).toEqual({
      added: ['link-name|/contact|a'],
      fixed: ['label|/contact|input'],
      unchanged: ['image-alt|/|img'],
      notCompared: 0,
    });
  });

  it('never declares fixed a defect whose page was not analysed again', () => {
    const comparison = compareScans(
      {
        comparablePages: ['/', '/lent'],
        findings: [{ fingerprint: 'label|/lent|input', pagePath: '/lent' }],
      },
      { comparablePages: ['/'], findings: [] },
    );

    expect(comparison).toEqual({ added: [], fixed: [], unchanged: [], notCompared: 1 });
  });

  it('never declares new a defect on a page the previous scan did not analyse', () => {
    const comparison = compareScans(
      { comparablePages: ['/'], findings: [] },
      {
        comparablePages: ['/', '/nouvelle'],
        findings: [{ fingerprint: 'x|/nouvelle|p', pagePath: '/nouvelle' }],
      },
    );

    expect(comparison).toMatchObject({ added: [], notCompared: 1 });
  });
});
