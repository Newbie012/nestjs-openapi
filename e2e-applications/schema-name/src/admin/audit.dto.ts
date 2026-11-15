import { ApiProperty } from '@nestjs/swagger';
import { AddressDto } from '../common/address.dto';

export class AuditDto {
  @ApiProperty()
  action: string;

  @ApiProperty()
  location: AddressDto;
}
