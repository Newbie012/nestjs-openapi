import { ApiProperty } from '@nestjs/swagger';

class ProductDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  sku: string;

  @ApiProperty()
  barcode: string;
}

class AddressDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  product: ProductDto;
}

class ContactDto {
  @ApiProperty()
  contactName: string;
}

export class OrderSummaryDto {
  @ApiProperty()
  address: AddressDto;

  @ApiProperty()
  contact: ContactDto;
}
