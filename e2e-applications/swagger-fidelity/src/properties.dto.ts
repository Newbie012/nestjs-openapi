import {
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { CatDto, DecoratorOnlyDto, DogDto } from './decorator-only-dto';
import { Address } from './people.dto';

export enum Priority {
  Low = 'low',
  High = 'high',
}

export enum Level {
  One = 1,
  Two = 2,
}

const MAX_NAME = 40;

export class PropertyOptionsDto {
  // A class type replaces a non-class TypeScript type
  @ApiProperty({ type: Address })
  address: Record<string, unknown>;

  @ApiProperty({ type: () => DecoratorOnlyDto })
  payload: unknown;

  @ApiProperty({ type: [DecoratorOnlyDto] })
  payloads: object[];

  @ApiProperty({ type: 'integer', minimum: 1, maximum: 10 })
  rating: number;

  @ApiProperty({ type: Number })
  numericString: string;

  @ApiProperty({ type: String, format: 'uuid', pattern: '^[a-f0-9-]+$' })
  id: string;

  @ApiProperty({
    minLength: 2,
    maxLength: MAX_NAME,
    title: 'Name',
    default: 'anonymous',
    example: 'Ada',
  })
  name: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 5, uniqueItems: true })
  tags: string[];

  @ApiProperty({ readOnly: true, deprecated: true })
  legacyId: string;

  @ApiProperty({ writeOnly: true })
  password: string;

  @ApiProperty({ type: 'object', additionalProperties: { type: 'string' } })
  labels: Record<string, string>;

  @ApiProperty({
    oneOf: [{ $ref: getSchemaPath(CatDto) }, { $ref: getSchemaPath(DogDto) }],
    discriminator: {
      propertyName: 'kind',
      mapping: { cat: getSchemaPath(CatDto), dog: getSchemaPath(DogDto) },
    },
  })
  pet: CatDto | DogDto;

  @ApiProperty({ type: 'array', items: { type: 'string', format: 'email' } })
  emails: unknown;

  @ApiProperty({ nullable: true, description: 'Maybe a ' + 'number' })
  maybe: number | null;

  @ApiProperty({ examples: ['a', 'b'] })
  sample: string;

  // Enums: inlined unless enumName names them, as in @nestjs/swagger
  @ApiProperty({ enum: Priority })
  priority: Priority;

  @ApiProperty({ enum: Priority, enumName: 'Priority', isArray: true })
  priorities: Priority[];

  @ApiProperty({ enum: Level })
  level: Level;

  @ApiPropertyOptional({ enum: ['asc', 'desc'] })
  order?: string;

  // No decorator: the TypeScript enum type is inlined too
  plainPriority: Priority;
}
