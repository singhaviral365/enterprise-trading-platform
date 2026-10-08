import { applyCentralConfig } from './central-config';

// A side-effect import, first in main.ts: the modules below read process.env when they are imported, so the central file
// (config/application.yml) must have filled it by then.
applyCentralConfig();
