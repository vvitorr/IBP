import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type { Locale } from "@ibp/shared";

/**
 * Builds the Studio page. The CSP allows only our bundled script (by nonce) and our own
 * stylesheet/images; no inline scripts, no remote origins, no frames in Phase 1.
 */
export function renderStudioHtml(
  webview: vscode.Webview,
  root: vscode.Uri,
  locale: Locale,
): string {
  const nonce = randomBytes(16).toString("base64");
  const script = webview.asWebviewUri(vscode.Uri.joinPath(root, "assets", "main.js"));
  const style = webview.asWebviewUri(vscode.Uri.joinPath(root, "assets", "main.css"));
  const csp = [
    "default-src 'none'",
    `img-src ${webview.cspSource} data:`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join("; ");

  return `<!doctype html>
<html lang="${locale}">
  <head>
    <meta charset="utf-8" />
    <meta http-equiv="Content-Security-Policy" content="${csp}" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="stylesheet" href="${style.toString()}" />
    <title>IBP Studio</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" nonce="${nonce}" src="${script.toString()}"></script>
  </body>
</html>`;
}
