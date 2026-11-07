import { IbpError } from "../errors";

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/;

/**
 * Turns a display name into a safe folder name: lowercase ASCII letters, digits and dashes.
 * The result can never contain path separators or "..", so it cannot escape the parent folder.
 */
export function toFolderName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/, "");
  if (!slug) throw new IbpError("invalid_name", name);
  return WINDOWS_RESERVED.test(slug) ? `${slug}-site` : slug;
}
