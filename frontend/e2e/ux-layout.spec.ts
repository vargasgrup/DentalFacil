/**
 * Smoke layout / densidad UX — Fase 1 (Bloque A).
 * Viewports de referencia del prompt UX adaptativo.
 */
import { test, expect } from "@playwright/test";

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 812 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "fullhd", width: 1920, height: 1080 },
  { name: "ultrawide", width: 2560, height: 1080 },
] as const;

test.describe("UX adaptativo — layout base", () => {
  for (const vp of VIEWPORTS) {
    test(`login visible @ ${vp.name} (${vp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("/login");
      await expect(page.locator("body")).toBeVisible();
      // No horizontal page lock (allow small scrollbar tolerance)
      const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 24);
    });
  }

  test("data-density se puede aplicar en cliente", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/login");
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-density", "compact");
      localStorage.setItem("nk-ds:ui:density", "compact");
    });
    await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  });
});
