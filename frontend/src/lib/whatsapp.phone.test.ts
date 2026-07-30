import { describe, expect, it } from "vitest";
import { isValidPhone, normalizePeruPhone } from "./whatsapp";

describe("normalizePeruPhone", () => {
  it("adds country code to 9-digit mobile", () => {
    expect(normalizePeruPhone("987654321")).toBe("51987654321");
  });

  it("keeps existing 51 prefix", () => {
    expect(normalizePeruPhone("+51 987 654 321")).toBe("51987654321");
  });

  it("strips leading 0 from 09xxxxxxxx", () => {
    expect(normalizePeruPhone("0987654321")).toBe("51987654321");
  });

  it("rejects too-short numbers", () => {
    expect(normalizePeruPhone("12345")).toBeNull();
  });
});

describe("isValidPhone", () => {
  it("accepts common clinic formats", () => {
    expect(isValidPhone("987654321")).toBe(true);
    expect(isValidPhone("51 987654321")).toBe(true);
  });

  it("rejects empty", () => {
    expect(isValidPhone(null)).toBe(false);
    expect(isValidPhone("")).toBe(false);
  });
});
