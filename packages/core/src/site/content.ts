import { createHash } from "node:crypto";
import { copyFile, mkdir, open, readFile, stat } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { SITE_CONTENT_FILE, siteContentSchema, type SiteContent } from "@ibp/shared";
import { hasErrorCode, IbpError } from "../errors";
import { writeFileAtomic } from "../fsutil";

/** Reads and validates a project's site.json; null when the project has no content file. */
export async function readSiteContent(projectPath: string): Promise<SiteContent | null> {
  let raw: string;
  try {
    raw = await readFile(join(projectPath, SITE_CONTENT_FILE), "utf8");
  } catch (error) {
    if (hasErrorCode(error, "ENOENT")) return null;
    throw error;
  }
  const parsed = siteContentSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) throw new IbpError("content_invalid", parsed.error.message.slice(0, 2000));
  return parsed.data;
}

export async function writeSiteContent(projectPath: string, content: SiteContent): Promise<void> {
  const valid = siteContentSchema.parse(content);
  await writeFileAtomic(
    join(projectPath, SITE_CONTENT_FILE),
    `${JSON.stringify(valid, null, 2)}\n`,
  );
}

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Raster formats only: SVG can carry scripts. Checked by content, not just by extension.
const FORMATS: { ext: string; matches(head: Buffer): boolean }[] = [
  {
    ext: "png",
    matches: (h) =>
      h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { ext: "jpg", matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff },
  {
    ext: "webp",
    matches: (h) => h.toString("latin1", 0, 4) === "RIFF" && h.toString("latin1", 8, 12) === "WEBP",
  },
  {
    ext: "avif",
    matches: (h) =>
      h.toString("latin1", 4, 8) === "ftyp" &&
      ["avif", "avis"].includes(h.toString("latin1", 8, 12)),
  },
];

/**
 * Copies a user-picked image into the project's public/images and returns its site path
 * (/images/<name>-<hash>). Refuses non-images, SVG and files over 5 MB. The name includes a
 * content hash, so an existing file with that name already holds the same image.
 */
export async function importImage(projectPath: string, file: string): Promise<string> {
  const info = await stat(file).catch(() => null);
  if (!info?.isFile()) throw new IbpError("image_invalid", `${file} is not a file`);
  if (info.size > MAX_IMAGE_BYTES)
    throw new IbpError("image_invalid", `${basename(file)} is larger than 5 MB`);
  const handle = await open(file, "r");
  const head = Buffer.alloc(16);
  try {
    await handle.read(head, 0, 16, 0);
  } finally {
    await handle.close();
  }
  const format = FORMATS.find((f) => f.matches(head));
  if (!format)
    throw new IbpError("image_invalid", `${basename(file)} is not a PNG, JPEG, WebP or AVIF image`);

  const stem =
    basename(file, extname(file))
      .normalize("NFKD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "imagem";
  const hash = createHash("sha256")
    .update(await readFile(file))
    .digest("hex")
    .slice(0, 8);
  const name = `${stem}-${hash}.${format.ext}`;
  const target = join(projectPath, "public", "images", name);
  await mkdir(join(projectPath, "public", "images"), { recursive: true });
  await copyFile(file, target);
  return `/images/${name}`;
}
