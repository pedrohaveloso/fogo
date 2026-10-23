import { commentViolation, type ToolInput } from "./comments.ts";

let raw = "";
for await (const chunk of process.stdin) {
  raw += String(chunk);
}

const event = JSON.parse(raw) as { tool_input?: ToolInput };
const violation = commentViolation(event.tool_input ?? {});
if (violation) {
  process.stderr.write(`${violation}\n`);
  process.exitCode = 2;
}
