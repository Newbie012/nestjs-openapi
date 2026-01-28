import { ApiProperty } from '@nestjs/swagger';

export class CreateNotificationDto {
  @ApiProperty({ 
    description: 'User ID to send notification to',
    example: 'usr_123456789'
  })
  userId: string;

  @ApiProperty({ 
    description: 'Notification type',
    enum: ['email', 'push', 'sms', 'in_app'],
    example: 'email'
  })
  type: 'email' | 'push' | 'sms' | 'in_app';

  @ApiProperty({ 
    description: 'Notification title',
    example: 'Welcome to our platform!'
  })
  title: string;

  @ApiProperty({ 
    description: 'Notification message content',
    example: 'Thank you for signing up. Get started by exploring our features.'
  })
  message: string;

  @ApiProperty({ 
    description: 'Priority level',
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @ApiProperty({ 
    description: 'Schedule delivery for later (optional)',
    required: false,
    example: '2025-09-18T16:00:00Z'
  })
  scheduledFor?: Date;

  @ApiProperty({ 
    description: 'Additional metadata for the notification',
    required: false,
    example: { campaign_id: 'welcome_series_1', source: 'signup' }
  })
  metadata?: Record<string, any>;
}

export class NotificationDto {
  @ApiProperty({ 
    description: 'Unique notification identifier',
    example: 'notif_abc123def456'
  })
  id: string;

  @ApiProperty({ 
    description: 'User ID who received the notification',
    example: 'usr_123456789'
  })
  userId: string;

  @ApiProperty({ 
    description: 'Notification type',
    enum: ['email', 'push', 'sms', 'in_app'],
    example: 'email'
  })
  type: 'email' | 'push' | 'sms' | 'in_app';

  @ApiProperty({ 
    description: 'Notification title',
    example: 'Welcome to our platform!'
  })
  title: string;

  @ApiProperty({ 
    description: 'Notification message content',
    example: 'Thank you for signing up. Get started by exploring our features.'
  })
  message: string;

  @ApiProperty({ 
    description: 'Current status of the notification',
    enum: ['pending', 'sent', 'delivered', 'failed', 'read'],
    example: 'delivered'
  })
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'read';

  @ApiProperty({ 
    description: 'Priority level',
    enum: ['low', 'medium', 'high', 'urgent'],
    example: 'medium'
  })
  priority: 'low' | 'medium' | 'high' | 'urgent';

  @ApiProperty({ 
    description: 'When notification was created',
    example: '2025-09-18T14:00:00Z'
  })
  createdAt: Date;

  @ApiProperty({ 
    description: 'When notification was sent (null if not sent)',
    example: '2025-09-18T14:05:00Z'
  })
  sentAt: Date | null;

  @ApiProperty({ 
    description: 'When notification was delivered (null if not delivered)',
    example: '2025-09-18T14:05:30Z'
  })
  deliveredAt: Date | null;

  @ApiProperty({ 
    description: 'When user read the notification (null if not read)',
    example: '2025-09-18T14:30:00Z'
  })
  readAt: Date | null;

  @ApiProperty({ 
    description: 'Additional metadata',
    example: { campaign_id: 'welcome_series_1', source: 'signup' }
  })
  metadata: Record<string, any>;
}

export class NotificationStatsDto {
  @ApiProperty({ 
    description: 'Total notifications sent',
    example: 1542
  })
  totalSent: number;

  @ApiProperty({ 
    description: 'Notifications pending delivery',
    example: 23
  })
  pending: number;

  @ApiProperty({ 
    description: 'Successfully delivered notifications',
    example: 1450
  })
  delivered: number;

  @ApiProperty({ 
    description: 'Failed delivery notifications',
    example: 69
  })
  failed: number;

  @ApiProperty({ 
    description: 'Read notifications',
    example: 892
  })
  read: number;

  @ApiProperty({ 
    description: 'Breakdown by notification type',
    example: { email: 850, push: 450, sms: 120, in_app: 122 }
  })
  byType: Record<string, number>;
}