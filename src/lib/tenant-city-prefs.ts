// Pure helpers for tenant city preference + welcome popup decision.
// Extracted so they can be unit-tested without rendering the dashboard.

export const CITY_STORAGE_KEY = "tenant_preferred_city";
export const CITY_PROMPTED_KEY = "tenant_city_prompted";

export function readCity(storage: Pick<Storage, "getItem">): string | null {
  return storage.getItem(CITY_STORAGE_KEY);
}

export function writeCity(
  storage: Pick<Storage, "setItem" | "removeItem">,
  value: string | null,
): void {
  if (value) storage.setItem(CITY_STORAGE_KEY, value);
  else storage.removeItem(CITY_STORAGE_KEY);
}

export function markPrompted(storage: Pick<Storage, "setItem">): void {
  storage.setItem(CITY_PROMPTED_KEY, "1");
}

/**
 * Returns true ONLY on the first visit: no city saved AND user was never
 * prompted AND we have at least one city to choose from.
 */
export function shouldOpenWelcome(opts: {
  selectedCity: string | null;
  prompted: string | null;
  citiesCount: number;
}): boolean {
  if (opts.selectedCity) return false;
  if (opts.prompted) return false;
  return opts.citiesCount > 0;
}
