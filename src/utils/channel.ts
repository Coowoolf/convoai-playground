/**
 * 生成唯一的频道名称
 * @param prefix 频道前缀，默认 'aura'
 * @returns 格式: {prefix}-{timestamp}-{random}
 */
export function generateChannelName(prefix: string = 'aura'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}
