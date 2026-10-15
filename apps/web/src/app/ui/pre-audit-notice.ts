import { Component, input } from '@angular/core';

/**
 * The honesty notice. Every view that shows a score shows it too: the score
 * comes from an automated pre-audit, which never proves RGAA conformity, and a
 * number of criteria can only be checked by a person.
 */
@Component({
  selector: 'rampe-pre-audit-notice',
  template: `
    <div class="pre-audit-notice" data-pre-audit-notice>
      <p>
        <strong>Pré-audit automatique.</strong> Le score est la part des vérifications automatiques
        réussies. Il ne mesure pas la conformité au RGAA.
      </p>
      <p>
        <strong>{{ criteriaToCheckManually() }} critères RGAA</strong> restent à vérifier
        manuellement.
      </p>
    </div>
  `,
})
export class PreAuditNotice {
  readonly criteriaToCheckManually = input.required<number>();
}
