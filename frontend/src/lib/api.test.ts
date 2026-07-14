import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

function installBrowserStubs() {
  const sessionStorage = {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => {
      storage.set(k, v);
    },
    removeItem: (k: string) => {
      storage.delete(k);
    },
  };
  const localStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  };
  const document = {
    cookie: "",
  };

  vi.stubGlobal("window", {
    sessionStorage,
    localStorage,
    document,
    location: { protocol: "http:" },
  });
  vi.stubGlobal("sessionStorage", sessionStorage);
  vi.stubGlobal("localStorage", localStorage);
  vi.stubGlobal("document", document);
}

describe("apiFetch auth recovery", () => {
  beforeEach(() => {
    storage.clear();
    vi.resetModules();
    vi.unstubAllGlobals();
    installBrowserStubs();
  });

  it("retries once after 401 when refresh succeeds", async () => {
    storage.set(
      "access_token",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb"
    );
    storage.set(
      "refresh_token",
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.ccc.ddd"
    );

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "expired" }), { status: 401 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new.access",
            refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.new.refresh",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("./api");
    const data = await apiFetch<{ ok: boolean }>("/api/patients");
    expect(data.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(storage.get("access_token")).toContain("new.access");
  });

  it("does not rewrite login 401 as session expired", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Email o contraseña incorrectos" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const { apiFetch } = await import("./api");
    await expect(
      apiFetch("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.com", password: "x" }),
      })
    ).rejects.toMatchObject({
      message: "Email o contraseña incorrectos",
    });
  });
});
