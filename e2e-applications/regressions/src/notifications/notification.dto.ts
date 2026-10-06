import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import {
  NotificationChannel,
  ChannelUnavailableReason,
  THEME_MODE,
  type ThemeMode,
} from './notification.types';

export class NotificationSettingsDto {
  @ApiProperty({ enum: Object.values(NotificationChannel) })
  channel: NotificationChannel;

  @ApiProperty({ enum: ['email', 'sms', 'push'], isArray: true })
  channels: NotificationChannel[];

  @ApiPropertyOptional({
    enum: Object.values(ChannelUnavailableReason),
    nullable: true,
  })
  unavailableReason?: ChannelUnavailableReason | null;

  @ApiProperty({ enum: NotificationChannel })
  label: string;
}

export class UpdateThemeDto {
  @IsEnum(THEME_MODE)
  themeMode: ThemeMode;
}
