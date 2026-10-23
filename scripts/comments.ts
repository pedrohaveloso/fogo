const CHECKED_FILE = /(^|\/)(src|scripts)\/.+\.(ts|tsx|css)$/;
const COMMENT_LINE = /^\s*(\/\/|\/\*|\{\s*\/\*)/;

export type ToolInput = {
  file_path?: string;
  content?: string;
  new_string?: string;
  edits?: { new_string?: string }[];
};

export function isCheckedFile(path: string): boolean {
  return CHECKED_FILE.test(path);
}

export function firstCommentLine(text: string): number | null {
  const index = text.split("\n").findIndex((line) => COMMENT_LINE.test(line));
  return index === -1 ? null : index + 1;
}

export function commentViolation(input: ToolInput): string | null {
  if (!input.file_path || !isCheckedFile(input.file_path)) {
    return null;
  }
  const texts = [
    input.content,
    input.new_string,
    ...(input.edits ?? []).map((edit) => edit.new_string),
  ];
  for (const text of texts) {
    const line = text === undefined ? null : firstCommentLine(text);
    if (line !== null) {
      return `${input.file_path}: comentário na linha ${line} do trecho escrito. O projeto não usa comentários no código; renomeie ou extraia em vez de explicar.`;
    }
  }
  return null;
}
