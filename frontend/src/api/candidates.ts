const BASE_URL = '/api';

export interface ShortlistToggleResponse {
  id: number;
  is_shortlisted: boolean;
}

/**
 * PATCH /candidates/{analysisId}/shortlist — toggle candidate shortlist status.
 * Returns the updated is_shortlisted value.
 */
export async function toggleShortlistApi(
  token: string,
  analysisId: number,
  isShortlisted: boolean,
): Promise<ShortlistToggleResponse> {
  const res = await fetch(`${BASE_URL}/candidates/${analysisId}/shortlist`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ is_shortlisted: isShortlisted }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { detail?: string };
    throw new Error(body.detail ?? `Failed to update shortlist: ${res.status}`);
  }
  return res.json() as Promise<ShortlistToggleResponse>;
}
