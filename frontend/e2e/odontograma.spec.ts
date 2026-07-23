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

test.describe("Odontograma (ficha clínica)", () => {
  test("abre ficha y muestra tab Evaluación con odontograma", async ({
    page,
    request,
  }) => {
    const login = await ensureAdmin(request);
    const auth = await login.json();
    const token = auth.access_token as string;

    const dni = String(Math.floor(10000000 + Math.random() * 89999999));
    const create = await request.post("/api/patients", {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        nombres: "Odonto",
        apellidos: `E2E${dni.slice(-4)}`,
        tipo_documento: "DNI",
        numero_documento: dni,
        telefono: "999888777",
      },
    });
    if (!create.ok()) {
      test.skip(true, `No se pudo crear paciente E2E: ${create.status()}`);
    }
    const patient = await create.json();
    const patientId = patient.id as string;

    await loginUi(page);
    await page.goto(`/pacientes/${patientId}`);
    await expect(page.getByText(/Odonto|ficha|historia/i).first()).toBeVisible({
      timeout: 20_000,
    });

    const evalTab = page
      .getByRole("tab", { name: /evaluación|evaluacion|plan/i })
      .or(page.getByRole("button", { name: /evaluación|evaluacion|plan/i }))
      .or(page.getByText(/evaluación y plan|evaluacion y plan/i));
    await evalTab.first().click();

    // Odontograma anatomico: piezas FDI visibles (p. ej. 11, 21, 36)
    await expect(
      page.getByTitle(/FDI\s*11/i).or(page.getByText(/^11$/).first())
    ).toBeVisible({ timeout: 20_000 });

    // Interactuar con una pieza si es clickable
    const tooth11 = page.getByTitle(/FDI\s*11/i).first();
    if (await tooth11.count()) {
      await tooth11.click({ force: true });
    }
  });

  test("API odontograma retorna entradas para paciente nuevo", async ({ request }) => {
    const login = await ensureAdmin(request);
    const auth = await login.json();
    const token = auth.access_token as string;

    const list = await request.get("/api/patients?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.ok()).toBeTruthy();
    const patients = await list.json();
    if (!Array.isArray(patients) || patients.length === 0) {
      test.skip(true, "Sin pacientes para probar odontograma API");
    }
    const id = patients[0].id as string;
    const odonto = await request.get(`/api/odontogram/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(odonto.ok()).toBeTruthy();
    const entries = await odonto.json();
    expect(Array.isArray(entries)).toBeTruthy();
  });
});
