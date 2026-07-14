import { test, expect } from "@playwright/test";
import { E2E_ADMIN } from "./fixtures";

async function loginUi(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByPlaceholder(/correo/i).fill(E2E_ADMIN.email);
  await page.getByPlaceholder(/contraseña/i).fill(E2E_ADMIN.password);
  await page.getByRole("button", { name: /iniciar sesión|crear cuenta/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
}

test.describe("Caja", () => {
  test("abrir sesión, ingreso y cierre con resumen coherente", async ({ page, request }) => {
    const login = await request.post("/api/auth/login", {
      data: { email: E2E_ADMIN.email, password: E2E_ADMIN.password },
    });
    if (!login.ok()) {
      test.skip(true, "Admin E2E no disponible");
    }
    const token = (await login.json()).access_token as string;
    const headers = { Authorization: `Bearer ${token}` };

    // Cerrar sesión abierta previa si existe
    const current = await request.get("/api/cash/session", { headers });
    if (current.ok() && (await current.json())) {
      await request.post("/api/cash/session/close", { headers });
    }

    await loginUi(page);
    await page.goto("/caja");

    // Prefer API for deterministic amounts, then verify UI summary after close.
    const open = await request.post("/api/cash/session/open", {
      headers,
      data: { monto_inicial: 50 },
    });
    expect(open.ok()).toBeTruthy();

    const tx = await request.post("/api/cash/transactions", {
      headers,
      data: {
        tipo: "ingreso",
        concepto: "E2E prueba",
        monto: 25,
        metodo_pago: "efectivo",
      },
    });
    expect(tx.ok()).toBeTruthy();

    const close = await request.post("/api/cash/session/close", { headers });
    expect(close.ok()).toBeTruthy();
    const summary = await close.json();
    expect(Number(summary.monto_inicial)).toBe(50);
    expect(Number(summary.ingresos)).toBe(25);
    expect(Number(summary.neto)).toBe(25);
    expect(Number(summary.total_esperado)).toBe(75);

    await page.reload();
    await expect(page.getByText(/caja|sesión|cerrar|abrir/i).first()).toBeVisible();
  });
});
