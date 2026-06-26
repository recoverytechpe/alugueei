// LocalStorage helpers for tenant-side prefs: recents, compare, saved searches.

const RECENTS_KEY = "prop:recents";
const COMPARE_KEY = "prop:compare";
const SAVED_KEY = "prop:saved-searches";
const MAX_RECENTS = 12;
const MAX_COMPARE = 3;

export type RecentProperty = {
  id: string;
  title: string;
  city: string | null;
  neighborhood: string | null;
  rent_value: number;
  property_type: string;
  cover: string | null;
  viewed_at: number;
};

export type SavedSearch = {
  id: string;
  name: string;
  search: Record<string, unknown>;
  created_at: number;
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota */ }
}

// ---- Recents ----
export function getRecents(): RecentProperty[] { return read<RecentProperty[]>(RECENTS_KEY, []); }
export function pushRecent(p: Omit<RecentProperty, "viewed_at">): void {
  const list = getRecents().filter((r) => r.id !== p.id);
  list.unshift({ ...p, viewed_at: Date.now() });
  write(RECENTS_KEY, list.slice(0, MAX_RECENTS));
}
export function clearRecents(): void { write(RECENTS_KEY, []); }

// ---- Compare ----
export function getCompareIds(): string[] { return read<string[]>(COMPARE_KEY, []); }
export function toggleCompare(id: string): { ids: string[]; added: boolean; full: boolean } {
  const cur = getCompareIds();
  if (cur.includes(id)) {
    const next = cur.filter((x) => x !== id);
    write(COMPARE_KEY, next);
    return { ids: next, added: false, full: false };
  }
  if (cur.length >= MAX_COMPARE) return { ids: cur, added: false, full: true };
  const next = [...cur, id];
  write(COMPARE_KEY, next);
  return { ids: next, added: true, full: false };
}
export function clearCompare(): void { write(COMPARE_KEY, []); }

// ---- Saved searches ----
export function getSavedSearches(): SavedSearch[] { return read<SavedSearch[]>(SAVED_KEY, []); }
export function saveSearch(name: string, search: Record<string, unknown>): SavedSearch {
  const item: SavedSearch = {
    id: crypto.randomUUID(),
    name: name.trim().slice(0, 60) || "Busca sem nome",
    search,
    created_at: Date.now(),
  };
  const list = [item, ...getSavedSearches()].slice(0, 20);
  write(SAVED_KEY, list);
  return item;
}
export function deleteSavedSearch(id: string): void {
  write(SAVED_KEY, getSavedSearches().filter((s) => s.id !== id));
}
