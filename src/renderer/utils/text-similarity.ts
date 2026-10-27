function bigrams(text: string): Map<string, number> {
  const s = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  const map = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const g = s.slice(i, i + 2)
    map.set(g, (map.get(g) ?? 0) + 1)
  }
  return map
}

/** Share (0..1) of `part`'s character bigrams that also occur in `whole` */
export function containment(part: string, whole: string): number {
  const A = bigrams(part)
  const B = bigrams(whole)
  let total = 0
  let found = 0
  for (const [g, n] of A) {
    total += n
    found += Math.min(n, B.get(g) ?? 0)
  }
  return total === 0 ? 0 : found / total
}
