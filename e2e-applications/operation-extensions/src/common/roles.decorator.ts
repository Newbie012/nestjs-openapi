import { SetMetadata } from '@nestjs/common';

export enum Role {
  Admin = 'admin',
  Support = 'support',
}

export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);

export const RateLimit = (options: { perMinute: number }) =>
  SetMetadata('rate-limit', options);
