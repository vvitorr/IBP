import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { _electron as electron, expect, test, type ElectronApplication } from "@playwright/test";

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
    },
  });
});

test.afterEach(async () => {
  await app.close();
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
