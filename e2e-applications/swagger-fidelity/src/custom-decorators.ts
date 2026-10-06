import { applyDecorators, Controller } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiExcludeEndpoint,
  ApiProperty,
  ApiPropertyOptional,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { IsOptional, ValidateNested } from 'class-validator';
import { Type } from './lib/compiled-lib';
import { ErrorDto, FilterDto } from './items.dto';

export function FilterField(type: new () => object = FilterDto) {
  return applyDecorators(
    ApiPropertyOptional({ type }),
    IsOptional(),
    ValidateNested(),
    Type(() => type),
  );
}

export function Described({
  description,
  required = true,
}: {
  description: string;
  required?: boolean;
}) {
  return ApiProperty({ description, required });
}

export const ApiStandardErrors = () =>
  applyDecorators(
    ApiBadRequestResponse({ description: 'Bad request', type: ErrorDto }),
    ApiUnauthorizedResponse({ description: 'Unauthorized' }),
  );

export function ExternalController(path: string) {
  return applyDecorators(
    Controller(path),
    ApiTags('External'),
    ApiBearerAuth(),
  );
}

export const Internal = applyDecorators(ApiExcludeEndpoint());
