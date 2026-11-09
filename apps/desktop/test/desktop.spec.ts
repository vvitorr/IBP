import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";
import { BADGE_SOURCE, REPLY, startFakeOpenAIServer } from "@ibp/model-router/testing";

const main = join(__dirname, "..", "dist", "main.js");
// Set IBP_APP_EXECUTABLE to test a packaged app (e.g. out/IBP-darwin-arm64/IBP.app/Contents/MacOS/ibp).
const executable = process.env.IBP_APP_EXECUTABLE;
const screenshots = process.env.IBP_SCREENSHOTS;

let root: string;
let sites: string;
let app: ElectronApplication;

test.beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "ibp-desktop-"));
  sites = join(root, "sites");
  await mkdir(sites);
  app = await electron.launch({
    ...(executable ? { executablePath: executable, args: [] } : { args: [main] }),
    env: {
      ...process.env,
      IBP_TEST_MODE: "1",
      IBP_USER_DATA: join(root, "user-data"),
      IBP_TEST_PICK_FOLDER: sites,
      IBP_TEST_CONFIRM: "yes",
      IBP_TEST_PICK_FILE: join(root, "foto.png"),
    },
  });
});

test.afterEach(async () => {
  await app.close().catch(() => {}); // some tests close the app themselves

  await rm(root, { recursive: true, force: true });
});

test("opens the Studio, creates a Next.js project and switches language", async () => {
  const page = await app.firstWindow();
  await expect(page.getByRole("heading", { name: "Novo site" })).toBeVisible();

  await page.getByLabel("Nome do site").fill("Oficina Teste");
  await page.getByLabel("Next.js").check();
  await page.getByRole("button", { name: "Criar projeto" }).click();

  await expect(page.getByRole("button", { name: /Oficina Teste/ })).toBeVisible();
  await expect(page.getByText("Para ver o site é preciso instalar as dependências")).toBeVisible();
  const metadata = JSON.parse(
    await readFile(join(sites, "oficina-teste", ".ibp", "project.json"), "utf8"),
  );
  expect(metadata).toMatchObject({ name: "Oficina Teste", template: "base-next" });
  if (screenshots) await page.screenshot({ path: join(screenshots, "studio-pt.png") });

  await page.getByLabel("Idioma").selectOption("en");
  await expect(page.getByRole("tab", { name: "Preview" })).toBeVisible();
});

