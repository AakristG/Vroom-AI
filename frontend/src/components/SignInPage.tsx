import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiError } from "../api/client";
import { useAuth } from "../state/auth";
import { Reveal } from "./ui/motion";

export function SignInPage({ onSignedIn, prefill = "" }: { onSignedIn: () => void; prefill?: string }) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState(prefill);
  const [password, setPassword] = useState(prefill);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username, password);
      onSignedIn();
    } catch (reason) {
      setError(apiError(reason, "That sign-in doesn't match an account."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:px-8 md:py-24">
      <Reveal>
        <p className="eyebrow">Toyota Financial Services</p>
        <h1 className="section-title mt-4">Sign in to see your next move.</h1>
        <p className="mt-4 max-w-md leading-relaxed text-muted">
          One sign-in opens Financial services, Models, and the rest of your account. Demo customers use their first name as both the username and the password.
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <form onSubmit={submit} className="card space-y-4 p-6 md:p-8" style={{ boxShadow: "var(--shadow-lift)" }}>
          <label className="block text-sm">
            <span className="font-medium">Username</span>
            <input autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="field mt-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="field mt-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-signal">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-50">
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <p className="text-sm text-muted">
            New here?{" "}
            <Link to="/signup" className="font-medium text-ink underline">
              Create an account
            </Link>
          </p>
        </form>
      </Reveal>
    </main>
  );
}
