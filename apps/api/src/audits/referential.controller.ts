import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CLASSIFICATION, criteriaToCheckManually, CURRENT_REFERENTIAL } from '@rampe/rules';
import { referentialSchema } from '@rampe/shared';
import type * as z from 'zod/mini';

import { Public } from '../security/request-context.js';

@ApiTags('Référentiel')
@Controller('referentials')
export class ReferentialController {
  @Public()
  @Get('rgaa-4.1.2/criteria')
  @ApiOperation({
    summary:
      'Les 106 critères du RGAA 4.1.2 et leur classement : automatisable, partiellement automatisable ou manuel',
  })
  @ApiOkResponse({ standardSchema: referentialSchema })
  criteria(): z.infer<typeof referentialSchema> {
    const automation = new Map(CLASSIFICATION.map((entry) => [entry.criterion, entry.automation]));
    return {
      version: CURRENT_REFERENTIAL.version,
      themes: CURRENT_REFERENTIAL.themes.map(({ number, title }) => ({ number, title })),
      criteria: CURRENT_REFERENTIAL.criteria.map((criterion) => ({
        id: criterion.id,
        theme: criterion.theme,
        title: criterion.title,
        automation: automation.get(criterion.id) ?? 'manual',
      })),
      criteriaToCheckManually: criteriaToCheckManually(),
    };
  }
}
