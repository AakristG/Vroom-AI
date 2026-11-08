import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { getMe, isUnauthorized, login, logout, signup, TOKEN_KEY, updateAccount, type AccountPatch, type AuthAccount, type SignupInput } from "../api/client";
import { clearVehicleCache } from "../api/vehicles";
import type { Profile } from "../data/types";
import { knownProfile, shellProfile } from "../lib/sessionProfile";

interface Auth {
  account: AuthAccount | null;
  profile: Profile | null;
  ready: boolean;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (input: SignupInput) => Promise<void>;
  saveLifeChange: (value: string) => Promise<void>;
  /** Throws with the backend's message when the terms don't validate. */
  saveAgreement: (patch: Pick<AccountPatch, "current_payment" | "agreement">) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AuthAccount | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getMe()
      .then(setAccount)
      .catch((error) => {
        if (isUnauthorized(error)) sessionStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => {
      sessionStorage.removeItem(TOKEN_KEY);
      setAccount(null);
      clearVehicleCache();
    };
    window.addEventListener("tfs-auth-logout", onLogout);
    return () => window.removeEventListener("tfs-auth-logout", onLogout);
  }, []);

  const profile = useMemo(() => (account ? knownProfile(account) ?? shellProfile(account) : null), [account]);

  const signIn = useCallback(async (username: string, password: string) => {
    setAccount(await login(username, password));
  }, []);

  const signUp = useCallback(async (input: SignupInput) => {
    setAccount(await signup(input));
  }, []);

  const accountRef = useRef(account);
  accountRef.current = account;

  const saveLifeChange = useCallback(async (value: string) => {
    const current = accountRef.current;
    const next = value.trim();
    if (!current || current.life_change === next) return;
    setAccount({ ...current, life_change: next });
    try {
      setAccount(await updateAccount({ life_change: next }));
    } catch {
      /* The note stays on screen. The next edit tries again. */
    }
  }, []);

  const saveAgreement = useCallback(async (patch: Pick<AccountPatch, "current_payment" | "agreement">) => {
    setAccount(await updateAccount(patch));
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setAccount(null);
    clearVehicleCache();
    window.dispatchEvent(new Event("tfs-auth-logout"));
    window.location.replace("/");
  }, []);

  return (
    <AuthContext.Provider value={{ account, profile, ready, signIn, signUp, saveLifeChange, saveAgreement, signOut }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
