import { ApiProperty } from '@nestjs/swagger';

// Exported, matches dtoGlob, and shares its name with the local classes
// above, but no documented route uses it
export class AddressDto {
  @ApiProperty()
  hasLoadingDock: boolean;
}
