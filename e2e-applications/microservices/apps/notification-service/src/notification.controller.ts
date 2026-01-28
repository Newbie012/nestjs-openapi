import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { CreateNotificationDto, NotificationDto, NotificationStatsDto } from './dto';

@ApiTags('notifications')
@Controller('notifications')
export class NotificationController {
  private notifications: NotificationDto[] = [
    {
      id: 'notif_001',
      userId: 'usr_001',
      type: 'email',
      title: 'Welcome!',
      message: 'Welcome to our platform!',
      status: 'delivered',
      priority: 'medium',
      createdAt: new Date('2025-09-18T14:00:00Z'),
      sentAt: new Date('2025-09-18T14:01:00Z'),
      deliveredAt: new Date('2025-09-18T14:01:30Z'),
      readAt: null,
      metadata: { campaign: 'welcome' },
    },
    {
      id: 'notif_002',
      userId: 'usr_002',
      type: 'push',
      title: 'New Feature Available',
      message: 'Check out our latest feature update!',
      status: 'read',
      priority: 'high',
      createdAt: new Date('2025-09-18T13:00:00Z'),
      sentAt: new Date('2025-09-18T13:00:05Z'),
      deliveredAt: new Date('2025-09-18T13:00:10Z'),
      readAt: new Date('2025-09-18T13:15:00Z'),
      metadata: { feature: 'dashboard_v2' },
    },
  ];

  @Get()
  @ApiOperation({
    summary: 'Get notifications',
    description: 'Retrieve notifications with optional filtering'
  })
  @ApiQuery({
    name: 'userId',
    required: false,
    description: 'Filter by user ID',
    type: 'string',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filter by notification type',
    enum: ['email', 'push', 'sms', 'in_app'],
  })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'Filter by notification status',
    enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
  })
  @ApiResponse({
    status: 200,
    description: 'List of notifications',
    type: [NotificationDto],
  })
  findAll(
    @Query('userId') userId?: string,
    @Query('type') type?: string,
    @Query('status') status?: string,
  ): NotificationDto[] {
    let filtered = [...this.notifications];

    if (userId) {
      filtered = filtered.filter(n => n.userId === userId);
    }
    if (type) {
      filtered = filtered.filter(n => n.type === type);
    }
    if (status) {
      filtered = filtered.filter(n => n.status === status);
    }

    return filtered;
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Get notification statistics',
    description: 'Retrieve overall notification delivery statistics'
  })
  @ApiResponse({
    status: 200,
    description: 'Notification statistics',
    type: NotificationStatsDto,
  })
  getStats(): NotificationStatsDto {
    return {
      totalSent: 1542,
      pending: 23,
      delivered: 1450,
      failed: 69,
      read: 892,
      byType: {
        email: 850,
        push: 450,
        sms: 120,
        in_app: 122,
      },
    };
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get notification by ID',
    description: 'Retrieve a specific notification by its identifier'
  })
  @ApiParam({
    name: 'id',
    description: 'Notification unique identifier',
    type: 'string',
    example: 'notif_abc123def456',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification details',
    type: NotificationDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Notification not found',
  })
  findOne(@Param('id') id: string): NotificationDto | null {
    return this.notifications.find(n => n.id === id) || null;
  }

  @Post()
  @ApiOperation({
    summary: 'Send notification',
    description: 'Create and send a new notification'
  })
  @ApiBody({
    description: 'Notification data',
    type: CreateNotificationDto,
  })
  @ApiResponse({
    status: 201,
    description: 'Notification created and queued',
    type: NotificationDto,
  })
  @HttpCode(HttpStatus.CREATED)
  create(@Body() createNotificationDto: CreateNotificationDto): NotificationDto {
    const notification: NotificationDto = {
      id: `notif_${Math.random().toString(36).substr(2, 12)}`,
      userId: createNotificationDto.userId,
      type: createNotificationDto.type,
      title: createNotificationDto.title,
      message: createNotificationDto.message,
      status: 'pending',
      priority: createNotificationDto.priority || 'medium',
      createdAt: new Date(),
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      metadata: createNotificationDto.metadata || {},
    };

    this.notifications.push(notification);
    return notification;
  }
}