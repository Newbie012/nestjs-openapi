import { IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(250)
  reason?: string | null;

  @IsString()
  title: string | null;

  @IsString()
  summary: string | undefined;

  archived: boolean | null | undefined;
}
