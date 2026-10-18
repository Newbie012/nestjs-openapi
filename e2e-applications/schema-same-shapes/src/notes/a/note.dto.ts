import { ApiProperty } from '@nestjs/swagger';

// Same fields as notes/b, but documented differently
export class NoteDto {
  @ApiProperty({ description: 'Plain text' })
  text: string;
}

export class TaskDto {
  @ApiProperty()
  note: NoteDto;

  // enumName names two different value sets
  @ApiProperty({ enum: ['low', 'high'], enumName: 'PriorityDto' })
  priority: string;
}
