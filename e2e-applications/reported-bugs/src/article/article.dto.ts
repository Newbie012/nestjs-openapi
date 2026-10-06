import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ArticleDto {
  @ApiProperty({ description: 'x', required: false })
  summary: string | null;

  @ApiPropertyOptional({ description: 'y' })
  details: string | null;

  @ApiProperty()
  id: string;
}
