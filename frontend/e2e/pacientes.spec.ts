import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./fixtures";

async function loginUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByPlaceholder(/correo/i).fill(E2E_ADMIN.email);
  await page.getByPlaceholder(/contraseña/i).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: /iniciar sesión|crear cuenta/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("Pacientes", () => {
  test("alta de paciente aparece en listado", async ({ page, request }) => {
    const login = await request.post("/api/auth/login", {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    if (!login.ok()) {
      test.skip(true, "Admin E2E no disponible; corre auth.spec primero con DB limpia/setup.");
    }

    const dni = String(Math.floor(10000000 + Math.random() * 89999999));
    const apellidos = `E2E${dni.slice(-4)}`;

    await loginUi(page);
    await page.goto("/pacientes/nuevo");
    await page.getByLabel(/nombres/i).or(page.getByPlaceholder(/nombres/i)).first().fill("Paciente");
    await page.getByLabel(/apellidos/i).or(page.getByPlaceholder(/apellidos/i)).first().fill(apellidos);
    const doc = page.getByLabel(/documento|dni/i).or(page.getByPlaceholder(/documento|dni/i)).first();
    if (await doc.count()) await doc.fill(dni);
    await page.getByRole("button", { name: /crear|guardar|abrir ficha/i }).first().click();
    await page.goto("/pacientes");
    await expect(page.getByText(apellidos)).toBeVisible({ timeout: 15_000 });
  });
});
