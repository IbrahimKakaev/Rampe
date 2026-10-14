import { describe, expect, it } from '@jest/globals';

import { fingerprintsOfPage, normaliseSelector } from './fingerprint.js';

describe('normaliseSelector', () => {
  it.each([
    ['img:nth-child(2)', 'img'],
    ['ul > li:nth-of-type(3) > a', 'ul > li > a'],
    ['li:first-child > a:last-of-type', 'li > a'],
    ['.css-a1b2c3 > img', '* > img'],
    ['div.css-1x2y3z.card', 'div.card'],
    ['button.sc-bdVaJa.primary', 'button.primary'],
    ['#product-123456', '*'],
    ['#menu', '#menu'],
    ['.Button_root__x7Yz2', '.Button_root'],
    ['div[_ngcontent-ng-c1234567]', 'div'],
    ['p[data-v-7ba5bd90]', 'p'],
    ['.a1b2c3', '*'],
    ['.h2', '.h2'],
    ['.grid-12', '.grid-12'],
    ['input[name="email"]', 'input[name="email"]'],
  ])('turns %j into %j', (selector, expected) => {
    expect(normaliseSelector(selector)).toBe(expected);
  });

  it('keeps the combinators and normalises frames and shadow roots one by one', () => {
    expect(normaliseSelector('iframe#pub-1234567 | main  >  img:nth-child(2)')).toBe(
      'iframe | main > img',
    );
    expect(normaliseSelector('my-card.css-abc123 >>> img:nth-child(1)')).toBe('my-card >>> img');
    expect(normaliseSelector('h2 + p ~ a')).toBe('h2 + p ~ a');
  });
});

describe('fingerprintsOfPage', () => {
  const page = 'https://www.example.fr/galerie?tri=prix#haut';

  it('combines the rule, the path of the page and the normalised selector', () => {
    expect(
      fingerprintsOfPage(page, [{ ruleId: 'image-alt', selector: 'img:nth-child(2)' }]),
    ).toEqual(['image-alt|/galerie|img|1']);
  });

  it('stays the same when the page changes around the defect', () => {
    const before = fingerprintsOfPage(page, [
      { ruleId: 'image-alt', selector: '.css-a1b2c3 > img:nth-child(2)' },
    ]);
    const after = fingerprintsOfPage(`${page}&v=2`, [
      { ruleId: 'image-alt', selector: '.css-9z8y7x > img:nth-child(3)' },
    ]);

    expect(after).toEqual(before);
  });

  it('changes when the defect is on another element, of another rule or on another page', () => {
    const [reference] = fingerprintsOfPage(page, [
      { ruleId: 'image-alt', selector: 'img:nth-child(2)' },
    ]);

    expect(
      fingerprintsOfPage(page, [{ ruleId: 'image-alt', selector: 'header > img' }])[0],
    ).not.toBe(reference);
    expect(
      fingerprintsOfPage(page, [{ ruleId: 'label', selector: 'img:nth-child(2)' }])[0],
    ).not.toBe(reference);
    expect(
      fingerprintsOfPage('https://www.example.fr/accueil', [
        { ruleId: 'image-alt', selector: 'img:nth-child(2)' },
      ])[0],
    ).not.toBe(reference);
  });

  it('tells apart defects that normalise to the same selector by their order on the page', () => {
    expect(
      fingerprintsOfPage(page, [
        { ruleId: 'link-name', selector: 'li:nth-child(1) > a' },
        { ruleId: 'link-name', selector: 'li:nth-child(4) > a' },
        { ruleId: 'image-alt', selector: 'img' },
      ]),
    ).toEqual([
      'link-name|/galerie|li > a|1',
      'link-name|/galerie|li > a|2',
      'image-alt|/galerie|img|1',
    ]);
  });
});
