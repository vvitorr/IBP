# IBP — Intent Based Programming

An AI-assisted development environment for building, editing and maintaining professional React
websites. People without programming experience describe what they want and click on the real
site; developers keep full access to the same source code, terminal and git.

IBP ships as a VS Code extension (works in VS Code, Cursor and VSCodium).

**Status:** Phase 1 (foundation). See [docs/roadmap.md](docs/roadmap.md).

## Requirements

- Node.js 22 or newer, pnpm 12, git
- VS Code 1.125 or newer

## Development

```bash
pnpm install
pnpm build        # webview (Vite) + extension (esbuild) + template copy
pnpm typecheck
pnpm lint
pnpm test         # unit tests (Vitest)
pnpm test:ext     # integration test inside the installed VS Code
pnpm package      # apps/extension/ibp.vsix
```

Run the extension: open this folder in VS Code and launch an Extension Development Host for
`apps/extension`, or from a terminal:

```bash
"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code" --extensionDevelopmentPath="$PWD/apps/extension"
```

Then run **IBP: Open Studio** from the Command Palette.

## Repository

| Path                        | Contents                                             |
| --------------------------- | ---------------------------------------------------- |
| `apps/extension`            | VS Code extension host                               |
| `apps/webview`              | IBP Studio UI (React)                                |
| `packages/shared`           | Message protocol and translations shared by both     |
| `templates/base-vite-react` | Starter website copied for new projects              |
| `docs/`                     | Architecture, decisions, security, research, roadmap |
