import { ApiProperty } from '@nestjs/swagger';

export class NoteDto {
  @ApiProperty({ description: 'Markdown' })
  text: string;
}

export class CommentDto {
  @ApiProperty()
  note: NoteDto;

  @ApiProperty({ enum: ['low', 'medium', 'high'], enumName: 'PriorityDto' })
  priority: string;
}
