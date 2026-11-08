import { readFile } from "node:fs/promises";
import { safeStorage } from "electron";
import type { SecureStorageStatus } from "@ibp/shared";
import { hasErrorCode, IbpError, writeFileAtomic, type SecretVault } from "@ibp/core";

/**
 * API keys encrypted with Electron safeStorage (macOS Keychain, Windows DPAPI, Linux
 * libsecret/kwallet) and stored as ciphertext in `secrets.json`. Uses the async API
 * (the sync one is removed in Electron 46). Call only after `app` is ready.
 */
export class SafeSecretVault implements SecretVault {
  private cachedStatus: SecureStorageStatus | undefined;

  constructor(private readonly file: string) {}

  async status(): Promise<SecureStorageStatus> {
    if (!this.cachedStatus) {
      if (!(await safeStorage.isAsyncEncryptionAvailable())) this.cachedStatus = "unavailable";
      else if (
        process.platform === "linux" &&
        safeStorage.getSelectedStorageBackend() === "basic_text"
      ) {
        this.cachedStatus = "weak"; // hard-coded key: warn the user
      } else this.cachedStatus = "os";
    }
    return this.cachedStatus;
  }

  async get(key: string): Promise<string | undefined> {
    const encoded = (await this.read())[key];
    if (!encoded) return undefined;
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      Buffer.from(encoded, "base64"),
    );
    if (shouldReEncrypt) await this.set(key, result);
    return result;
  }

  async set(key: string, value: string): Promise<void> {
    if ((await this.status()) === "unavailable") throw new IbpError("secret_storage_unavailable");
    const encrypted = await safeStorage.encryptStringAsync(value);
    await this.write({ ...(await this.read()), [key]: encrypted.toString("base64") });
  }

  async delete(key: string): Promise<void> {
    const all = await this.read();
    if (!(key in all)) return;
    await this.write(Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
  }

  private async read(): Promise<Record<string, string>> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, "utf8"));
      return typeof parsed === "object" && parsed !== null
        ? (parsed as Record<string, string>)
        : {};
    } catch (error) {
      if (hasErrorCode(error, "ENOENT")) return {};
      throw error;
    }
  }

  private async write(all: Record<string, string>): Promise<void> {
    await writeFileAtomic(this.file, `${JSON.stringify(all, null, 2)}\n`);
  }
}
