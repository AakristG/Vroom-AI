import { createContext, useContext, useState, type ReactNode } from "react";
import { profiles, type Profile } from "../data/types";

const STORAGE_KEY = "tfs-customer";

interface Auth {
  profile: Profile | null;
  signIn: (customerId: string) => void;
  signOut: () => void;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [customerId, setCustomerId] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const profile = profiles.find((p) => p.customer.customer_id === customerId) ?? null;

  const signIn = (id: string) => {
    sessionStorage.setItem(STORAGE_KEY, id);
    setCustomerId(id);
  };
  const signOut = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setCustomerId(null);
  };

  return <AuthContext.Provider value={{ profile, signIn, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
