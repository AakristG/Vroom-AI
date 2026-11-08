import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { safeNext } from "../lib/safeNext";
import { useAuth } from "../state/auth";

function AuthLoading() {
  return (
    <div data-dark-top className="min-h-[70vh] bg-charcoal pt-32" aria-busy="true">
      <div className="mx-auto max-w-7xl px-5 md:px-8">
        <div className="h-4 w-40 animate-pulse rounded bg-white/10" />
        <div className="mt-5 h-12 w-2/3 animate-pulse rounded bg-white/10" />
      </div>
    </div>
  );
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { account, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <AuthLoading />;
  if (!account) {
    const intended = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/signin?next=${encodeURIComponent(safeNext(intended, intended))}`} replace />;
  }
  return children;
}
