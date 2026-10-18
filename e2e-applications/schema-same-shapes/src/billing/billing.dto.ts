import { ApiProperty } from '@nestjs/swagger';
import { ChoiceDto } from '../catalog/a/choices.dto';
import { StatusDto } from './status';

// Same shape as refunds' MoneyDto, written as a class
export class MoneyDto {
  @ApiProperty()
  amount: number;

  @ApiProperty()
  currency: string;
}

export class InvoiceDto {
  @ApiProperty()
  total: MoneyDto;

  @ApiProperty({ enum: StatusDto })
  status: StatusDto;

  options: ChoiceDto<string>[];

  @ApiProperty({ enum: ['card', 'cash'], enumName: 'PaymentMethodDto' })
  method: string;
}
