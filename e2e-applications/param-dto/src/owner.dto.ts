import { IsInt, IsOptional, IsString } from 'class-validator';

export class ItemRouteParams {
  @IsString()
  ownerId: string;

  @IsString()
  itemId: string;
}

export class OwnerRouteParams {
  @IsString()
  ownerId: string;

  @IsString()
  region: string;
}

export class ItemFilterDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsInt()
  limit: number;
}
