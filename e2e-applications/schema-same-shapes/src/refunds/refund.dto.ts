import { ApiProperty } from '@nestjs/swagger';
import { StatusDto } from './status';

// Same shape as billing's MoneyDto: an interface, fields in another order
export interface MoneyDto {
  currency: string;
  amount: number;
}

export class RefundDto {
  @ApiProperty()
  amount: MoneyDto;

  @ApiProperty({ enum: StatusDto })
  status: StatusDto;

  @ApiProperty({ enum: ['cash', 'card'], enumName: 'PaymentMethodDto' })
  method: string;
}
