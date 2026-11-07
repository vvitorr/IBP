import { projectDetailsSchema } from "@ibp/shared";
import { z } from "zod";

// Data at rest uses non-strict objects so files written by newer versions still load.

/** One entry of the local project registry (globalStorage/projects.json). */
export const projectRecordSchema = z.object({
  id: z.uuid(),
  path: z.string().min(1),
  name: z.string(),
  archived: z.boolean(),
  addedAt: z.string(),
  lastOpenedAt: z.string().nullable(),
});
export type ProjectRecord = z.infer<typeof projectRecordSchema>;

export const registrySchema = z.object({
  version: z.literal(1),
  projects: z.array(projectRecordSchema),
});

/** `.ibp/project.json` inside each project. Committed with the project, so never put secrets here. */
export const projectMetadataSchema = z.object({
  ...projectDetailsSchema.shape,
  schemaVersion: z.literal(1),
  id: z.uuid(),
  stack: z.string().min(1).max(80),
  template: z.string().max(80).nullable(),
  createdAt: z.string(),
});
export type ProjectMetadata = z.infer<typeof projectMetadataSchema>;
