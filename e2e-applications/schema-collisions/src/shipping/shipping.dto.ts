import { ApiProperty, PartialType } from '@nestjs/swagger';

// Local to this file; orders declares a different AddressDto and ContactDto
class AddressDto {
  @ApiProperty({ required: false, nullable: true })
  name?: string | null;
}

class ContactDto {
  @ApiProperty({ required: false, nullable: true })
  phone?: string | null;
}

export class ShipmentDto {
  @ApiProperty()
  address: AddressDto;

  @ApiProperty()
  contact: ContactDto;
}

// A mapped type over the local AddressDto
export class AddressPatchDto extends PartialType(AddressDto) {}
