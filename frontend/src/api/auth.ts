import type { LoginRequest, TokenResponse, UserMeResponse } from '@/types/auth';

const BASE_URL = '/api';

export async function loginApi(credentials: LoginRequest): Promise<TokenResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
  });
  if (!res.ok) {
    throw new Error(`Login failed: ${res.status}`);
  }
  return res.json() as Promise<TokenResponse>;
}

export async function logoutApi(): Promise<void> {
  await fetch(`${BASE_URL}/auth/logout`, { method: 'POST' });
}

export async function getMeApi(token: string): Promise<UserMeResponse> {
  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error('Unauthorized');
  }
  return res.json() as Promise<UserMeResponse>;
}
