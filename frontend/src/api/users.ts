import type { User, UserCreate, UserListResponse } from '@/types/admin';

const BASE = '/api';

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function listUsersApi(token: string): Promise<UserListResponse> {
  const res = await fetch(`${BASE}/users`, { headers: authHeaders(token) });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? 'Failed to fetch users');
  }
  return res.json() as Promise<UserListResponse>;
}

export async function createUserApi(token: string, data: UserCreate): Promise<User> {
  const res = await fetch(`${BASE}/users`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? 'Failed to create user');
  }
  return res.json() as Promise<User>;
}

export async function deleteUserApi(token: string, id: number): Promise<void> {
  const res = await fetch(`${BASE}/users/${id}`, {
    method: 'DELETE',
    headers: authHeaders(token),
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { detail?: string }).detail ?? 'Failed to delete user');
  }
}
