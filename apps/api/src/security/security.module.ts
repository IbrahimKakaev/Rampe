import { Global, Module } from '@nestjs/common';

import { Sessions } from './sessions.js';

@Global()
@Module({ providers: [Sessions], exports: [Sessions] })
export class SecurityModule {}
