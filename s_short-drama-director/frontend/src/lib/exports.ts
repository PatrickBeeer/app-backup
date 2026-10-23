import type { StoryboardResponse } from '../types'

export function buildMarkdownExport(data: StoryboardResponse) {
  const header = [
    `# ${data.title}`,
    '',
    `- 来源：${data.source === 'llm' ? '实时模型生成' : '本地演示模式'}`,
    `- 总时长：${data.totalDurationSeconds} 秒`,
    `- 镜头数量：${data.shots.length}`,
    `- 角色设定：${data.characterProfile}`,
    '',
    '## 故事摘要',
    '',
    data.summary,
    '',
    '## 分镜脚本',
    '',
    '| 镜头 | 时长 | 场景描述 | 文生图提示词 | 图生视频提示词 | 备注 |',
    '|:----:|:----:|:--------|:------------|:--------------|:----|',
  ]

  const rows = data.shots.map(
    (shot) =>
      `| ${shot.id} | ${shot.durationSeconds} 秒 | ${escapePipe(shot.sceneDescription)} | ${escapePipe(shot.imagePrompt)} | ${escapePipe(shot.videoPrompt)} | ${escapePipe(shot.note || '')} |`,
  )

  const footer = [
    '',
    '## 质检',
    '',
    `- 时长校验：${data.qualityChecklist.durationsValidated ? '通过' : '未通过'}`,
    `- 最大单镜头时长：${data.qualityChecklist.maxShotDurationSeconds} 秒`,
    `- 警告：${data.qualityChecklist.warnings.length > 0 ? data.qualityChecklist.warnings.join('；') : '无'}`,
  ]

  return [...header, ...rows, ...footer].join('\n')
}

function escapePipe(value: string) {
  return value.replaceAll('|', '\\|').replaceAll('\n', '<br />')
}

export function downloadFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
