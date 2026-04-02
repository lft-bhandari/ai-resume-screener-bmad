import type {
  JobDescription,
  JobDescriptionCreate,
  JobDescriptionListResponse,
  JobDescriptionUpdate,
} from '@/types/job_description';

const BASE_URL = '/api';

function authHeaders(token: string): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function listJobDescriptionsApi(
  token: string,
): Promise<JobDescriptionListResponse> {
  const res = await fetch(`${BASE_URL}/job_descriptions`, {
    headers: authHeaders(token),
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch job descriptions: ${res.status}`);
  }
  return res.json() as Promise<JobDescriptionListResponse>;
}

export async function createJobDescriptionApi(
  token: string,
  data: JobDescriptionCreate,
): Promise<JobDescription> {
  const res = await fetch(`${BASE_URL}/job_descriptions`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to create job description: ${res.status}`);
  }
  return res.json() as Promise<JobDescription>;
}

export async function updateJobDescriptionApi(
  token: string,
  id: number,
  data: JobDescriptionUpdate,
): Promise<JobDescription> {
  const res = await fetch(`${BASE_URL}/job_descriptions/${id}`, {
    method: 'PUT',
    headers: authHeaders(token),
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    throw new Error(`Failed to update job description: ${res.status}`);
  }
  return res.json() as Promise<JobDescription>;
}

export async function deleteJobDescriptionApi(
  token: string,
  id: number,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/job_descriptions/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete job description: ${res.status}`);
  }
}
