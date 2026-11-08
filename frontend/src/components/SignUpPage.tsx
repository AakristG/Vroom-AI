import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiError, type SignupInput } from "../api/client";
import { useAuth } from "../state/auth";
import { LIFE_CHANGE_EXAMPLE } from "./LifeShift";
import { Reveal } from "./ui/motion";

const empty: SignupInput = {
  first_name: "",
  last_name: "",
  username: "",
  password: "",
  email: "",
  phone: "",
  city: "",
  state: "TX",
  life_change: "",
  current_payment: "",
  vehicle_model: "",
  vehicle_year: "",
};

const TOYOTA_MODELS = [
  "4Runner", "bZ4X", "Camry", "Corolla", "Corolla Cross", "Crown", "GR86", "Grand Highlander", "Highlander",
  "Land Cruiser", "Prius", "RAV4", "Sequoia", "Sienna", "Supra", "Tacoma", "Tundra", "Venza",
];

export function SignUpPage() {
  const { signUp } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof SignupInput>(key: K, value: SignupInput[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signUp(form);
      navigate("/financial-services", { replace: true });
    } catch (reason) {
      setError(apiError(reason, "The account could not be created. Check that the backend is running."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl items-start gap-12 px-5 py-16 md:grid-cols-2 md:px-8 md:py-24">
      <Reveal>
        <p className="eyebrow">Toyota Financial Services</p>
        <h1 className="section-title mt-4">Create an account</h1>
        <p className="mt-4 max-w-md leading-relaxed text-muted">
          Tell us what changed, in your own words. That note stays with your sign-in on every page, and Nemotron uses it when it suggests a next step.
        </p>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted">Example: “{LIFE_CHANGE_EXAMPLE}”</p>
      </Reveal>
      <Reveal delay={0.08}>
        <form onSubmit={submit} className="card space-y-4 p-6 md:p-8" style={{ boxShadow: "var(--shadow-lift)" }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required autoComplete="given-name" value={form.first_name} onChange={(value) => set("first_name", value)} />
            <Field label="Last name" autoComplete="family-name" value={form.last_name} onChange={(value) => set("last_name", value)} />
          </div>
          <Field label="Username" required value={form.username} autoComplete="username" onChange={(value) => set("username", value)} />
          <Field label="Password" required type="password" value={form.password} autoComplete="new-password" onChange={(value) => set("password", value)} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="City" required autoComplete="address-level2" value={form.city} onChange={(value) => set("city", value)} />
            <Field label="State" autoComplete="address-level1" value={form.state} onChange={(value) => set("state", value)} />
          </div>
          <Field label="Phone" type="tel" autoComplete="tel" value={form.phone} onChange={(value) => set("phone", value)} />
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <Field label="Which Toyota do you drive?" list="toyota-models" placeholder="e.g. RAV4" value={form.vehicle_model} onChange={(value) => set("vehicle_model", value)} />
            <Field label="Year" inputMode="numeric" placeholder="2024" value={form.vehicle_year} onChange={(value) => set("vehicle_year", value.replace(/\D/g, "").slice(0, 4))} />
          </div>
          <datalist id="toyota-models">
            {TOYOTA_MODELS.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
          <Field label="Current monthly payment" inputMode="decimal" placeholder="$" value={form.current_payment} onChange={(value) => set("current_payment", value)} />
          <label className="block text-sm">
            <span className="font-medium">What changed in your life</span>
            <textarea
              required
              rows={4}
              value={form.life_change}
              placeholder={LIFE_CHANGE_EXAMPLE}
              onChange={(event) => set("life_change", event.target.value)}
              className="field mt-2"
            />
          </label>
          {error && (
            <p role="alert" className="text-sm text-signal">
              {error}
            </p>
          )}
          <button disabled={busy} className="btn-primary w-full disabled:opacity-50">
            {busy ? "Creating your account…" : "Create account"}
          </button>
          <p className="text-sm text-muted">
            Already have an account?{" "}
            <Link to="/signin" className="font-medium text-ink underline">
              Sign in
            </Link>
          </p>
        </form>
      </Reveal>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  ...input
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
} & Pick<InputHTMLAttributes<HTMLInputElement>, "type" | "autoComplete" | "list" | "placeholder" | "inputMode">) {
  return (
    <label className="block text-sm">
      <span className="font-medium">
        {label}
        {required && <span className="text-signal" aria-hidden> *</span>}
      </span>
      <input {...input} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="field mt-2" />
    </label>
  );
}
