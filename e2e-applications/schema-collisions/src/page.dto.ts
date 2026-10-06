import { ApiProperty } from '@nestjs/swagger';

export class PageDto<T> {
  items: T[];

  @ApiProperty()
  total: number;
}
