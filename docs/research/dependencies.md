# Dependency and integration research

Accessed 2026-11-07. Every fact below was read from the cited source on that date. Items marked
**Unverified** could not be confirmed and must be checked again before they influence a decision.

## 1. Development environment (this machine)

| Tool    | Version                       | Note                                                                                        |
| ------- | ----------------------------- | ------------------------------------------------------------------------------------------- |
| macOS   | 27.0.1 (arm64)                |                                                                                             |
| Node.js | 26.8.2                        | Repo requires `>=22` (Cline SDK and Vitest need 22+).                                       |
| pnpm    | 12.16.1                       | Workspace manager. Blocks dependency build scripts unless allowed in `pnpm-workspace.yaml`. |
| npm     | 11.19.1                       | Used inside generated website projects.                                                     |
| git     | 2.50.1                        |                                                                                             |
| VS Code | 1.145.2                       | `/Applications/Visual Studio Code.app`. Used for integration tests.                         |
| Cursor  | 3.29.9 (VS Code base 1.128.0) | The `code` CLI on this machine points to Cursor, so scripts call VS Code by full path.      |

## 2. Pinned dependencies (Phase 1)

Policy: exact versions, each published at least two weeks before it was pinned (supply-chain
cooldown). When the newest release was too recent, the newest older release was used.

| Package                                 | Version       | License    | Where             | Why                                                                                                                                                               |
| --------------------------------------- | ------------- | ---------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| typescript                              | 6.0.3         | Apache-2.0 | root              | `typescript-eslint` 8.72 supports `>=4.8.4 <6.1.0`, so TypeScript 7 is not used yet.                                                                              |
| esbuild                                 | 0.28.2        | MIT        | extension         | Bundles the extension host into one CommonJS file.                                                                                                                |
| vite                                    | 8.3.5         | MIT        | webview, template | Webview build; dev server of generated sites.                                                                                                                     |
| @vitejs/plugin-react                    | 6.1.2         | MIT        | webview, template |                                                                                                                                                                   |
| react, react-dom                        | 19.3.1        | MIT        | webview, template |                                                                                                                                                                   |
| tailwindcss, @tailwindcss/vite          | 4.3.3         | MIT        | webview, template |                                                                                                                                                                   |
| lucide-react                            | 1.61.0        | ISC        | webview           | Icons.                                                                                                                                                            |
| react-resizable-panels                  | 4.14.8        | MIT        | webview           | Accessible, keyboard-resizable panels (writing this correctly by hand is not trivial).                                                                            |
| zod                                     | 4.6.7         | MIT        | shared, extension | Runtime validation at the webview trust boundary and for files on disk.                                                                                           |
| vitest                                  | 4.1.12        | MIT        | root              | Unit tests.                                                                                                                                                       |
| eslint                                  | 10.13.0       | MIT        | root              |                                                                                                                                                                   |
| typescript-eslint                       | 8.72.0        | MIT        | root              |                                                                                                                                                                   |
| eslint-plugin-react-hooks               | 7.1.1         | MIT        | root              |                                                                                                                                                                   |
| prettier                                | 3.9.10        | MIT        | root              |                                                                                                                                                                   |
| @types/vscode                           | 1.125.0       | MIT        | extension         | No 1.128 release exists; 1.125 sets `engines.vscode ^1.125.0`, which covers Cursor (1.128) and VS Code 1.145.                                                     |
| @vscode/vsce                            | 4.0.0         | MIT        | extension         | Packaging (`--no-dependencies`, bundle is self-contained).                                                                                                        |
| @vscode/test-cli, @vscode/test-electron | 0.0.15, 3.1.0 | MIT        | extension         | Integration tests. Config option `useInstallation: { fromPath }` runs the installed VS Code (no download). Source: `src/config.cts` in microsoft/vscode-test-cli. |

pnpm build scripts: `esbuild` allowed (verifies its platform binary); `@vscode/vsce-sign` denied
(signing is not used).

## 2b. Milestone A additions (pinned 2026-11-07, same two-week rule)

| Package                                        | Version | License    | Where     | Why                                                                                                                                                                         |
| ---------------------------------------------- | ------- | ---------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| electron                                       | 45.0.0  | MIT        | desktop   | Current stable major (Node 24.22, Chromium 156); 43–45 supported. Defaults: `contextIsolation` and `sandbox` on, `nodeIntegration` off. Downloads its runtime on first use. |
| @electron-forge/cli, @electron-forge/maker-zip | 8.0.1   | MIT        | desktop   | Packager recommended by the Electron docs. Used only to package the already-bundled `dist/` (no `node_modules`, `prune: false`).                                            |
| @playwright/test                               | 1.64.1  | Apache-2.0 | desktop   | Drives the real Electron app (`_electron.launch`); no browser download needed.                                                                                              |
| next (template)                                | 16.4.3  | MIT        | base-next | Turbopack is the default for `next dev`/`next build` in Next 16.                                                                                                            |
| @tailwindcss/postcss (template)                | 4.3.3   | MIT        | base-next | Same Tailwind setup as Midi8's Next sites.                                                                                                                                  |
| typescript (Next template)                     | 5.9.3   | Apache-2.0 | base-next | Matches Midi8's sites (`^5`); Next 16 + TS 6 not verified.                                                                                                                  |

