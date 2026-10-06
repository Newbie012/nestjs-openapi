import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from './lib/compiled-lib';
import { ExternalLibraryRefDto } from './external-library-dto';
import { Described, FilterField } from './custom-decorators';
import { LibOptional } from './lib/compiled-lib';

export class ItemDto {
  @ApiProperty({ description: 'Item id' })
  id: string;
}

export class ReportDto {
  @ApiProperty()
  format: string;
}

export class ErrorDto {
  @ApiProperty()
  message: string;
}

export class CreateItemDto {
  @ApiProperty()
  name: string;
}

export class FilterDto {
  @ApiProperty()
  field: string;
}

export class OtherFilterDto {
  @ApiProperty()
  other: string;
}

export class SearchDto {
  @FilterField()
  filter: FilterDto;

  @FilterField(OtherFilterDto)
  otherFilter: OtherFilterDto;

  @Described({ description: 'Free text', required: false })
  text: string;

  @LibOptional()
  page: number;

  @IsOptional()
  @ValidateNested()
  @Type(() => FilterDto)
  plain: FilterDto;
}

export class LibraryUsageDto {
  @ApiProperty({ description: 'The library reference' })
  ref: ExternalLibraryRefDto;

  @ApiProperty({ description: 'Previous reference', nullable: true })
  previous: ExternalLibraryRefDto | null;

  @ApiProperty({ description: 'All references', type: [ExternalLibraryRefDto] })
  history: ExternalLibraryRefDto[];
}
