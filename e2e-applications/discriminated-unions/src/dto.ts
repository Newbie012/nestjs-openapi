/**
 * Discriminated Union DTOs for testing const value preservation
 */

// Simple discriminated union with string literal discriminator
export type PaymentMethodDto =
  | { type: 'credit_card'; cardNumber: string; expiryDate: string }
  | { type: 'paypal'; email: string }
  | { type: 'bank_transfer'; accountNumber: string; routingNumber: string };

// Discriminated union with enum-like const values
export const CodeSource = {
  ApplicationCode: 'ApplicationCode',
  OpenSource: 'OpenSource',
  StandardLibrary: 'StandardLibrary',
} as const;

export type CodeSourceType = (typeof CodeSource)[keyof typeof CodeSource];

export type CodeExecutionSourceDto =
  | { kind: 'ApplicationCode' | 'StandardLibrary' }
  | { kind: 'OpenSource'; libraryName: string; libraryVersion: string };

// Discriminated union with nested objects
export type NotificationDto =
  | { channel: 'email'; recipient: string; subject: string; body: string }
  | { channel: 'sms'; phoneNumber: string; message: string }
  | { channel: 'push'; deviceToken: string; title: string; payload: object };

// Response wrapper
export interface ApiResponse<T> {
  data: T;
  timestamp: string;
}
