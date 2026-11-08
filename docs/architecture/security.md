# Security

## Trust zones

| Zone                                                   | Trust                      | Can do                                           | Must never                                                                                  |
| ------------------------------------------------------ | -------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Host (Electron main process or VS Code extension host) | Trusted                    | File system, git, processes, network, secrets    | Execute input from other zones without validation and, for high-risk actions, user approval |
| Studio UI (renderer / webview)                         | Untrusted UI               | Send typed requests                              | Hold secrets, send paths or URLs, run commands                                              |
| Preview iframe                                         | Untrusted (generated code) | Render the site; post selection events (Phase 5) | Reach the host directly or trigger privileged actions                                       |
| LLM output (Phase 2+)                                  | Untrusted                  | Propose tool calls                               | Run high-risk tools without approval                                                        |
| Project files                                          | Untrusted input            | Be read as data                                  | Be treated as instructions or executed by IBP                                               |

## Controls in place (Phase 1 + Milestone A)

- **Webview CSP:** `default-src 'none'`; scripts only by per-load nonce; styles, images and fonts
  only from the extension's `dist/webview`; no frames, no remote origins.
  `localResourceRoots` is limited to `dist/webview`.
- **Message validation:** every webview message is parsed with zod `strictObject` schemas
  (`packages/shared/src/protocol.ts`). Unknown types, extra fields and non-uuid ids are rejected.
  The host also validates its own state messages on the webview side.
- **No paths from the webview:** requests carry project ids; paths come from the host registry or
  native folder dialogs. `ibp.projectsRoot` cannot be changed from the webview.
- **Folder names:** derived by `toFolderName` (lowercase ASCII, digits, dashes, max 64 chars), so
  they cannot contain separators or `..`. Windows reserved names get a suffix.
- **No overwrite:** project creation uses `mkdir` without `recursive` (fails on existing folders)
  and copies with `force: false`. A failed create removes only the folder it created.
- **Template filling:** user values are JSON-encoded into TypeScript and HTML-escaped into
  `index.html`, never pasted raw into code.
- **Commands:** git runs through `execFile` with an argument array (no shell),
  `GIT_TERMINAL_PROMPT=0` and a 30 s timeout. `npm install` runs only after a modal confirmation,
  as a fixed string in a visible terminal whose `cwd` comes from the registry.
- **Untrusted files:** `.ibp/project.json` and the registry are schema-validated when read; a
  damaged registry is moved aside instead of overwritten.
- **API keys (Phase 2):** stored only through the host's secret storage — desktop: Electron
  `safeStorage` async API, ciphertext in `userData/secrets.json`, decryption key in the OS
  keychain; VS Code: `SecretStorage`. The key travels once from the Studio to the host
  (`ai/provider/setKey`) and is never sent back (the UI gets `hasKey`), never logged, and
  redacted from provider error messages. It is sent only as `Authorization: Bearer` to the
  provider's own base URL, which must be `https://` (or `http://` on loopback). Tests assert the
  key appears in no posted message, log or file in plain text (unit and desktop e2e).
- **Model traffic:** only the host calls providers; the Studio keeps `connect-src 'none'`.
  Usage logs hold counts and token numbers, never prompts or answers.
- **Desktop app (Electron):** Studio served from `ibp://studio` (custom secure scheme, file
  lookups confined to the bundled renderer folder), `contextIsolation`, `sandbox`, no
  `nodeIntegration`; preload exposes only `postMessage`/`onMessage`; the main process accepts IPC
  only from its own window's `ibp://studio/…` frame; all permission requests and checks denied;
  `will-navigate` blocked; new windows denied; CSP
  `default-src 'none'; script-src 'self'; style-src 'self'; frame-src http://127.0.0.1:*;
connect-src 'none'`. Single-instance lock so two windows never write the same registry.
- **Preview:** dev servers bind to `127.0.0.1` on a free port; the iframe is cross-origin and
  sandboxed (`allow-scripts allow-same-origin allow-forms`: no top navigation, no popups); the
  Studio drops window messages from `http://127.0.0.1`; preview URLs in state must match
  `http://127.0.0.1:<port>/`; "Open in browser" only opens the running preview URL, never one sent
  by the UI.
- **Processes:** `npm` runs with argument arrays and no shell (macOS/Linux) in its own process
  group, killed as a group (SIGTERM, then SIGKILL after 5 s) on stop, project switch and window
  close. On Windows npm needs a shell; arguments are fixed values (to be revisited in Phase 8).
- **Login-shell PATH:** apps opened from the Dock lack the user's PATH, so IBP runs
  `$SHELL -ilc` once to read it (as VS Code does). This executes the user's shell startup files
  with the user's rights.
- **Test hooks:** `IBP_TEST_MODE=1` makes the desktop folder picker and confirmations answer from
  environment variables. Anyone who can set the app's environment already controls the process.

## Planned controls

- Phase 2 (done): see "API keys" above. Linux without a keyring falls back to a hard-coded key;
  the UI warns. Remaining: never logged, never sent to the webview (the UI sees
  "configured: yes/no"); redact keys from error details.
- Phase 3: tool registry with risk levels. Approval required for: deleting files, installing
  packages, editing config/deploy/env files, running shell commands, network access. File tools
  resolve real paths and refuse anything outside the project root (symlink-aware). Context
  collector excludes `.env*`, keys, `node_modules`, build output and binaries.
- Phase 5: Studio accepts only `selection` messages from the preview iframe, validated by schema.
- Phase 7: deploy tokens in `SecretStorage`; production deploys need explicit approval; tokens
  never reach the generated site.

## Known limitations

- **No OS sandbox.** The host and anything it launches (npm, dev servers) run with the user's
  permissions.
- **Unsigned desktop builds.** macOS Gatekeeper warns until the app is signed and notarized
  (needs an Apple Developer ID).
- **`npm install` runs lifecycle scripts** of the generated project's dependencies.
- **The dev server listens on localhost**, reachable by other local processes.
- **Windows DPAPI** protects keys from other users, not from other apps running as the same user.
- **Prompts go to the chosen provider.** Chat text (and later project code) leaves the machine
  unless a local provider (Ollama, LM Studio) is used.
- **Free model providers may log prompts** (FreeLLMAPI notes this for FreeInference). Users must
  not send client secrets or personal data through them.
- **Prompt injection:** project files or web content can contain instructions aimed at the agent.
  Approvals for high-risk tools are the backstop; the agent must treat file content as data.
- **VS Code preview iframe** to `127.0.0.1` relies on VS Code webviews allowing loopback frames;
  verified in the desktop app, not yet by an automated VS Code test.
- **`vscode.openFolder` reloads the window**, so unsaved editor state follows VS Code's normal
  behaviour (VS Code prompts before losing changes).
