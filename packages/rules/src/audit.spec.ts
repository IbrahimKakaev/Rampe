import { describe, expect, it } from '@jest/globals';

import { type PageEvidence, proposalsForPage, proposeFor } from './audit.js';
import { CLASSIFICATION, type CriterionClassification } from './rgaa/classification.js';

const automatable: CriterionClassification = {
  criterion: '8.5',
  automation: 'automatable',
  rules: ['document-title'],
  testsCovered: ['8.5.1'],
  uncertainRules: [],
  justification: '',
};
const partial: CriterionClassification = {
  ...automatable,
  criterion: '1.1',
  automation: 'partial',
  rules: ['image-alt'],
};
const manual: CriterionClassification = {
  ...automatable,
  criterion: '12.6',
  automation: 'manual',
  rules: [],
};

const page = (overrides: Partial<PageEvidence> = {}): PageEvidence => ({
  analyzed: true,
  passedRules: ['document-title', 'image-alt'],
  findings: [],
  ...overrides,
});

describe('proposeFor', () => {
  it('proposes « non conforme » for a defect linked to the criterion with certainty', () => {
    const evidence = page({
      findings: [
        { ruleId: 'image-alt', criteria: ['1.1'], uncertain: [] },
        { ruleId: 'role-img-alt', criteria: ['1.1'], uncertain: [] },
        { ruleId: 'image-alt', criteria: ['1.1'], uncertain: [] },
      ],
    });

    expect(proposeFor(partial, evidence)).toEqual({
      kind: 'non-compliant',
      rules: ['image-alt', 'role-img-alt'],
    });
  });

  it('gives only a clue when the link of the defect to the criterion is uncertain', () => {
    const evidence = page({
      findings: [{ ruleId: 'aria-tooltip-name', criteria: [], uncertain: ['12.6'] }],
    });

    expect(proposeFor(manual, evidence)).toEqual({ kind: 'clue', rules: ['aria-tooltip-name'] });
  });

  it('prefers the certain link to the uncertain one', () => {
    const evidence = page({
      findings: [
        { ruleId: 'a', criteria: [], uncertain: ['1.1'] },
        { ruleId: 'b', criteria: ['1.1'], uncertain: [] },
      ],
    });

    expect(proposeFor(partial, evidence)?.kind).toBe('non-compliant');
  });

  it('proposes « conforme », to be confirmed, only for an automatable criterion whose rules all passed', () => {
    expect(proposeFor(automatable, page())).toEqual({
      kind: 'compliant-to-confirm',
      rules: ['document-title'],
    });
    expect(proposeFor(automatable, page({ passedRules: [] }))).toBeNull();
  });

  it('proposes nothing for a partially automatable or manual criterion without defect: the auditor decides', () => {
    expect(proposeFor(partial, page())).toBeNull();
    expect(proposeFor(manual, page())).toBeNull();
  });

  it('proposes nothing on a page the scan did not analyse', () => {
    expect(
      proposeFor(
        partial,
        page({
          analyzed: false,
          findings: [{ ruleId: 'image-alt', criteria: ['1.1'], uncertain: [] }],
        }),
      ),
    ).toBeNull();
  });
});

describe('proposalsForPage', () => {
  it('never proposes « conforme » for a criterion that is not automatable, on any page', () => {
    const everyRulePassed = page({
      passedRules: [...new Set(CLASSIFICATION.flatMap(({ rules }) => rules))],
    });
    const compliant = [...proposalsForPage(everyRulePassed)]
      .filter(([, proposal]) => proposal.kind === 'compliant-to-confirm')
      .map(([criterion]) => criterion);

    expect(compliant).toEqual(
      CLASSIFICATION.filter(({ automation }) => automation === 'automatable').map(
        ({ criterion }) => criterion,
      ),
    );
  });

  it('leaves out the criteria without a proposal', () => {
    const proposals = proposalsForPage(page({ passedRules: [] }), [automatable, partial, manual]);

    expect(proposals.size).toBe(0);
  });
});
