import { Eye, EyeOff } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { apiError } from "../api/client";
import { useAuth } from "../state/auth";
import { Reveal } from "./ui/motion";
import { ToyotaMark } from "./ToyotaMark";

export function SignInPage({ onSignedIn }: { onSignedIn: () => void }) {
  const { signIn } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const typedUsername = String(data.get("username") || username);
    const typedPassword = String(data.get("password") || password);
    if (!typedUsername.trim() || !typedPassword) {
      setError("Enter your username and password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(typedUsername, typedPassword);
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
        <span className="grid h-11 w-[3.25rem] place-items-center rounded-lg bg-white shadow-sm">
          <ToyotaMark className="h-8 w-auto" />
        </span>
        <p className="eyebrow mt-6">Toyota Financial Services</p>
        <h1 className="section-title mt-4">Sign in to see your next move.</h1>
        <p className="mt-4 max-w-md leading-relaxed text-muted">
          One sign-in opens Explore, Compare, Financial Insights, My Toyota, and the AI assistant.
        </p>
        <Link to="/" className="mt-6 inline-block text-sm font-medium text-ink underline">
          Return to home
        </Link>
      </Reveal>
      <Reveal delay={0.08}>
        <form onSubmit={submit} className="card space-y-4 p-6 md:p-8" style={{ boxShadow: "var(--shadow-lift)" }}>
          <label className="block text-sm">
            <span className="font-medium">Username</span>
            <input name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} className="field mt-2" />
          </label>
          <label className="block text-sm">
            <span className="font-medium">Password</span>
            <span className="relative mt-2 block">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="field pr-12"
              />
              <button
                type="button"
                onClick={() => setShowPassword((on) => !on)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
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
