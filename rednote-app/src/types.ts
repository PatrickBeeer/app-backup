// UI-facing types (ported from frontend/src/types/index.ts, kept compatible with main.tsx).
// The new architecture stores everything in IndexedDB; these describe the stored shape.

export type Status =
  | 'queued'
  | 'fetching'
  | 'processing_media'
  | 'analyzing'
  | 'generating'
  | 'completed'
  | 'failed';

export interface NoteMedia {
  images?: string[];
  video_url?: string;
  cover_url?: string;
}

export interface Note {
  id: string;
  type: 'image' | 'video';
  title: string;
  content: string;
  author: Record<string, string>;
  metrics: Record<string, number>;
  media: NoteMedia;
  comments: { content: string; likes: number }[];
}

export interface Insight {
  summary: string;
  evidence: string[];
}

export interface DemandItem {
  need: string;
  frequency: number;
  examples: string[];
}

export interface Report {
  viral_reasons: Insight;
  user_pains: Insight;
  content_structure: Insight;
  title_formula: Insight;
  cover_visual: Insight;
  comment_demands: DemandItem[];
  limitations: string[];
  confidence: number;
}

export interface Analysis {
  id: string;
  source_url: string;
  status: Status;
  stage: string;
  error?: string;
  created_at: string;
  model_version?: string;
  note?: Note;
  report?: Report;
  // Downloaded source cover (base64 data URL) used for display, vision analysis,
  // cover planning and Sharp compositing. Remote XHS URLs are hotlink-protected,
  // so we always render this when available.
  source_cover_data_url?: string;
}

export interface ComplianceIssue {
  term: string;
  type: string;
}

export interface Compliance {
  passed: boolean;
  issues: ComplianceIssue[];
  notice: string;
  cover_error?: string;
  originality?: { passed: boolean; scores: Record<string, number> };
}

export interface VideoShot {
  duration: string;
  visual: string;
  narration: string;
  subtitle: string;
}

export interface Generation {
  id: string;
  status: Status;
  stage: string;
  selected_title: string;
  body?: string;
  video_script?: { shots: VideoShot[] } | null;
  cover_url?: string;
  compliance?: Compliance;
  error?: string;
  created_at?: string;
}

export interface Session {
  session_id: string;
  brief: string;
  titles: string[];
  selected_title?: string;
}

export interface SavedCreation {
  session: Session | null;
  generation: Generation | null;
}

export interface CreationVersion extends Generation {
  created_at: string;
  session_id: string;
  brief: string;
  titles: string[];
}

// ---- BFF / orchestration types ----

export interface NoteSnapshot {
  note_id: string;
  note_type: 'image' | 'video';
  title: string;
  content: string;
  author: { id?: string; name?: string; avatar?: string };
  metrics: { likes: number; collects: number; comments: number };
  images: string[];
  video_url: string | null;
  cover_url: string | null;
}

export interface Comment {
  external_id: string;
  content: string;
  likes: number;
  author_hash: string | null;
  published_at: string | null;
}

export interface CoverPlan {
  cover_type:
    | 'text_only'
    | 'landscape_text'
    | 'person_text'
    | 'product_text'
    | 'food_text'
    | 'space_text'
    | 'other_photo_text';
  subject: string;
  composition: string;
  palette: string;
  title_position: string;
  visual_style: string;
  typography_symbols: string[];
  emphasis_method: string;
  line_break_pattern: string;
}

export interface GeneratedCopy {
  body: string;
  tags: string[];
  video_script: VideoShot[] | null;
}

export interface FetchMediaResult {
  sourceCoverDataUrl: string;
  videoFrames: string[];
}
