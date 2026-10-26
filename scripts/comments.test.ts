import { describe, expect, it } from "vitest";
import { commentViolation, firstCommentLine, isCheckedFile } from "./comments.ts";

describe("isCheckedFile", () => {
  it("checks code and styles under src and scripts only", () => {
    expect(isCheckedFile("/home/x/fogo/src/web/App.tsx")).toBe(true);
    expect(isCheckedFile("src/server/operations.ts")).toBe(true);
    expect(isCheckedFile("scripts/dev.ts")).toBe(true);
    expect(isCheckedFile("src/web/styles.css")).toBe(true);
    expect(isCheckedFile("README.md")).toBe(false);
    expect(isCheckedFile("src/web/index.html")).toBe(false);
    expect(isCheckedFile("vite.config.ts")).toBe(false);
  });
});

describe("firstCommentLine", () => {
  it("finds comments that start a line", () => {
    expect(firstCommentLine("const a = 1;\n  // why")).toBe(2);
    expect(firstCommentLine("/* block */\nconst a = 1;")).toBe(1);
    expect(firstCommentLine("<div>\n  {/* jsx */}\n</div>")).toBe(2);
  });

  it("ignores urls, strings and code that only contains slashes", () => {
    expect(firstCommentLine('const url = "https://example.com";')).toBeNull();
    expect(firstCommentLine("const ratio = a / b;\nconst re = /\\/+/;")).toBeNull();
    expect(firstCommentLine("")).toBeNull();
  });
});

describe("commentViolation", () => {
  it("reports the file and line for writes and edits", () => {
    expect(
      commentViolation({ file_path: "src/web/a.ts", content: "const a = 1;\n// note" }),
    ).toContain("src/web/a.ts: comentário na linha 2");
    expect(commentViolation({ file_path: "src/web/a.ts", new_string: "// note" })).toContain(
      "linha 1",
    );
    expect(
      commentViolation({
        file_path: "src/web/a.ts",
        edits: [{ new_string: "const b = 2;" }, { new_string: "  /* note */" }],
      }),
    ).toContain("linha 1");
  });

  it("allows clean code, unchecked files and missing input", () => {
    expect(commentViolation({ file_path: "src/web/a.ts", new_string: "const b = 2;" })).toBeNull();
    expect(commentViolation({ file_path: "README.md", content: "// fine in docs" })).toBeNull();
    expect(commentViolation({})).toBeNull();
    expect(commentViolation({ file_path: "src/web/a.ts", edits: [{}] })).toBeNull();
  });
});