Facts used (accessed 2026-11-07):

- Electron security checklist: CSP, validate IPC `senderFrame`, set permission handlers (Electron
  approves all permission requests by default otherwise), limit navigation and new windows,
  prefer custom protocols over `file://`. <https://www.electronjs.org/docs/latest/tutorial/security>
- `safeStorage`: the synchronous API is deprecated and will be removed in Electron 46; use
  `encryptStringAsync`/`decryptStringAsync`. Keychain (macOS), DPAPI (Windows), kwallet/libsecret
  (Linux, `basic_text` = hard-coded key fallback). macOS apps should be signed for consistent
  behaviour. <https://www.electronjs.org/docs/latest/api/safe-storage>
- macOS distribution needs code signing and notarization.
  <https://www.electronjs.org/docs/latest/tutorial/code-signing>
- Turbopack `turbopack.rules`: only a subset of the webpack loader API; loaders must return
  JavaScript. <https://nextjs.org/docs/app/api-reference/config/next-config-js/turbopack>
- node-pty (Milestone B): MIT, native C++ build, Windows needs ConPTY (1809+).
  <https://github.com/microsoft/node-pty>
- Next dev writes an `AGENTS.md` into generated projects on first run (seen in a real run).

## 3. FreeLLMAPI

- Repository: <https://github.com/tashfeenahmed/freellmapi> (the original; forks with the same
  name exist, e.g. `valorisa/FreeLLMAPI`, `Haris-Ahmed83/freellmapi`, `Ahmed-M-Abdelkader/freellmapi`,
  with different provider counts). License **MIT**. Latest release v0.16.20 (2026-11-06), ~48k stars,
  frequent releases.
- Runtime: Node 20+, Express API, React dashboard, SQLite. Docker image
  `ghcr.io/tashfeenahmed/freellmapi`. API and dashboard on port 3001; bound to `127.0.0.1` by
  default in Compose.
- Endpoints: `POST /v1/chat/completions`, `/v1/responses`, `/v1/completions`, `GET /v1/models`
  (filters `?available=true`, `?execution_status=`), `/v1/embeddings`, `GET /v1/usage`, plus
  Anthropic-format `/v1/messages` and Gemini-format `/v1beta/...` routes, an MCP endpoint and an
  OpenAPI document at `/v1/openapi.json`.
- Streaming: SSE supported. Tool calling: OpenAI `tools`/`tool_choice` pass through; support
  depends on the upstream provider and model.
- Auth: one unified bearer key for clients. Provider keys are AES-256-GCM encrypted in SQLite
  with a required `ENCRYPTION_KEY`.
- Routing: `model: "auto"` and `auto:fast|smart|cheap|reliable|balanced`; failover on 429/5xx with
  cooldowns and key rotation; per-key RPM/RPD/TPM/TPD counters; monthly caps described as a
  "usage guard, not an exact billing limit". Response headers `X-Routed-Via`, `X-Fallback-Trail`.
- Multi-user: no. The README says it is "local-first and single-user by design".
- Terms: repository description says "Personal experimentation only". Release notes warn that some
  providers log prompts (FreeInference) and that a provider integration "does not establish
  permission for resale or a competing service".
- Capability metadata: `/v1/models` does not document context-window or tool-support fields.
- **Consequence for IBP:** usable as an optional local gateway behind the generic
  OpenAI-compatible provider, configured by each user with their own keys. Never bundled, never a
  hard dependency, never offered to customers. IBP keeps its own model-capability registry.

## 4. Other model providers and gateways

