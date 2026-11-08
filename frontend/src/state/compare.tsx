import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { saveCompareSelection, useCompareSelectionRow } from "../spacetime/client";
import { useAuth } from "./auth";

const STORAGE_KEY = "tfs-compare";
// Keep in sync with COMPARE_LIMIT in backend/apps/vehicles/views.py.
export const COMPARE_LIMIT = 8;

interface Compare {
  ids: string[];
  has: (id: string) => boolean;
  toggle: (id: string) => void;
  remove: (id: string) => void;
  replace: (ids: string[]) => void;
  full: boolean;
}

const CompareContext = createContext<Compare | null>(null);

function load(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(raw) ? raw.filter((x) => typeof x === "string").slice(0, COMPARE_LIMIT) : [];
  } catch {
    return [];
  }
}

export function CompareProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[]>(load);
  const { profile } = useAuth();
  const customerId = profile?.customer.customer_id ?? null;
  const { row, status } = useCompareSelectionRow(customerId);
  const synced = useRef<string | null>(null);

  // SpacetimeDB holds the selection, so it follows the customer across tabs and devices.
  useEffect(() => {
    if (!row) return;
    if (row.idsJson === synced.current) return;
    try {
      const remote = JSON.parse(row.idsJson);
      if (Array.isArray(remote)) {
        synced.current = row.idsJson;
        setIds(remote.filter((x): x is string => typeof x === "string").slice(0, COMPARE_LIMIT));
      }
    } catch {
      /* ignore a malformed row */
    }
  }, [row]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
    } catch {
      /* storage unavailable */
    }
    const json = JSON.stringify(ids);
    if (!customerId || status !== "live" || json === synced.current) return;
    // First connection with no saved row: an empty local list must not wipe nothing; just mark it synced.
    if (!row && !ids.length) {
      synced.current = json;
      return;
    }
    if (saveCompareSelection(customerId, ids)) synced.current = json;
  }, [ids, customerId, status, row]);

  const value: Compare = {
    ids,
    has: (id) => ids.includes(id),
    toggle: (id) =>
      setIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length >= COMPARE_LIMIT ? cur : [...cur, id])),
    remove: (id) => setIds((cur) => cur.filter((x) => x !== id)),
    replace: (next) => setIds(next.slice(0, COMPARE_LIMIT)),
    full: ids.length >= COMPARE_LIMIT,
  };

  return <CompareContext.Provider value={value}>{children}</CompareContext.Provider>;
}

export function useCompare() {
  const ctx = useContext(CompareContext);
  if (!ctx) throw new Error("useCompare must be used inside CompareProvider");
  return ctx;
}
