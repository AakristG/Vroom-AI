import { useState, type FormEvent } from "react";
import type { Profile } from "../data/types";
import { Reveal } from "./ui/motion";

export function SignInPage({
  profiles,
  onSignIn,
  prefill = "",
}: {
  profiles: Profile[];
  onSignIn: (id: string) => void;
  prefill?: string;
}) {
  const [username, setUsername] = useState(prefill);
  const [password, setPassword] = useState(prefill);
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
    <main className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 md:grid-cols-2 md:px-8 md:py-24">
      <Reveal>
        <p className="eyebrow">Toyota Financial Services</p>
        <h1 className="section-title mt-4">Sign in to see your next move.</h1>
        <p className="mt-4 max-w-md leading-relaxed text-muted">
          For this demo, the username and the password are both your first name. Signing in opens only that account, and every figure on it is
          fictional.
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
          <button className="btn-primary w-full">Sign in</button>
        </form>
      </Reveal>
    </main>
  );
}
