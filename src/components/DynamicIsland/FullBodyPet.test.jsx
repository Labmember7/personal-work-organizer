// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { FullBodyPet } from "./FullBodyPet.jsx";

beforeEach(() => {
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    imageSmoothingEnabled: false,
  }));
});

afterEach(() => {
  cleanup();
});

describe("FullBodyPet", () => {
  it("renders canvas element with pixelated style and DPR scaling", () => {
    const { container } = render(<FullBodyPet size={90} />);
    const canvas = container.querySelector("canvas");
    expect(canvas).toBeTruthy();
    expect(canvas.style.imageRendering).toBe("pixelated");
  });

  it("handles click interaction and triggers callback", () => {
    const onClick = vi.fn();
    const { container } = render(<FullBodyPet size={90} onClick={onClick} />);
    const pod = container.querySelector(".trk-fullbody-pet-pod");
    expect(pod).toBeTruthy();

    fireEvent.click(pod);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(pod.classList.contains("trk-pet-bouncing")).toBe(true);
  });

  it("applies mood and custom dna", () => {
    const mockDna = {
      name: "PixelBot",
      archetype: "Quantum Sprite",
      palette: {
        chassisDark: "#101010",
        chassisMid: "#202020",
        chassisLight: "#303030",
        rim: "#ffffff",
        neon: "#00ffcc",
        glow: "#00ccaa",
      },
      antennaType: "cat_ears",
      earType: "cyber_wings",
      eyeShape: "visor_strip",
    };

    const { container } = render(<FullBodyPet dna={mockDna} mood="focused" size={100} />);
    const pod = container.querySelector(".trk-fullbody-pet-pod");
    expect(pod.getAttribute("title")).toContain("PixelBot");
    expect(pod.getAttribute("title")).toContain("Quantum Sprite");
  });
});

