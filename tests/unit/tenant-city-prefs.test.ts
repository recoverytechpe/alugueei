import { describe, it, expect, beforeEach } from "vitest";
import {
  CITY_PROMPTED_KEY,
  CITY_STORAGE_KEY,
  markPrompted,
  readCity,
  shouldOpenWelcome,
  writeCity,
} from "@/lib/tenant-city-prefs";

function makeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() { return map.size; },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => { map.set(k, String(v)); },
    removeItem: (k: string) => { map.delete(k); },
    key: (i: number) => Array.from(map.keys())[i] ?? null,
  };
}

describe("shouldOpenWelcome", () => {
  it("opens on first visit when cities are available", () => {
    expect(shouldOpenWelcome({ selectedCity: null, prompted: null, citiesCount: 3 })).toBe(true);
  });

  it("does NOT open when a city is already saved", () => {
    expect(shouldOpenWelcome({ selectedCity: "Rio de Janeiro", prompted: null, citiesCount: 3 })).toBe(false);
  });

  it("does NOT open when the user was already prompted (dismissed previously)", () => {
    expect(shouldOpenWelcome({ selectedCity: null, prompted: "1", citiesCount: 3 })).toBe(false);
  });

  it("does NOT open when no cities are available yet", () => {
    expect(shouldOpenWelcome({ selectedCity: null, prompted: null, citiesCount: 0 })).toBe(false);
  });
});

describe("tenant city persistence", () => {
  let storage: Storage;
  beforeEach(() => { storage = makeStorage(); });

  it("persists and reads the chosen city", () => {
    writeCity(storage, "São Paulo");
    expect(storage.getItem(CITY_STORAGE_KEY)).toBe("São Paulo");
    expect(readCity(storage)).toBe("São Paulo");
  });

  it("clears the saved city when value is null", () => {
    writeCity(storage, "São Paulo");
    writeCity(storage, null);
    expect(readCity(storage)).toBeNull();
  });

  it("marks prompted so the popup never reopens", () => {
    markPrompted(storage);
    expect(storage.getItem(CITY_PROMPTED_KEY)).toBe("1");
    expect(
      shouldOpenWelcome({
        selectedCity: null,
        prompted: storage.getItem(CITY_PROMPTED_KEY),
        citiesCount: 5,
      }),
    ).toBe(false);
  });

  it("end-to-end: first visit opens, after save it never reopens", () => {
    // First visit
    expect(
      shouldOpenWelcome({
        selectedCity: readCity(storage),
        prompted: storage.getItem(CITY_PROMPTED_KEY),
        citiesCount: 4,
      }),
    ).toBe(true);

    // User saves a city
    writeCity(storage, "Rio de Janeiro");
    markPrompted(storage);

    // Subsequent visit
    expect(
      shouldOpenWelcome({
        selectedCity: readCity(storage),
        prompted: storage.getItem(CITY_PROMPTED_KEY),
        citiesCount: 4,
      }),
    ).toBe(false);
  });

  it("end-to-end: dismissing also prevents reopening", () => {
    markPrompted(storage); // dismissed without saving
    expect(
      shouldOpenWelcome({
        selectedCity: readCity(storage),
        prompted: storage.getItem(CITY_PROMPTED_KEY),
        citiesCount: 4,
      }),
    ).toBe(false);
  });
});
