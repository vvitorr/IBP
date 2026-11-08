# IBP — Intent Based Programming

An AI-assisted environment for building, editing and maintaining professional websites with
React and Next.js. People without programming experience describe what they want; developers
keep full access to the same real source code and Git history.

IBP runs as a **desktop app** (Electron) and as a **VS Code extension** (VS Code, Cursor,
VSCodium). Both share one core and offer the same features. Generated sites use **Vite + React**
or **Next.js**, with TypeScript and Tailwind CSS.

## What works today

- **Projects** — create a site from the Vite or Next.js starter (with Git and a first commit),
  open an existing React project, edit its details, archive it.
- **Live preview** — runs the project's real dev server on `127.0.0.1` and shows it inside the
  app at desktop, tablet and mobile sizes, with refresh, restart, log and "open in browser".
- **AI models** — OpenRouter, Ollama, LM Studio, FreeLLMAPI or any OpenAI-compatible service,
  with your own keys. Test connections, see each model's capabilities, set an order of use;
  automatic routing falls back to the next model when one fails or hits its limit.
- **Assistant** — with no project selected it answers questions. With a project selected it is
  a coding agent: it reads, creates and edits the project's files, asks before deleting files,
  changing configuration or installing packages, and ends with a diff of every change. **Accept**
  commits only the files it touched; **Revert** puts them back exactly.
- Interface in Portuguese (Portugal) by default, or English; dark or light theme.

Not yet: generating a whole site from a description, click-to-edit on the preview, a built-in
code editor and terminal in the desktop app, automated quality checks and deployment. See
[docs/roadmap.md](docs/roadmap.md) for the status of every item, including what has only been
tested against a fake model server so far.

## Quick start (desktop app)

Requirements: macOS (Windows and Linux are not tested yet), Node.js 22 or newer, pnpm 12, git.
Generated sites use npm.

```bash
pnpm install
```

```bash
pnpm dev:desktop
```

Then, in the app:

1. Create a website project, or open an existing one.
2. In **Pré-visualização**, install the dependencies and press **Ver site**.
3. Open **Definições** (gear icon) → **Modelos de IA**, add a provider, paste your key and press
   **Testar ligação**. For the coding agent, use a model whose **Ferramentas** column says **Sim**.
4. In the **Assistente** tab, ask for a change. Review the diff, then **Aceitar** or **Reverter**.

## Development

```bash
pnpm build            # Studio UI (Vite) + extension + desktop app (esbuild) + templates
pnpm typecheck
pnpm lint
pnpm format:check
pnpm test             # unit tests (Vitest)
pnpm test:desktop     # Playwright tests driving the desktop app
pnpm test:ext         # integration test inside the installed VS Code
pnpm package:desktop  # apps/desktop/out/IBP-<platform>-<arch>/ (unsigned)
pnpm package          # apps/extension/ibp.vsix
```

`IBP_E2E_FULL=1 pnpm --filter ibp-desktop test` also runs the slow test that installs real npm
packages and checks the live preview.

### VS Code extension

Requires VS Code 1.125 or newer. Open this folder in VS Code and launch an Extension Development
Host for `apps/extension`, or from a terminal on macOS:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --extensionDevelopmentPath="$PWD/apps/extension"
```

Then run **IBP: Open Studio** from the Command Palette.

## Security

- API keys are stored only in the operating system's keychain (desktop: Electron `safeStorage`,
  which keeps an encrypted `secrets.json`; extension: VS Code `SecretStorage`). They are never
  shown in the interface, logged or written in plain text.
- The coding agent works only inside the project folder, never reads secret files such as `.env`,
  and needs your approval for deletions, configuration changes and package installs.
- Prompts and the files the agent reads are sent to the model provider you choose; local
  providers (Ollama, LM Studio) keep them on your machine.

Details and known limitations: [docs/architecture/security.md](docs/architecture/security.md).

## Repository

| Path                    | Contents                                                              |
| ----------------------- | --------------------------------------------------------------------- |
| `apps/desktop`          | Desktop app (Electron main process, preload, packaging)               |
| `apps/extension`        | VS Code extension                                                     |
| `apps/webview`          | IBP Studio UI (React), used by both                                   |
| `packages/core`         | Host-agnostic services: Studio controller, projects, dev servers, AI  |
| `packages/model-router` | Model layer: OpenAI-compatible client, presets, probes, router        |
| `packages/agent`        | Coding agent: loop, tools, guarded workspace with change journal      |
| `packages/shared`       | Message protocol and translations                                     |
| `templates/`            | Starter websites: `shared` sections + `base-vite-react` / `base-next` |
| `docs/`                 | Architecture, decisions, security, research, roadmap                  |

## License

No license has been chosen yet, so all rights are reserved by the author.
