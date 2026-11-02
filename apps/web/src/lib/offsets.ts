/**
 * Builds a converter from UTF-8 byte offsets (what the Rust parser reports) to
 * UTF-16 string indexes (what JavaScript and CodeMirror use).
 */
export function byteOffsetMapper(text: string): (byteOffset: number) => number {
  const byteAt: number[] = [];
  let bytes = 0;
  let index = 0;
  while (index < text.length) {
    const point = text.codePointAt(index) ?? 0;
    const units = point > 0xffff ? 2 : 1;
    byteAt.push(bytes, index);
    bytes += point < 0x80 ? 1 : point < 0x800 ? 2 : point < 0x10000 ? 3 : 4;
    index += units;
  }
  byteAt.push(bytes, text.length);

  return (byteOffset: number) => {
    if (byteOffset <= 0) {
      return 0;
    }
    let low = 0;
    let high = byteAt.length / 2 - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (byteAt[mid * 2]! <= byteOffset) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return byteAt[low * 2 + 1]!;
  };
}

export interface LineColumn {
  line: number;
  column: number;
}

/** 1-based line and column of a UTF-16 index. */
export function lineColumnAt(text: string, index: number): LineColumn {
  const clamped = Math.max(0, Math.min(index, text.length));
  let line = 1;
  let lineStart = 0;
  for (let at = 0; at < clamped; at += 1) {
    if (text.charCodeAt(at) === 10) {
      line += 1;
      lineStart = at + 1;
    }
  }
  return { line, column: clamped - lineStart + 1 };
}

export function leadingWhitespace(text: string): number {
  return text.length - text.trimStart().length;
}
