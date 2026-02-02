export function isPasswordConfigured(): boolean {
  const password = process.env.NEXT_PUBLIC_VOICE_PASSWORD
  return !!password && password.length > 0
}

export function validatePassword(input: string): boolean {
  const password = process.env.NEXT_PUBLIC_VOICE_PASSWORD
  if (!password) return false
  return input === password
}
