import { ApiProperty } from '@nestjs/swagger';

export class PluginStateDto {
  @ApiProperty()
  loaded: boolean;
}
