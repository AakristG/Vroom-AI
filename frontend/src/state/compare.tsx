import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

const STORAGE_KEY = "tfs-compare";
export const COMPARE_LIMIT = 3;

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

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  }, [ids]);

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
