export type SeedanceModel = 'doubao-seedance-2-0-260128' | 'doubao-seedance-2-0-fast-260128';

export type ExperienceMode =
  | 'text_to_video'
  | 'image_first_frame'
  | 'image_first_last'
  | 'multimodal_reference'
  | 'video_extend';

export type ContentType = 'text' | 'image_url' | 'video_url' | 'audio_url' | 'draft_task';

export type ContentRole = '' | 'first_frame' | 'last_frame' | 'reference_image' | 'reference_video' | 'reference_audio';

export interface ContentItemDraft {
  id: string;
  type: ContentType;
  role: ContentRole;
  value: string;
}

export interface SeedanceCreatePayload {
  model: SeedanceModel;
  content: Array<Record<string, unknown>>;
  resolution?: '480p' | '720p' | '1080p';
  ratio?: 'adaptive' | '21:9' | '16:9' | '4:3' | '1:1' | '3:4' | '9:16';
  duration?: number;
  frames?: number;
  seed?: number;
  camera_fixed?: boolean;
  watermark?: boolean;
  generate_audio?: boolean;
  return_last_frame?: boolean;
  service_tier?: 'default' | 'flex';
  execution_expires_after?: number;
  safety_identifier?: string;
  draft?: boolean;
  tools?: Array<{type: 'web_search'}>;
  [key: string]: unknown;
}

export interface SeedanceTaskResponse {
  id: string;
  model?: string;
  status?: string;
  error?: {
    code?: string;
    message?: string;
  } | null;
  content?: {
    video_url?: string;
    last_frame_url?: string;
    [key: string]: unknown;
  };
  usage?: {
    completion_tokens?: number;
    total_tokens?: number;
    tool_usage?: {
      web_search?: number;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export type SeedreamModel =
  | 'doubao-seedream-5-0-260128'
  | 'doubao-seedream-5-0-lite-260128'
  | 'doubao-seedream-4-5-251128'
  | 'doubao-seedream-4-0-250828';

export interface SeedreamGeneratePayload {
  model: SeedreamModel;
  prompt: string;
  image?: string;
  size?: string;
  output_format?: 'png' | 'jpeg';
  response_format?: 'url' | 'b64_json';
  watermark?: boolean;
  [key: string]: unknown;
}

export interface SeedreamGenerateResponse {
  created?: number;
  data?: Array<{
    url?: string;
    b64_json?: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
