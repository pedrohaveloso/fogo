import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TestProject } from "vitest/node";
import { TEMPLATE_NAMES, buildTemplate } from "./test-database.ts";

export default async function setup(project: TestProject) {
  const dir = await mkdtemp(join(tmpdir(), "fogo-test-"));
  for (const name of TEMPLATE_NAMES) {
    const blob = await buildTemplate(name);
    await writeFile(join(dir, `${name}.tar`), Buffer.from(await blob.arrayBuffer()));
  }
  project.provide("templateDir", dir);
  return () => rm(dir, { recursive: true, force: true });
}
