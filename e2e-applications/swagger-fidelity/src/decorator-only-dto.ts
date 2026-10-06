import { ApiProperty } from '@nestjs/swagger';

// Not in dtoGlob and not used by any TypeScript type: only decorators name it
export class DecoratorOnlyDto {
  @ApiProperty({ description: 'Only named by decorators' })
  value: string;
}

export class CatDto {
  @ApiProperty({ enum: ['cat'] })
  kind: 'cat';
}

export class DogDto {
  @ApiProperty({ enum: ['dog'] })
  kind: 'dog';
}
