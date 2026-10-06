import type { UserinfoResponse } from '../vendor/oidc-client';

export type UserProfile = UserinfoResponse & {
  displayName: string;
  groups: string[];
};
