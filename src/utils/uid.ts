/**
 * 生成不冲突的 UID 对
 * @returns userUid 和 agentUid，保证两者不相等
 */
export function generateUids(): { userUid: number; agentUid: number } {
  const userUid = Math.floor(Math.random() * 100000)
  let agentUid = Math.floor(Math.random() * 100000)
  while (agentUid === userUid) {
    agentUid = Math.floor(Math.random() * 100000)
  }
  return { userUid, agentUid }
}
