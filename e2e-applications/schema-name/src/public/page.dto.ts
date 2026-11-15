import { ApiProperty } from '@nestjs/swagger';

export class PageDto<T> {
  @ApiProperty()
  items: T[];

  @ApiProperty()
  total: number;
}
