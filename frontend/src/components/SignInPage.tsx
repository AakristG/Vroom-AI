import { useState, type FormEvent } from "react";
import type { Profile } from "../data/types";

export function SignInPage({ profiles, onSignIn }: { profiles: Profile[]; onSignIn: (id: string) => void }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const name = username.trim().toLowerCase();
    const secret = password.trim().toLowerCase();
    if (!name || !secret) {
      setError("Enter your name as both the username and the password.");
      return;
    }
    if (name !== secret) {
      setError("The username and password need to match.");
      return;
    }
    const match = profiles.find((profile) => profile.customer.first_name.toLowerCase() === name);
    if (!match) {
      setError("That sign-in doesn't match an account.");
      return;
    }
    setError(null);
    onSignIn(match.customer.customer_id);
  }

  return (
    <main className="mx-auto max-w-lg px-5 py-16 md:py-24">
      <p className="text-sm font-medium text-signal">Toyota Financial Services</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Sign in</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">
        For this demo, the username and the password are both your first name. Signing in opens only that account.
      </p>
      <form onSubmit={submit} className="mt-8 space-y-4">
        <label className="block text-sm">
          <span className="font-medium">Username</span>
          <input
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-line px-4 py-3 outline-none focus:border-ink"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-1 w-full rounded-2xl border border-line px-4 py-3 outline-none focus:border-ink"
          />
        </label>
        {error && <p className="text-sm text-signal">{error}</p>}
        <button className="rounded-full bg-signal px-6 py-3 text-sm font-medium text-white hover:bg-signal-deep">Sign in</button>
      </form>
    </main>
  );
}
