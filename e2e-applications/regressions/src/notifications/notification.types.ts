export const NotificationChannel = {
  Email: 'email',
  Sms: 'sms',
  Push: 'push',
} as const;
export type NotificationChannel =
  (typeof NotificationChannel)[keyof typeof NotificationChannel];

export enum ChannelUnavailableReason {
  NotConfigured = 'not_configured',
  NoPermission = 'no_permission',
}

export const THEME_MODE = {
  LIGHT: 'light',
  DARK: 'dark',
  SYSTEM: 'system',
} as const;
export type ThemeMode = (typeof THEME_MODE)[keyof typeof THEME_MODE];
