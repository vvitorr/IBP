import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { hasErrorCode, IbpError } from "../errors";
import { writeFileAtomic } from "../fsutil";
import { projectMetadataSchema, type ProjectMetadata } from "./types";

export const METADATA_DIR = ".ibp";

export function metadataPath(projectDir: string): string {
  return join(projectDir, METADATA_DIR, "project.json");
}

/** Returns null when the project has no metadata yet. The file is untrusted input. */
export async function readMetadata(projectDir: string): Promise<ProjectMetadata | null> {
  let raw: string;
  try {
    raw = await readFile(metadataPath(projectDir), "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
  try {
    return projectMetadataSchema.parse(JSON.parse(raw));
  } catch (error) {
    throw new IbpError("invalid_metadata", `${metadataPath(projectDir)}: ${String(error)}`);
  }
}

export async function writeMetadata(projectDir: string, metadata: ProjectMetadata): Promise<void> {
  await writeFileAtomic(metadataPath(projectDir), `${JSON.stringify(metadata, null, 2)}\n`);
}
