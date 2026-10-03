const ATTRIBUTE_ENTRY_RE = /^:[A-Za-z0-9_][A-Za-z0-9_-]*!?:/;

function isSkippable(line: string): boolean {
  return line.trim() === '' || (line.startsWith('//') && !line.startsWith('////'));
}

/**
 * The document header as a line range [start, end): the `= Title` line and
 * the author/revision/attribute lines directly under it, or - without a
 * title - the attribute entries at the very top. Lines after the first blank
 * line belong to the body, where an attribute-looking line (for example in
 * a code listing) must never be touched.
 */
function headerRange(lines: string[]): { start: number; end: number; hasTitle: boolean } {
  let start = 0;
  while (start < lines.length && isSkippable(lines[start])) start += 1;
  const hasTitle = /^=\s+\S/.test(lines[start] ?? '');
  let end = start;
  if (hasTitle) {
    end += 1;
    while (end < lines.length && lines[end].trim() !== '') end += 1;
  } else {
    while (end < lines.length && ATTRIBUTE_ENTRY_RE.test(lines[end])) end += 1;
  }
  return { start, end, hasTitle };
}

/**
 * Sets a document header attribute (`:name: value`) so the deck stays
 * self-describing: updates the header's existing entry, or appends one to the
 * header (after the title, author, and revision lines Asciidoctor reads from
 * directly under the title), or starts a header when there is none.
 */
export function withHeaderAttribute(source: string, name: string, value: string): string {
  const line = `:${name}: ${value}`;
  const lines = source.split('\n');
  const { start, end, hasTitle } = headerRange(lines);
  const entry = new RegExp(`^:${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
  const existing = lines.slice(start, end).findIndex((text) => entry.test(text));
  if (existing !== -1) {
    lines[start + existing] = line;
    return lines.join('\n');
  }
  if (!hasTitle && end === start) return `${line}\n\n${source}`;
  lines.splice(end, 0, line);
  return lines.join('\n');
}
