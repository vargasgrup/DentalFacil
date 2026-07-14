import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./fixtures";

async function ensureAdmin(request: import("@playwright/test").APIRequestContext) {
  const status = await request.get("/api/auth/setup-status");
  const body = await status.json();
  if (body.needs_setup) {
    const setup = await request.post("/api/auth/setup", {
      data: {
        nombre: E2E_ADMIN.nombre,
        email: E2E_ADMIN.email,
        password: E2E_ADMIN.password,
      },
    });
    expect(setup.ok()).toBeTruthy();
    return;
  }
  // Already configured: login must succeed with seed credentials or env override.
  const login = await request.post("/api/auth/login", {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  if (!login.ok()) {
    test.skip(
      true,
      `No se pudo autenticar E2E admin (${E2E_ADMIN.email}). Configure E2E_ADMIN_* o reinicie DB de test.`
    );
  }
}

test.describe("Auth", () => {
  test("login fallido muestra error y no navega al dashboard", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(/correo/i).fill("wrong@test.local");
    await page.getByPlaceholder(/contraseña/i).fill("bad-password");
    await page.getByRole("button", { name: /iniciar sesión/i }).click();
    await expect(page.getByText(/incorrectos|sesión|credenciales|error/i)).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test("login exitoso llega al dashboard", async ({ page, request }) => {
    await ensureAdmin(request);
    await page.goto("/");
    await page.getByPlaceholder(/correo/i).fill(E2E_ADMIN.email);
    await page.getByPlaceholder(/contraseña/i).fill(E2E_ADMIN.password);
    await page.getByRole("button", { name: /iniciar sesión|crear cuenta/i }).click();
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  });
});
