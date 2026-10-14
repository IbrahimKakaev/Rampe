import { setupZonelessTestEnv } from 'jest-preset-angular/setup-env/zoneless';

// Unknown elements and properties are template mistakes: fail the test instead of logging.
setupZonelessTestEnv({ errorOnUnknownElements: true, errorOnUnknownProperties: true });
