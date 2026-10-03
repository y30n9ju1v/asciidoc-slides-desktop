/** Bounded, one-based line selection; no ranges can allocate unbounded arrays. */
export function parseCodeHighlights(value: unknown): number[] {
  if (typeof value !== 'string') return [];
  const lines = new Set<number>();
  for (const part of value.split(';').slice(0, 100)) {
    const match = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!match) continue;
    const start = Number(match[1]);
    const end = Number(match[2] ?? match[1]);
    if (start < 1 || end > 1000 || end < start) continue;
    for (let line = start; line <= end; line++) lines.add(line);
  }
  return [...lines].sort((a, b) => a - b);
}
