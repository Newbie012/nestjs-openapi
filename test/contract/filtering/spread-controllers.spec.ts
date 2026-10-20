import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const spec = 'https://spec.openapis.org/oas/v3.0.3#paths-object';
const files = { entry: 'src/app.module.ts' };

const controller = (name: string, path: string) => `
import { Controller, Get } from '@nestjs/common';

@Controller('${path}')
export class ${name} {
  @Get()
  list(): string {
    return '${path}';
  }
}
`;

const CONTROLLERS = {
  'src/a.controller.ts': controller('AController', 'a'),
  'src/b.controller.ts': controller('BController', 'b'),
  'src/c.controller.ts': controller('CController', 'c'),
};

contract('spread-controllers-imported-array', {
  spec,
  config: { files },
  source: {
    ...CONTROLLERS,
    'src/controllers.ts': `
import { AController } from './a.controller.js';
import { BController } from './b.controller.js';

export const controllers = [AController, BController];
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { controllers } from './controllers.js';
import { CController } from './c.controller.js';

@Module({ controllers: [...controllers, CController] })
export class AppModule {}
`,
  },
});

contract('spread-controllers-local-array', {
  spec,
  config: { files },
  source: {
    ...CONTROLLERS,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { AController } from './a.controller.js';
import { BController } from './b.controller.js';
import { CController } from './c.controller.js';

const controllers = [AController, BController] as const;

@Module({ controllers: [...controllers, CController] })
export class AppModule {}
`,
  },
});

contract('spread-controllers-identifier', {
  spec,
  config: { files },
  source: {
    ...CONTROLLERS,
    'src/controllers.ts': `
import { AController } from './a.controller.js';
import { BController } from './b.controller.js';
import { CController } from './c.controller.js';

export const controllers = [AController, BController, CController];
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { controllers } from './controllers.js';

@Module({ controllers: controllers })
export class AppModule {}
`,
  },
});

contract('spread-controllers-nested', {
  spec,
  config: { files },
  source: {
    ...CONTROLLERS,
    'src/controllers.ts': `
import { AController } from './a.controller.js';
import { BController } from './b.controller.js';
import { CController } from './c.controller.js';

const first = [AController];
const second = [...first, BController];

export const controllers = [...second, CController];
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { controllers } from './controllers.js';

@Module({ controllers: [...controllers] })
export class AppModule {}
`,
  },
});

contract('spread-controllers-imports', {
  spec,
  config: { files },
  source: {
    ...CONTROLLERS,
    'src/a.module.ts': `
import { Module } from '@nestjs/common';
import { AController } from './a.controller.js';

@Module({ controllers: [AController] })
export class AModule {}
`,
    'src/b.module.ts': `
import { Module } from '@nestjs/common';
import { BController } from './b.controller.js';

@Module({ controllers: [BController] })
export class BModule {}
`,
    'src/modules.ts': `
import { AModule } from './a.module.js';
import { BModule } from './b.module.js';

export const modules = [AModule, BModule];
`,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { modules } from './modules.js';
import { CController } from './c.controller.js';

@Module({ imports: [...modules], controllers: [CController] })
export class AppModule {}
`,
  },
});

contract('spread-controllers-computed-skipped', {
  spec,
  config: { files },
  source: {
    ...CONTROLLERS,
    'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { AController } from './a.controller.js';
import { BController } from './b.controller.js';
import { CController } from './c.controller.js';

const all = [AController, BController];
const computed = all.filter((cls) => cls !== BController);

@Module({ controllers: [...computed, ...loadMore(), CController] })
export class AppModule {}

declare function loadMore(): never[];
`,
  },
});