| Option                    | Verified facts                                                                                                                                                                                                                                                                                                    | Unverified                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenRouter                | OpenAI API spec for `/chat/completions`, `/responses`, `/completions` (FAQ). `:free` models: 20 req/min; 50 req/day with fewer than 10 credits purchased, 1000 req/day with at least 10. Terms forbid "reselling API access to Models or otherwise developing a competing service"; each model's own terms apply. | Base URL `https://openrouter.ai/api/v1` is inferred from documented `/api/v1/...` paths.                                                                                                      |
| LiteLLM (BerriAI/litellm) | OpenAI-compatible proxy (`litellm --model ...`, client `base_url` at port 4000), virtual keys.                                                                                                                                                                                                                    | License: GitHub reports `NOASSERTION`; an `enterprise/` folder exists under a commercial license per the README. Proxy fallbacks/budgets only seen in a summary. Treat as "check before use". |
| Ollama                    | OpenAI-compatible at `http://localhost:11434/v1/`; `/v1/chat/completions` supports streaming and tools, **not** `tool_choice`; also `/v1/models`, `/v1/embeddings`.                                                                                                                                               |                                                                                                                                                                                               |
| LM Studio                 | OpenAI-compatible at `http://localhost:1234/v1`; `/v1/models`, `/v1/chat/completions`, `/v1/responses`, `/v1/embeddings`.                                                                                                                                                                                         | Streaming and tool-call support.                                                                                                                                                              |
| Vercel AI SDK             | npm `ai` 7.0.164 (Apache-2.0), `@ai-sdk/openai-compatible` 3.0.86 (Apache-2.0); Node 22+.                                                                                                                                                                                                                         | Streaming + tool-call behaviour of the OpenAI-compatible provider.                                                                                                                            |
| openai (npm)              | 7.53.0, Apache-2.0. Ollama's docs use it with `baseURL` pointing at Ollama.                                                                                                                                                                                                                                       | A general statement that any compatible server works.                                                                                                                                         |

**Consequence:** one generic OpenAI-compatible adapter covers FreeLLMAPI, OpenRouter, Ollama, LM
Studio and LiteLLM. Capabilities (tools, `tool_choice`, streaming, JSON output, context size) differ
per provider and model, so Phase 2 probes and records them instead of assuming. The HTTP client
(AI SDK, `openai`, or plain `fetch`) is chosen in Phase 2.

## 5. Agent integrations

| Option                           | Facts                                                                                                                                                                                                                                                           | Verdict                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Roo Code (`RooCodeInc/Roo-Code`) | Apache-2.0. **Archived; extension shut down 2026-05-15** (README points to the ZooCode fork and Cline). Had a rich API (`startNewTask`, events, profiles, IPC).                                                                                                 | Rejected.                                                                                                                           |
| Cline extension (`cline/cline`)  | Apache-2.0, active (v4.1.26). Exported API (`apps/vscode/src/exports/cline.d.ts`): `startNewTask`, `sendMessage`, `pressPrimaryButton`, `pressSecondaryButton` only. No events, no configuration, no approval hooks. Headless CLI (`npm i -g cline`, `--json`). | Rejected as the primary agent: IBP cannot pass element context, observe progress or own approvals through it.                       |
| Cline SDK (`@cline/sdk`)         | Apache-2.0, Node ≥ 22. Embeddable agent loop (`@cline/agents`, `@cline/core`), custom tools via `createTool`, streamed events, `capabilities` for client-owned tool executors and approval callbacks, OpenAI-compatible providers.                              | Candidate second `AgentAdapter`; time-boxed spike in Phase 3. **Unverified:** callback shapes, `baseUrl` config, stability/version. |

## 6. Element-to-source mapping (visual editor)

- React 19 removed `_debugSource` from fibers (facebook/react #28265, #29092 closed as not
  planned). Fiber internals are explicitly unstable.
- Working approaches: compile-time attributes (`code-inspector-plugin` adds `data-insp-path`;
  `swc-plugin-source-tracker` adds `data-source`), or patching the JSX dev runtime
  (`vite-plugin-react-click-to-component` 3.1, marked experimental).
- **Consequence:** templates carry explicit `data-editor-id`; a dev-only Vite plugin will add
  `data-ibp-src="file:line:col"` at compile time (Phase 5).

## 7. VS Code platform

- Webviews: scripts disabled by default; CSP with nonce; `localResourceRoots` limits loadable
  files; `acquireVsCodeApi()` once per page; `env.asExternalUri` creates a tunnel for remote
  setups. A cross-origin iframe (the future preview) can only talk via `postMessage`.
- Code - OSS: MIT source; the default `product.json` has no extension gallery; Open VSX can be
  configured; VSCodium already ships this way. **Unverified:** the Visual Studio Marketplace terms
  on use with non-Microsoft editors (the PDF could not be read). Assume Marketplace extensions are
  not available to a Code - OSS build.

## 8. Deployment (Phase 7 input)

- Vercel REST: `POST https://api.vercel.com/v13/deployments` with `Authorization: Bearer <token>`.
  `target` omitted = preview; `"production"` = production; `staging` or a custom environment also
  allowed.
- Vercel CLI: `vercel --prod` for production; without it, preview. The first deployment of a new
  project is always production, even without `--prod`.
