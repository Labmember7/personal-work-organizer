// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { LanguageProvider } from "../i18n/index";
import { Gauge } from "./Gauge.jsx";
import {
  THEMES,
  CURATED_SCULPTURES,
  getSculptureForTheme,
  getNextTheme,
  isLightTheme,
} from "../lib/themes";

afterEach(cleanup);

describe("Theme registry & 6 abstract progression sculptures", () => {
  it("maps every curated theme to a unique progression sculpture", () => {
    const curated = THEMES.filter((t) => t.id !== "random");
    expect(curated.length).toBe(6);
    const sculptures = new Set(curated.map((t) => getSculptureForTheme(t.id)));
    expect(sculptures.size).toBe(6);
    for (const sc of CURATED_SCULPTURES) {
      expect(sculptures.has(sc)).toBe(true);
    }
  });

  it("correctly distinguishes dark and light themes and cycles through all themes", () => {
    expect(isLightTheme("light")).toBe(true);
    expect(isLightTheme("sand")).toBe(true);
    expect(isLightTheme("dark")).toBe(false);
    expect(isLightTheme("nebula")).toBe(false);
    expect(isLightTheme("forest")).toBe(false);
    expect(isLightTheme("synth")).toBe(false);
    expect(getNextTheme("dark")).toBe("light");
    expect(getNextTheme("random")).toBe("dark");
  });

  it.each([
    ["dark", "mosaic", ".trk-sculp-mosaic"],
    ["light", "dawn", ".trk-sculp-dawn"],
    ["nebula", "starchart", ".trk-sculp-starchart"],
    ["forest", "bloom", ".trk-sculp-bloom"],
    ["synth", "harmony", ".trk-sculp-studio"],
    ["sand", "cairn", ".trk-sculp-cairn"],
  ])(
    "dynamically loads and renders the %s theme's %s sculpture",
    async (themeId, sculptureId, svgSelector) => {
      const { container } = render(
        <LanguageProvider>
          <Gauge
            value={58}
            doneCount={5}
            inProgressCount={3}
            totalTasks={10}
            theme={themeId}
          />
        </LanguageProvider>
      );

      const bar = container.querySelector('[role="progressbar"]');
      expect(bar).toBeTruthy();
      expect(bar?.getAttribute("data-sculpture")).toBe(sculptureId);
      expect(bar?.getAttribute("aria-valuenow")).toBe("58");

      await waitFor(() => {
        expect(container.querySelector(svgSelector)).toBeTruthy();
      });
    }
  );
});
