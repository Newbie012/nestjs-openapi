import { IsArray, IsString } from 'class-validator';

export class ItemDto {
  @IsString()
  id: string;

  @IsString()
  ownerId: string;

  @IsArray()
  @IsString({ each: true })
  tags: string[];
}
