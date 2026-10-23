import type { Perspective, StylePreset } from './types'

export const styleOptions: Array<{
  value: StylePreset
  label: string
  description: string
}> = [
  {
    value: '电影感',
    label: '电影感',
    description: '重氛围、重光影、强调镜头调度。',
  },
  {
    value: '写实',
    label: '写实',
    description: '贴近日常环境，适合生活流和剧情片。',
  },
  {
    value: '动画风',
    label: '动画风',
    description: '适合夸张表情与风格化动作设计。',
  },
  {
    value: '悬疑惊悚',
    label: '悬疑惊悚',
    description: '强化压迫感、留白与反转预期。',
  },
  {
    value: '浪漫抒情',
    label: '浪漫抒情',
    description: '偏细腻情绪与柔和节奏。',
  },
  {
    value: '赛博未来',
    label: '赛博未来',
    description: '适合科技感、霓虹色与未来场景。',
  },
  {
    value: '国风奇幻',
    label: '国风奇幻',
    description: '适合中式视觉与神话气质。',
  },
  {
    value: '纪录片感',
    label: '纪录片感',
    description: '强调真实观察视角和现场感。',
  },
]

export const perspectiveOptions: Array<{
  value: Perspective
  label: string
  description: string
}> = [
  {
    value: '第三人称视角',
    label: '第三人称',
    description: '最稳定，适合大多数叙事分镜。',
  },
  {
    value: '第一人称视角',
    label: '第一人称',
    description: '沉浸感强，但要严格避免正脸全貌。',
  },
  {
    value: '自拍视角',
    label: '自拍视角',
    description: '适合短视频表达，需保持视角物理一致。',
  },
]

export const defaultFormState = {
  story: '',
  targetDurationSeconds: 30,
  style: '电影感' as StylePreset,
  perspective: '第三人称视角' as Perspective,
  characterAppearance: '',
  extraRequirements: '',
}

export const appStorageKey = 'ai-short-drama-director:form'
