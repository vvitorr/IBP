import * as assert from "node:assert";
import * as vscode from "vscode";
import type { IbpApi } from "../../src/extension";

function timeout(ms: number, what: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(`Timed out: ${what}`)), ms));
}

suite("IBP extension", () => {
  test("activates, opens the Studio and the webview loads under the CSP", async () => {
    const extension = vscode.extensions.getExtension<IbpApi>("vvitorr.ibp");
    assert.ok(extension, "extension vvitorr.ibp is installed");
    const api = await extension.activate();

    const ready = api.whenStudioReady();
    await vscode.commands.executeCommand("ibp.openStudio");
    // "ready" is posted by the bundled React app, so this proves script + CSP + message bridge.
    await Promise.race([ready, timeout(20_000, "Studio webview ready")]);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(commands.includes("ibp.newProject"));
  });
});
