# IBP — Intent Based Programming

An AI-assisted development environment for building, editing and maintaining professional React
websites. People without programming experience describe what they want and click on the real
site; developers keep full access to the same source code, terminal and git.

IBP ships as a **desktop app** (Electron) and as a **VS Code extension** (VS Code, Cursor,
VSCodium). Both share the same core and features. Generated sites use **Vite + React** or
**Next.js**, with TypeScript and Tailwind CSS.

**Status:** Milestone A (desktop app, Next.js template, live preview). See
[docs/roadmap.md](docs/roadmap.md).

## Requirements

- Node.js 22 or newer, pnpm 12, git
- VS Code 1.125 or newer

## Development

```bash
pnpm install
pnpm build            # Studio UI (Vite) + extension + desktop app (esbuild) + templates
pnpm typecheck
pnpm lint
pnpm test             # unit tests (Vitest)
pnpm dev:desktop      # build and open the desktop app
pnpm test:desktop     # Playwright tests driving the desktop app
pnpm test:ext         # integration test inside the installed VS Code
pnpm package:desktop  # apps/desktop/out/IBP-<platform>-<arch>/ (unsigned)
pnpm package          # apps/extension/ibp.vsix
```

`IBP_E2E_FULL=1 pnpm --filter ibp-desktop test` also runs the slow test that installs real npm
packages and checks the live preview.

Run the extension instead: open this folder in VS Code and launch an Extension Development Host for
`apps/extension`, or from a terminal:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --extensionDevelopmentPath="$PWD/apps/extension"
```

Then run **IBP: Open Studio** from the Command Palette.

## Repository

| Path              | Contents                                                                    |
| ----------------- | --------------------------------------------------------------------------- |
| `apps/desktop`    | Desktop app (Electron main process, preload, packaging)                     |
| `apps/extension`  | VS Code extension                                                           |
| `apps/webview`    | IBP Studio UI (React), used by both                                         |
| `packages/core`   | Host-agnostic services: Studio controller, projects, templates, dev servers |
| `packages/shared` | Message protocol and translations                                           |
| `templates/`      | Starter websites: `shared` sections + `base-vite-react` / `base-next`       |
| `docs/`           | Architecture, decisions, security, research, roadmap                        |
