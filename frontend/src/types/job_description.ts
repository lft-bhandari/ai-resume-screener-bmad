export interface JobDescription {
  id: number;
  title: string;
  content: string;
  created_at: string; // ISO 8601 — from backend datetime field
}

export interface JobDescriptionCreate {
  title: string;
  content: string;
}

export interface JobDescriptionUpdate {
  title?: string;
  content?: string;
}

export interface JobDescriptionListResponse {
  items: JobDescription[];
  total: number;
}
