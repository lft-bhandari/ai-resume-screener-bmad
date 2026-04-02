import type { AnalysisInitiateResponse, AnalysisListResponse, AnalysisDetailResponse } from '@/types/analysis';

const BASE_URL = '/api';

/**
 * POST /analyses — multipart/form-data
 * Initiates a new resume analysis. Returns analysis_id for SSE streaming.
 * IMPORTANT: Do NOT set Content-Type header — browser sets multipart boundary
 * automatically.
 */
export async function initiateAnalysisApi(
  token: string,
  formData: FormData,
): Promise<AnalysisInitiateResponse> {
  const res = await fetch(`${BASE_URL}/analyses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(
      body.detail ?? `Analysis initiation failed: ${res.status}`,
    );
  }
  return res.json() as Promise<AnalysisInitiateResponse>;
}

/**
 * Returns the full URL for the SSE stream endpoint.
 * Used by useAnalysisStream hook to connect to the backend.
 */
export function getAnalysisStreamUrl(analysisId: number): string {
  return `${BASE_URL}/analyses/stream/${analysisId}`;
}

/**
 * GET /analyses — list all analyses for the authenticated user.
 * Optional shortlisted filter: pass true to fetch only shortlisted.
 */
export async function listAnalysesApi(
  token: string,
  shortlisted?: boolean,
): Promise<AnalysisListResponse> {
  const url =
    shortlisted === true
      ? `${BASE_URL}/analyses?shortlisted=true`
      : `${BASE_URL}/analyses`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Failed to fetch analyses: ${res.status}`);
  }
  return res.json() as Promise<AnalysisListResponse>;
}

/**
 * GET /analyses/{id} — fetch full analysis detail including notes.
 */
export async function getAnalysisDetailApi(
  token: string,
  id: number,
): Promise<AnalysisDetailResponse> {
  const res = await fetch(`${BASE_URL}/analyses/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Failed to fetch analysis: ${res.status}`);
  }
  return res.json() as Promise<AnalysisDetailResponse>;
}
