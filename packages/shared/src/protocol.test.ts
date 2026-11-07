import { describe, expect, it } from "vitest";
import { hostMessageSchema, webviewMessageSchema } from "./protocol.ts";

const id = "6f1c2b8e-3d4a-4f5b-9c6d-7e8f9a0b1c2d";
const details = { name: "Tasca do Zé", client: "José", industry: "restaurant", description: "" };

describe("webviewMessageSchema", () => {
  it("accepts every well-formed request", () => {
    const valid = [
      { type: "ready" },
      { type: "projects/list", requestId: "1" },
      { type: "projects/create", requestId: "2", details },
      { type: "projects/import", requestId: "3" },
      { type: "projects/open", requestId: "4", id },
      { type: "projects/update", requestId: "5", id, details },
      { type: "projects/setArchived", requestId: "6", id, archived: true },
      { type: "projects/installDeps", requestId: "7", id },
      { type: "projects/openCode", requestId: "8", id },
      { type: "projects/openTerminal", requestId: "9", id },
      { type: "settings/update", requestId: "10", update: { key: "language", value: "en" } },
    ];
    for (const message of valid) expect(webviewMessageSchema.safeParse(message).success).toBe(true);
  });

  it("rejects unknown message types", () => {
    expect(webviewMessageSchema.safeParse({ type: "shell/exec", requestId: "1" }).success).toBe(
      false,
    );
  });

  it("rejects extra fields such as a smuggled path", () => {
    const message = { type: "projects/open", requestId: "1", id, path: "/etc" };
    expect(webviewMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects ids that are not uuids", () => {
    const message = { type: "projects/open", requestId: "1", id: "../../etc" };
    expect(webviewMessageSchema.safeParse(message).success).toBe(false);
  });

  it("rejects settings outside the allowlist", () => {
    const pathSetting = { key: "projectsRoot", value: "/tmp" };
    const badValue = { key: "language", value: "fr" };
    for (const update of [pathSetting, badValue]) {
      const message = { type: "settings/update", requestId: "1", update };
      expect(webviewMessageSchema.safeParse(message).success).toBe(false);
    }
  });

  it("rejects blank or oversized project names", () => {
    for (const name of ["   ", "x".repeat(81)]) {
      const message = { type: "projects/create", requestId: "1", details: { ...details, name } };
      expect(webviewMessageSchema.safeParse(message).success).toBe(false);
    }
  });

  it("trims project details", () => {
    const message = {
      type: "projects/create",
      requestId: "1",
      details: { ...details, name: "  Café Central  " },
    };
    const parsed = webviewMessageSchema.parse(message);
    expect(parsed.type === "projects/create" && parsed.details.name).toBe("Café Central");
  });
});

describe("hostMessageSchema", () => {
  it("accepts success and failure responses", () => {
    expect(
      hostMessageSchema.safeParse({ type: "response", requestId: "1", ok: true }).success,
    ).toBe(true);
    const failure = { type: "response", requestId: "1", ok: false, error: { code: "io_error" } };
    expect(hostMessageSchema.safeParse(failure).success).toBe(true);
  });

  it("rejects failures with unknown error codes", () => {
    const failure = { type: "response", requestId: "1", ok: false, error: { code: "boom" } };
    expect(hostMessageSchema.safeParse(failure).success).toBe(false);
  });
});
