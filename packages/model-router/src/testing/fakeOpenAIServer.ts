import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A tiny OpenAI-compatible server for tests (unit and desktop e2e). Models:
 * - fake/fast    streams REPLY, then usage; calls the tool when tools are sent
 * - fake/slow    like fast, 150 ms between words (to test "stop")
 * - fake/limited 429 with Retry-After: 2
 * - fake/broken  500
 * - fake/midway  two words, then the connection drops
 * - fake/agent   scripted agent: list_files → write_file(src/components/Badge.tsx) → final text
 * - fake/agent-config  asks to edit package.json (a high-risk tool) → final text
 * - fake/content        site copy as JSON inside prose and a ```json fence
 * - fake/content-retry  invalid JSON first, valid JSON after being told so
 * Tool calls are streamed in fragments, the way OpenAI-style providers do.
 */
export const REPLY = "Olá! Sou um modelo de teste do IBP.";
export const AGENT_DONE = "Criei o componente Badge em src/components/Badge.tsx.";
export const BADGE_SOURCE = `export function Badge({ label }: { label: string }) {
  return <span className="rounded-sm bg-brand px-2 py-0.5 text-sm text-brand-contrast">{label}</span>;
}
`;

export const CONTENT_COPY = {
  theme: "terracotta",
  tagline: "Petiscos da casa no centro do Porto.",
  hero: {
    eyebrow: "Tasca",
    title: "Petiscos e vinho da casa",
    text: "Comida simples, feita no dia, para partilhar à mesa.",
    cta: "Reservar mesa",
  },
  about: { title: "A nossa casa", text: "Uma tasca de bairro.\n\nCozinha simples e honesta." },
  services: {
    title: "Na tasca",
    items: [
      { title: "Almoços", text: "Prato do dia ao almoço." },
      { title: "Petiscos", text: "Para partilhar ao fim da tarde." },
      { title: "Grupos", text: "Mesas para grupos com reserva." },
    ],
  },
};

/** What the scripted agents do at each step (by number of tool results already received). */
const AGENT_SCRIPTS: Record<string, ({ name: string; args: object } | string)[]> = {
  "fake/agent": [
    { name: "list_files", args: {} },
    { name: "write_file", args: { path: "src/components/Badge.tsx", content: BADGE_SOURCE } },
    AGENT_DONE,
  ],
  "fake/agent-config": [
    {
      name: "edit_file",
      args: { path: "package.json", old: '"private": true', new: '"private": false' },
    },
    "Feito.",
  ],
};

export interface FakeServer {
  baseUrl: string;
  requests: { path: string; authorization?: string; body: Record<string, unknown> | null }[];
  close(): Promise<void>;
}

export async function startFakeOpenAIServer(
  options: { apiKey?: string } = {},
): Promise<FakeServer> {
  const requests: FakeServer["requests"] = [];

  const send = (
    res: ServerResponse,
    status: number,
    body: unknown,
    headers: Record<string, string> = {},
  ) => {
    res.writeHead(status, { "Content-Type": "application/json", ...headers });
    res.end(JSON.stringify(body));
  };
  const event = (res: ServerResponse, data: unknown) =>
    res.write(`data: ${typeof data === "string" ? data : JSON.stringify(data)}\n\n`);
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function handle(req: IncomingMessage, res: ServerResponse) {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    const path = new URL(req.url ?? "/", "http://x").pathname;
    requests.push({ path, authorization: req.headers.authorization, body });

    if (options.apiKey && req.headers.authorization !== `Bearer ${options.apiKey}`) {
      return send(res, 401, { error: { message: "invalid api key" } });
    }
    if (req.method === "GET" && path === "/v1/models") {
      const model = (id: string, extra = {}) => ({
        id,
        context_length: 32_000,
        supported_parameters: ["tools", "temperature"],
        pricing: { prompt: "0", completion: "0" },
        ...extra,
      });
      return send(res, 200, {
        data: [
          model("fake/fast"),
          model("fake/slow"),
          model("fake/limited"),
          model("fake/broken"),
          model("fake/midway"),
          model("fake/paid", { pricing: { prompt: "0.000001", completion: "0.000002" } }),
          model("fake/agent"),
          model("fake/agent-config"),
          model("fake/content"),
          model("fake/content-retry"),
        ],
      });
    }
    if (req.method !== "POST" || path !== "/v1/chat/completions" || !body) {
      return send(res, 404, { error: { message: "not found" } });
    }

    const model = String(body.model);
    if (model === "fake/limited")
      return send(res, 429, { error: { message: "rate limited" } }, { "Retry-After": "2" });
    if (model === "fake/broken") return send(res, 500, { error: { message: "upstream exploded" } });

    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
    res.write(": keep-alive\n\n");
    const chunk = (delta: object, finish: string | null = null) => ({
      choices: [{ index: 0, delta, finish_reason: finish }],
    });
    if (model === "fake/content" || model === "fake/content-retry") {
      const told =
        (body.messages as { role: string }[]).filter((m) => m.role === "user").length > 1;
      const reply =
        model === "fake/content-retry" && !told
          ? '{"theme": "terracotta", "tagline": '
          : `Aqui está:\n\n\`\`\`json\n${JSON.stringify(CONTENT_COPY)}\n\`\`\``;
      event(res, chunk({ content: reply }));
      event(res, chunk({}, "stop"));
      event(res, "[DONE]");
      return res.end();
    }
    const script = AGENT_SCRIPTS[model];
    if (script) {
      const done = (body.messages as { role: string }[]).filter((m) => m.role === "tool").length;
      const step = script[Math.min(done, script.length - 1)] ?? "";
      if (typeof step === "string") {
        event(res, chunk({ content: step }));
        event(res, chunk({}, "stop"));
      } else {
        const args = JSON.stringify(step.args);
        const half = Math.ceil(args.length / 2);
        const id = `call_${done + 1}`;
        event(
          res,
          chunk({
            tool_calls: [
              { index: 0, id, type: "function", function: { name: step.name, arguments: "" } },
            ],
          }),
        );
        event(
          res,
          chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(0, half) } }] }),
        );
        event(
          res,
          chunk({ tool_calls: [{ index: 0, function: { arguments: args.slice(half) } }] }),
        );
        event(res, chunk({}, "tool_calls"));
      }
      event(res, "[DONE]");
      return res.end();
    }
    if (Array.isArray(body.tools) && body.tools.length) {
      event(
        res,
        chunk({
          tool_calls: [
            {
              index: 0,
              id: "call_1",
              type: "function",
              function: { name: "get_time", arguments: "" },
            },
          ],
        }),
      );
      event(res, chunk({}, "tool_calls"));
      event(res, "[DONE]");
      return res.end();
    }
    const words = REPLY.split(/(?<= )/);
    for (const [i, word] of words.entries()) {
      if (model === "fake/midway" && i === 2) {
        await wait(50); // let the first words reach the client before the drop
        return res.destroy();
      }
      event(res, chunk({ content: word }));
      if (model === "fake/slow") await wait(150);
    }
    event(res, chunk({}, "stop"));
    event(res, { choices: [], usage: { prompt_tokens: 12, completion_tokens: words.length } });
    event(res, "[DONE]");
    res.end();
  }

  const server = createServer((req, res) => {
    handle(req, res).catch(() => res.destroy());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}/v1`,
    requests,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
