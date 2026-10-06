import {
  ApiProperty,
  ApiPropertyOptional,
  IntersectionType,
  OmitType,
  PartialType,
  PickType,
} from '@nestjs/swagger';

// Not exported: @nestjs/swagger still names a schema after it
class Badge {
  @ApiProperty()
  label: string;
}

export class Address {
  @ApiProperty()
  street: string;
}

export class Contact {
  @ApiProperty({ description: 'Contact email' })
  email: string;
}

export class PersonDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiPropertyOptional()
  nickname?: string;

  @ApiProperty()
  badge: Badge;
}

export class UpdatePersonDto extends PartialType(PersonDto) {}

export class PersonNameDto extends PickType(PersonDto, ['name'] as const) {}

export class CreatePersonDto extends OmitType(PersonDto, ['id'] as const) {
  @ApiProperty({ description: 'Invitation code' })
  inviteCode: string;
}

export class PatchPersonDto extends PartialType(
  OmitType(PersonDto, ['id'] as const),
) {}

export class AddressContactDto extends IntersectionType(Address, Contact) {}
