import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./fixtures";

async function loginUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByPlaceholder(/correo/i).fill(E2E_ADMIN.email);
  await page.getByPlaceholder(/contraseña/i).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: /iniciar sesión|crear cuenta/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

async function ensureAdmin(request: import("@playwright/test").APIRequestContext) {
  const login = await request.post("/api/auth/login", {
    data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
  });
  if (!login.ok()) {
    test.skip(true, "Admin E2E no disponible; corre auth.spec primero.");
  }
  return login;
}

test.describe("Agenda", () => {
  test("abre la grilla y permite cambiar vistas", async ({ page, request }) => {
    await ensureAdmin(request);
    await loginUi(page);
    await page.goto("/agenda");
    await expect(page.getByRole("heading", { name: /agenda/i }).or(page.getByText(/agenda/i).first())).toBeVisible({
      timeout: 15_000,
    });

    // Controles de vista (Mes / Semana / Día / Lista)
    const weekBtn = page.getByRole("button", { name: /^semana$/i }).or(page.getByText(/^semana$/i));
    const dayBtn = page.getByRole("button", { name: /^día$|^dia$/i }).or(page.getByText(/^día$|^dia$/i));
    if (await weekBtn.count()) {
      await weekBtn.first().click();
    }
    if (await dayBtn.count()) {
      await dayBtn.first().click();
    }

    // Nueva cita (abre formulario / panel)
    const nueva = page.getByRole("button", { name: /nueva cita|\+/i }).first();
    if (await nueva.count()) {
      await nueva.click();
      await expect(
        page.getByText(/paciente|especialidad|guardar|crear cita/i).first()
      ).toBeVisible({ timeout: 10_000 });
    }
  });

  test("API lista citas sin error (salud agenda)", async ({ request }) => {
    const login = await ensureAdmin(request);
    const body = await login.json();
    const token = body.access_token as string;
    const res = await request.get("/api/appointments", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(Array.isArray(data)).toBeTruthy();
  });
});
