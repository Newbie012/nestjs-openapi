import { ApiProperty } from '@nestjs/swagger';
import { AddressDto } from '../common/address.dto';
import { Role } from './role.enum';
import { TagDto } from './tag.dto';

export class ProfileDto {
  @ApiProperty()
  bio: string;

  @ApiProperty({ type: [TagDto] })
  interests: TagDto[];
}

export class UserDto {
  @ApiProperty()
  name: string;

  @ApiProperty({ enum: Role })
  role: Role;

  @ApiProperty()
  address: AddressDto;

  @ApiProperty()
  tags: TagDto[];

  @ApiProperty()
  profile: ProfileDto;
}
