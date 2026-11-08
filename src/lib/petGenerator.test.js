// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  generatePetDna,
  getOrCreatePetDna,
  PET_PALETTES,
  regeneratePetDna,
} from "./petGenerator";

describe("Procedural Pet Generator", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("generates valid pet DNA with all required cyber traits", () => {
    const pet = generatePetDna(42);
    expect(pet).toBeDefined();
    expect(typeof pet.name).toBe("string");
    expect(typeof pet.archetype).toBe("string");
    expect(typeof pet.personality).toBe("string");
    expect(pet.palette).toBeDefined();
    expect(pet.palette.neon).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(pet.palette.chassisDark).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(pet.antennaType).toBeDefined();
    expect(pet.earType).toBeDefined();
    expect(pet.eyeShape).toBeDefined();
    expect(typeof pet.hasForeheadGem).toBe("boolean");
  });

  it("produces deterministic results given the same seed", () => {
    const petA = generatePetDna(987654);
    const petB = generatePetDna(987654);

    expect(petA.name).toBe(petB.name);
    expect(petA.archetype).toBe(petB.archetype);
    expect(petA.palette.id).toBe(petB.palette.id);
    expect(petA.antennaType).toBe(petB.antennaType);
    expect(petA.earType).toBe(petB.earType);
    expect(petA.eyeShape).toBe(petB.eyeShape);
  });

  it("persists generated pet DNA to localStorage and reloads it", () => {
    const initialPet = getOrCreatePetDna();
    expect(initialPet).toBeDefined();

    const storedRaw = localStorage.getItem("suivi_travaux_pet_dna");
    expect(storedRaw).not.toBeNull();
    const parsed = JSON.parse(storedRaw);
    expect(parsed.name).toBe(initialPet.name);

    // Second call without clearing returns the exact same pet
    const secondCall = getOrCreatePetDna();
    expect(secondCall.id).toBe(initialPet.id);
    expect(secondCall.name).toBe(initialPet.name);
  });

  it("regenerates pet DNA and updates localStorage", () => {
    const firstPet = getOrCreatePetDna();
    const newPet = regeneratePetDna();

    expect(newPet).toBeDefined();
    const stored = JSON.parse(localStorage.getItem("suivi_travaux_pet_dna"));
    expect(stored.name).toBe(newPet.name);
  });
});
