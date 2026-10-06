import { ApiProperty } from '@nestjs/swagger';

export class ProductDto {
  @ApiProperty({ type: [String] })
  variants: string[];

  @ApiProperty()
  vendor: string;
}
