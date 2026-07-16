import { describe, it, expect } from "vitest";
import { plural } from "./plural";

describe("plural", () => {
  it("français : singulier à 0 et 1", () => {
    expect(plural("fr", 0)).toBe("");
    expect(plural("fr", 1)).toBe("");
    expect(plural("fr", 2)).toBe("s");
  });
  it("anglais : pluriel dès que n ≠ 1", () => {
    expect(plural("en", 0)).toBe("s");
    expect(plural("en", 1)).toBe("");
    expect(plural("en", 2)).toBe("s");
  });
  it("accepte un suffixe personnalisé (statuses)", () => {
    expect(plural("en", 2, "es")).toBe("es");
    expect(plural("en", 1, "es")).toBe("");
  });
});