// Installs real npm packages and starts a real dev server: run with IBP_E2E_FULL=1.
test("installs dependencies and shows the live preview", async () => {
  test.skip(!process.env.IBP_E2E_FULL, "set IBP_E2E_FULL=1 (needs network, ~1 min)");
  const page = await app.firstWindow();
  await page.getByLabel("Nome do site").fill("Café Central");
  await page.getByRole("button", { name: "Criar projeto" }).click();

  await page.getByRole("button", { name: "Instalar dependências" }).click();
  await expect(page.getByRole("button", { name: "Ver site" })).toBeVisible({ timeout: 90_000 });
  await page.getByRole("button", { name: "Ver site" }).click();

  const frame = page.frameLocator("iframe");
  await expect(frame.getByRole("heading", { name: "Bem-vindo" })).toBeVisible({ timeout: 60_000 });
  if (screenshots) await page.screenshot({ path: join(screenshots, "preview-desktop.png") });

  await page.getByRole("radio", { name: "Telemóvel" }).click();
  if (screenshots) await page.screenshot({ path: join(screenshots, "preview-mobile.png") });
  // Nothing in this flow may change settings behind the user's back.
  await expect(page.getByRole("radio", { name: "Iniciante" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test("configures an AI provider, chats with streaming and never stores the key in plain text", async () => {
  const KEY = "sk-e2e-PLAIN-TEXT-MUST-NOT-APPEAR";
  const server = await startFakeOpenAIServer({ apiKey: KEY });
  try {
    const page = await app.firstWindow();
    await page.getByRole("button", { name: "Definições" }).click();
    await page.getByLabel("Adicionar fornecedor").selectOption("custom");
    await page.getByRole("button", { name: "Adicionar fornecedor" }).click();

    const card = page.getByRole("article", { name: "Custom" });
    await card.getByLabel("Endereço da API").fill(server.baseUrl);
    await card.getByRole("button", { name: "Guardar", exact: true }).nth(1).click();
    await card.getByLabel("Chave da API").fill(KEY);
    await card.getByRole("button", { name: "Guardar chave" }).click();
    await expect(card.getByText("Chave guardada de forma segura")).toBeVisible();
    await expect(card.getByLabel("Chave da API")).toHaveValue("");

    await card.getByRole("button", { name: "Testar ligação" }).click();
    await expect(card.getByText(/Ligado · 8 modelos/)).toBeVisible();
    await expect(page.getByText("Ordem de utilização")).toBeVisible();
    if (screenshots) await page.screenshot({ path: join(screenshots, "ai-settings.png") });

    await page.getByRole("tab", { name: "Assistente" }).click();
    const input = page.getByRole("textbox", { name: /Pergunta algo/ });
    await input.fill("Olá, quem és?");
    await input.press("Enter");
    await expect(page.getByText(REPLY)).toBeVisible();
    if (screenshots) await page.screenshot({ path: join(screenshots, "ai-chat.png") });
  } finally {
    await server.close();
  }

  await app.close();
  // Every file IBP wrote may hold the key only as ciphertext.
  const userData = join(root, "user-data");
  const files = await readdir(userData, { recursive: true, withFileTypes: true });
  let secretsFile = "";
  for (const entry of files.filter((e) => e.isFile())) {
    const path = join(entry.parentPath, entry.name);
    const content = await readFile(path);
    expect(content.includes(KEY), path).toBe(false);
    if (entry.name === "secrets.json") secretsFile = content.toString("utf8");
  }
  expect(Object.keys(JSON.parse(secretsFile))).toHaveLength(1);
});

test("the coding agent creates a component; the user reverts, then accepts with a commit", async () => {
  const server = await startFakeOpenAIServer();
  try {
    const page = await app.firstWindow();
    await page.getByLabel("Nome do site").fill("Oficina Rui");
    await page.getByRole("button", { name: "Criar projeto" }).click();
    await expect(page.getByRole("button", { name: /Oficina Rui/ })).toBeVisible();

    // Provider pointing at the fake server, with the scripted agent model as the only choice.
    await page.getByRole("button", { name: "Definições" }).click();
    await page.getByLabel("Adicionar fornecedor").selectOption("custom");
    await page.getByRole("button", { name: "Adicionar fornecedor" }).click();
    const card = page.getByRole("article", { name: "Custom" });
    await card.getByLabel("Endereço da API").fill(server.baseUrl);
    await card.getByRole("button", { name: "Guardar", exact: true }).nth(1).click();
    await card.getByRole("button", { name: "Testar ligação" }).click();
    await expect(card.getByText(/Ligado/)).toBeVisible();
    const remove = page.getByRole("button", { name: "Retirar" });
    for (let left = await remove.count(); left > 0; left--) {
      await remove.first().click();
      await expect(remove).toHaveCount(left - 1); // wait for the list to update before the next click
    }
    await card.getByLabel("Filtrar modelos").fill("fake/agent");
    await card
      .getByRole("row", { name: /fake\/agent\s/ })
      .getByRole("button", { name: "Usar" })
      .click();
    await page.getByRole("button", { name: "Voltar ao projeto" }).click();

    await page.getByRole("tab", { name: "Assistente" }).click();
    await expect(page.getByText("A trabalhar em: Oficina Rui")).toBeVisible();
    const input = page.getByRole("textbox", { name: /Pergunta algo/ });
    const projectDir = join(sites, "oficina-rui");
    const badge = join(projectDir, "src", "components", "Badge.tsx");

    await input.fill("Cria um componente Badge");
    await input.press("Enter");
    await expect(page.getByText("Escreveu src/components/Badge.tsx")).toBeVisible();
    await expect(page.getByRole("button", { name: "Reverter" })).toBeVisible();
    expect(await readFile(badge, "utf8")).toBe(BADGE_SOURCE);
    await page.getByRole("button", { name: "Ver diferenças" }).first().click();
    if (screenshots) await page.screenshot({ path: join(screenshots, "agent-review.png") });

    await page.getByRole("button", { name: "Reverter" }).click();
    await expect(page.getByText("Alterações revertidas")).toBeVisible();
    expect(await stat(badge).catch(() => null)).toBeNull();

    await input.fill("Cria um componente Badge");
    await input.press("Enter");
    await expect(page.getByRole("button", { name: "Aceitar alterações" })).toBeVisible();
    await page.getByRole("button", { name: "Aceitar alterações" }).click();
    await expect(page.getByText(/Alterações aceites/).last()).toBeVisible();
    const last = execFileSync("git", ["log", "-1", "--format=%s", "--name-only"], {
      cwd: projectDir,
      encoding: "utf8",
    });
    expect(last.trim().split("\n")).toEqual([
      "ibp: Cria um componente Badge",
      "",
      "src/components/Badge.tsx",
    ]);
  } finally {
    await server.close();
  }
});

test("writes the site copy with AI on creation, then edits content and adds an image", async () => {
  const server = await startFakeOpenAIServer();
  try {
    const page = await app.firstWindow();
    // Configure a provider first so the create form offers AI copy.
    await page.getByRole("button", { name: "Definições" }).click();
    await page.getByLabel("Adicionar fornecedor").selectOption("custom");
    await page.getByRole("button", { name: "Adicionar fornecedor" }).click();
    const card = page.getByRole("article", { name: "Custom" });
    await card.getByLabel("Endereço da API").fill(server.baseUrl);
    await card.getByRole("button", { name: "Guardar", exact: true }).nth(1).click();
    await card.getByRole("button", { name: "Testar ligação" }).click();
    await expect(card.getByText(/Ligado/)).toBeVisible();
    const remove = page.getByRole("button", { name: "Retirar" });
    for (let left = await remove.count(); left > 0; left--) {
      await remove.first().click();
      await expect(remove).toHaveCount(left - 1);
    }
    await card.getByLabel("Filtrar modelos").fill("fake/content");
    await card.getByRole("row", { name: /fake\/content\s/ }).getByRole("button", { name: "Usar" }).click();
    await page.getByRole("button", { name: "Voltar ao projeto" }).click();

    await page.getByLabel("Nome do site").fill("Tasca do Zé");
    await page.getByLabel("Descrição do negócio").fill("Petiscos e vinho no centro do Porto.");
    await expect(page.getByLabel("Gerar os textos com IA a partir da descrição")).toBeChecked();
    await page.getByRole("button", { name: "Criar projeto" }).click();

    await expect(page.getByText("Escreveu os textos do site")).toBeVisible();
    await page.getByRole("button", { name: "Aceitar alterações" }).click();
    await expect(page.getByText(/Alterações aceites/)).toBeVisible();
    const projectDir = join(sites, "tasca-do-ze");
    const siteFile = join(projectDir, "src", "content", "site.json");
    expect(JSON.parse(await readFile(siteFile, "utf8")).pages[0].sections[0].title).toBe("Petiscos e vinho da casa");
    const log = execFileSync("git", ["log", "-1", "--format=%s"], { cwd: projectDir, encoding: "utf8" });
    expect(log).toMatch(/^ibp: Escreve os textos do site/);

    await page.getByRole("tab", { name: "Conteúdo" }).click();
    await page.getByLabel("Frase curta").fill("A melhor tasca do bairro");
    await writeFile(join(root, "foto.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0, 0, 0, 0, 0]));
    await page.getByRole("button", { name: "Escolher imagem" }).first().click();
    await expect(page.getByText(/^\/images\/foto-/)).toBeVisible();
    if (screenshots) await page.screenshot({ path: join(screenshots, "content-editor.png") });
    await page.getByRole("main").getByRole("button", { name: "Guardar", exact: true }).click();
    await expect(page.getByText("Guardado. A pré-visualização já mostra as alterações.")).toBeVisible();

    const saved = JSON.parse(await readFile(siteFile, "utf8"));
    expect(saved.business.tagline).toBe("A melhor tasca do bairro");
    expect(saved.pages[0].sections[0].image.src).toMatch(/^\/images\/foto-[0-9a-f]{8}\.png$/);
    expect(await stat(join(projectDir, "public", saved.pages[0].sections[0].image.src))).toBeTruthy();
  } finally {
    await server.close();
  }
});
