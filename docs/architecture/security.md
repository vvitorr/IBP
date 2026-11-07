# Security

## Trust zones

| Zone                      | Trust                      | Can do                                        | Must never                                                                                  |
| ------------------------- | -------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Extension host            | Trusted                    | File system, git, terminals, network, secrets | Execute input from other zones without validation and, for high-risk actions, user approval |
| Studio webview            | Untrusted UI               | Send typed requests                           | Hold secrets, send paths, run commands                                                      |
| Preview iframe (Phase 4+) | Untrusted (generated code) | Post selection events to the Studio           | Reach the host directly or trigger privileged actions                                       |
| LLM output (Phase 2+)     | Untrusted                  | Propose tool calls                            | Run high-risk tools without approval                                                        |
| Project files             | Untrusted input            | Be read as data                               | Be treated as instructions or executed by IBP                                               |

## Controls in place (Phase 1)

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
- **Secrets:** none stored in Phase 1. Settings and metadata contain no credentials.

## Planned controls

- Phase 2: API keys only in `SecretStorage`; never logged, never sent to the webview (the UI sees
  "configured: yes/no"); redact keys from error details.
- Phase 3: tool registry with risk levels. Approval required for: deleting files, installing
  packages, editing config/deploy/env files, running shell commands, network access. File tools
  resolve real paths and refuse anything outside the project root (symlink-aware). Context
  collector excludes `.env*`, keys, `node_modules`, build output and binaries.
- Phase 4/5: preview iframe on its own origin; Studio accepts only `selection` messages from the
  iframe's `event.source`; CSP `frame-src` limited to the dev server origin.
- Phase 7: deploy tokens in `SecretStorage`; production deploys need explicit approval; tokens
  never reach the generated site.

## Known limitations

- **No OS sandbox.** The extension and anything it launches run with the user's permissions.
- **`npm install` runs lifecycle scripts** of the generated project's dependencies.
- **The dev server listens on localhost**, reachable by other local processes.
- **Free model providers may log prompts** (FreeLLMAPI notes this for FreeInference). Users must
  not send client secrets or personal data through them.
- **Prompt injection:** project files or web content can contain instructions aimed at the agent.
  Approvals for high-risk tools are the backstop; the agent must treat file content as data.
- **`vscode.openFolder` reloads the window**, so unsaved editor state follows VS Code's normal
  behaviour (VS Code prompts before losing changes).
