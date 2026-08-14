export const ZITADEL = {
  issuer: process.env.NEXT_PUBLIC_ZITADEL_URL || 'http://localhost:8080',
  clientId: process.env.NEXT_PUBLIC_ZITADEL_CLIENT_ID || 'flappies',
  redirectUri:
    process.env.NEXT_PUBLIC_ZITADEL_REDIRECT_URI ||
    'http://localhost:3002/callback',
  postLogoutRedirectUri:
    process.env.NEXT_PUBLIC_ZITADEL_LOGOUT_URI || 'http://localhost:3002/',
};

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export type OperationMode = 'self_service' | 'pos';
