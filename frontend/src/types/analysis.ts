// Mirrors backend app/schemas/analysis.py AnalysisResult fields
// snake_case per architecture convention (no camelCase conversion)

export interface AnalysisInitiateResponse {
  analysis_id: number;
  status: string; // "processing"
}

export interface JDMatchItem {
  skill: string;
  present: boolean;
  evidence: string | null;
}

export interface AnalysisResult {
  score: number;
  ats_score: number;
  matched_keywords: string[];
  missing_keywords: string[];
  jd_match: JDMatchItem[];
  feedback: string;
  reasoning: string;
}

export interface ReasoningStepEvent {
  step: string; // "initialising" | "skills_match" | "ats_check" | "generating_output"
  message: string;
}

// Streaming state shape used by useAnalysisStream hook
export interface StreamingState {
  phase:
    | 'connecting'
    | 'scores'
    | 'keywords'
    | 'jd_match'
    | 'reasoning'
    | 'complete'
    | 'error';
  result: Partial<AnalysisResult> | null;
  errorMessage: string | null;
  reasoningBuffer: string; // accumulated reasoning text during streaming
}

// JDSelector component output value
export type JDSelectorValue =
  | { type: 'library'; jd_id: number }
  | { type: 'paste'; jd_content: string; save_jd: boolean; jd_title?: string };

// --------------------------------------------------------
// Story 5.3 — History & Detail view types
// Mirrors backend schemas/candidate.py NoteResponse
// and schemas/analysis.py AnalysisListItem, AnalysisDetailResponse
// --------------------------------------------------------

export interface NoteItem {
  id: number;
  content: string;
  analysis_id: number;
  created_by: number;
  created_at: string; // ISO 8601
}

/** Slim list-view row from GET /analyses — includes jd_title from backend JOIN */
export interface AnalysisListItem {
  id: number;
  candidate_name: string;
  score: number | null;
  ats_score: number | null;
  is_shortlisted: boolean;
  jd_id: number | null;
  jd_title: string | null;
  created_at: string; // ISO 8601
}

export interface AnalysisListResponse {
  items: AnalysisListItem[];
  total: number;
}

/** Full detail response from GET /analyses/{id} — mirrors AnalysisDetailResponse backend schema */
export interface AnalysisDetailResponse {
  id: number;
  candidate_name: string;
  resume_filename: string;
  score: number | null;
  ats_score: number | null;
  matched_keywords: string | null; // JSON string — parse as string[]
  jd_match: string | null;         // JSON string — parse as JDMatchItem[]
  feedback: string | null;
  reasoning: string | null;
  is_shortlisted: boolean;
  jd_id: number | null;
  created_by: number;
  created_at: string; // ISO 8601
  notes: NoteItem[];
}
