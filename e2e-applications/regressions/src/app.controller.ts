import { Body, Controller, Get, Put } from '@nestjs/common';
import type { UserProfile } from './auth/auth.types';
import {
  NotificationSettingsDto,
  UpdateThemeDto,
} from './notifications/notification.dto';
import { SearchFiltersDto } from './search/models/filters';
import { ActiveFiltersDto } from './active/active-filters';

@Controller()
export class AppController {
  @Get('auth/me')
  me(): Promise<UserProfile> {
    return Promise.reject(new Error('not implemented'));
  }

  @Get('notifications/settings')
  settings(): NotificationSettingsDto[] {
    return [];
  }

  @Put('settings/theme')
  updateTheme(@Body() body: UpdateThemeDto): UpdateThemeDto {
    return body;
  }

  @Get('filters')
  filters(): SearchFiltersDto {
    return new SearchFiltersDto();
  }

  @Get('filters/active')
  activeFilters(): ActiveFiltersDto {
    return new ActiveFiltersDto();
  }
}
