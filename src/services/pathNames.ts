/** Pure path-name helpers shared by the file tree, exports, and asset typing. Both separators are accepted. */

/** The last path component, ignoring trailing separators ("" for an empty path). */
export function baseName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? '';
}

/** Lower-case extension of the last component without the dot; "" when it has none (or is a dotfile). */
export function fileExtension(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** The last component without its extension. */
export function stemName(path: string): string {
  const name = baseName(path);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** Looks up `key` in a plain record without reaching inherited properties such as `constructor`. */
export function ownValue<T>(record: Record<string, T>, key: string): T | null {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : null;
}
