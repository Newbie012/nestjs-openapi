import {
  ApiProperty,
  ApiPropertyOptional,
  ApiHideProperty,
} from '@nestjs/swagger';
import { Color, Priority, Size } from './enums';

/**
 * DTO covering all extractable @ApiProperty options.
 */
export class ItemDto {
  @ApiProperty({ description: 'Display name of the item' })
  name: string;

  @ApiProperty({ enum: Color, description: 'Item color' })
  color: Color;

  @ApiProperty({
    enum: ['active', 'deprecated', 'archived'],
    description: 'Item status',
  })
  status: string;

  @ApiProperty({ description: 'Contact email', format: 'email' })
  email: string;

  @ApiProperty({ description: 'Item price', minimum: 0, maximum: 10000 })
  price: number;

  @ApiProperty({ minLength: 3, maxLength: 50 })
  slug: string;

  @ApiProperty({ example: 'USD', default: 'USD' })
  currency: string;

  @ApiProperty({ deprecated: true, description: 'Use slug instead' })
  legacyCode: string;

  @ApiProperty({ readOnly: true })
  id: string;

  @ApiProperty({ writeOnly: true })
  password: string;

  @ApiProperty({ nullable: true })
  notes: string;

  @ApiProperty({ title: 'Tag List', description: 'Searchable tags' })
  tags: string[];

  @ApiProperty({ uniqueItems: true })
  codes: string[];

  @ApiProperty({ multipleOf: 0.01 })
  weight: number;

  @ApiProperty({
    exclusiveMinimum: true,
    minimum: 0,
    exclusiveMaximum: true,
    maximum: 1,
  })
  ratio: number;

  @ApiProperty({ pattern: '^[A-Z]{2}-\\d+$' })
  sku: string;

  @ApiProperty({ minItems: 1, maxItems: 5 })
  variants: string[];

  @ApiHideProperty()
  internalSecret: string;
}

export class TaskDto {
  @ApiProperty({ description: 'Task title' })
  title: string;

  @ApiProperty({ enum: Priority, description: 'Task priority' })
  priority: number;

  @ApiPropertyOptional({ enum: Size, description: 'T-shirt size estimate' })
  estimate?: Size;
}

export class SearchDto {
  @ApiProperty({ enum: ['asc', 'desc'] })
  sortOrder: string;

  @ApiProperty({ enum: Size, isArray: true, description: 'Filter by sizes' })
  sizes: Size[];
}
