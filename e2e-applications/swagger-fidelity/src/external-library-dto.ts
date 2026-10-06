import { ApiProperty } from '@nestjs/swagger';

// Named `-dto.ts`, so it does not match dtoGlob (`*.dto.ts`)
export class ExternalLibraryDto {
  @ApiProperty({ description: 'Library name' })
  name: string;

  @ApiProperty({ required: false })
  version: string;
}

export class ExternalLibraryRefDto {
  @ApiProperty({ required: false, description: 'Where it came from' })
  source: string;
}
