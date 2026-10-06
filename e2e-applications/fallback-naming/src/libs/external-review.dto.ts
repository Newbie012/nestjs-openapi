import { ApiProperty } from '@nestjs/swagger';
export class ReviewerDto {
  @ApiProperty()
  external: boolean;
}
