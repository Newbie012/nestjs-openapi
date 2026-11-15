import { ApiProperty } from '@nestjs/swagger';

export class TagDto {
  @ApiProperty()
  label: string;
}
