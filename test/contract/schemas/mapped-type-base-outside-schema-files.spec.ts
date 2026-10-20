import { surface } from '../harness.js';

const contract = surface(import.meta.url);

const SCHEMA_OBJECT_30 = 'https://spec.openapis.org/oas/v3.0.3#schema-object';

const FILES = { entry: 'src/app.module.ts', dtoGlob: 'src/**/*.dto.ts' };

const MODULE = {
  'src/app.module.ts': `
import { Module } from '@nestjs/common';
import { ShapeController } from './shape.controller.js';

@Module({ controllers: [ShapeController] })
export class AppModule {}
`,
};

/**
 * A class a mapped type names is a schema even when no schema file declares
 * it: the document has the properties of the classes the helpers name
 */
contract('mapped-type-base-outside-schema-files', {
  spec: SCHEMA_OBJECT_30,
  config: { files: FILES },
  source: {
    ...MODULE,
    'src/models/shape.ts': `
export class ShapeBase {
  /** The shape's name */
  name: string;
  sides: number;
}
`,
    'src/update-shape.dto.ts': `
import { PartialType } from '@nestjs/swagger';
import { ShapeBase } from './models/shape.js';

export class UpdateShapeDto extends PartialType(ShapeBase) {}
`,
    'src/shape.controller.ts': `
import { Body, Controller, Patch } from '@nestjs/common';
import { UpdateShapeDto } from './update-shape.dto.js';

@Controller('shapes')
export class ShapeController {
  @Patch()
  update(@Body() body: UpdateShapeDto): void {}
}
`,
  },
});
