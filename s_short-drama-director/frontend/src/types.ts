export type Perspective = '第一人称视角' | '第三人称视角' | '自拍视角'

export type StylePreset =
  | '电影感'
  | '写实'
  | '动画风'
  | '悬疑惊悚'
  | '浪漫抒情'
  | '赛博未来'
  | '国风奇幻'
  | '纪录片感'

export interface StoryboardRequestPayload {
  story: string
  targetDurationSeconds: number
  style: StylePreset
  perspective: Perspective
  characterAppearance?: string
  extraRequirements?: string
}

export interface StoryboardShot {
  id: number
  durationSeconds: number
  sceneDescription: string
  imagePrompt: string
  videoPrompt: string
  note?: string
}

export interface StoryboardResponse {
  source: 'llm'
  title: string
  summary: string
  totalDurationSeconds: number
  characterProfile: string
  shots: StoryboardShot[]
  qualityChecklist: {
    durationsValidated: boolean
    maxShotDurationSeconds: number
    warnings: string[]
  }
}

export interface FormState {
  story: string
  targetDurationSeconds: number
  style: StylePreset
  perspective: Perspective
  characterAppearance: string
  extraRequirements: string
}
