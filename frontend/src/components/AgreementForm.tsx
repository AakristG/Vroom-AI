import { useState, type FormEvent, type InputHTMLAttributes } from "react";
import { apiError, hasAgreement } from "../api/client";
import { cn } from "../lib/format";
import { useAuth } from "../state/auth";

type Kind = "loan" | "lease";

const str = (n: number | null | undefined) => (n == null ? "" : String(n));

/** Lets a self-registered customer type in their loan or lease terms. The backend validates and stores them. */
export function AgreementForm({ onDone, onCancel }: { onDone?: () => void; onCancel?: () => void }) {
  const { account, saveAgreement } = useAuth();
  const current = hasAgreement(account?.agreement) ? account.agreement : null;
  const [kind, setKind] = useState<Kind>(current?.contract_type ?? "loan");
  const [payment, setPayment] = useState(str(account?.current_payment));
  const [due, setDue] = useState(str(current?.payment_due_day));
  const [balance, setBalance] = useState(current?.contract_type === "loan" ? str(current.current_balance) : "");
  const [apr, setApr] = useState(current?.contract_type === "loan" ? str(current.apr) : "");
  const [months, setMonths] = useState(current?.contract_type === "lease" ? str(current.months_remaining) : "");
  const [residual, setResidual] = useState(current?.contract_type === "lease" ? str(current.residual_value) : "");
  const [allowance, setAllowance] = useState(current?.contract_type === "lease" ? str(current.mileage_allowance_total) : "");
  const [odometer, setOdometer] = useState(current?.contract_type === "lease" ? str(current.odometer_now) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const terms: Record<string, string> =
      kind === "loan"
        ? { current_balance: balance, apr }
        : { months_remaining: months, residual_value: residual, mileage_allowance_total: allowance, odometer_now: odometer };
    try {
      await saveAgreement({ current_payment: payment, agreement: { contract_type: kind, payment_due_day: due, ...terms } });
      onDone?.();
    } catch (reason) {
      setError(apiError(reason, "Those details could not be saved. Check that the backend is running."));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await saveAgreement({ agreement: null });
      onDone?.();
    } catch (reason) {
      setError(apiError(reason, "Those details could not be removed."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div role="radiogroup" aria-label="Financing type" className="inline-flex rounded-full border border-line bg-mist p-1">
        {(["loan", "lease"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              "rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200",
              kind === k ? "bg-ink text-white" : "text-muted hover:text-ink"
            )}
          >
            {k === "loan" ? "Loan" : "Lease"}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Monthly payment" required prefix="$" inputMode="decimal" value={payment} onChange={setPayment} />
        <Field label="Payment due day" hint="1–28" inputMode="numeric" placeholder="1" value={due} onChange={(v) => setDue(v.replace(/\D/g, "").slice(0, 2))} />
        {kind === "loan" ? (
          <>
            <Field label="Current loan balance" required prefix="$" inputMode="decimal" value={balance} onChange={setBalance} />
            <Field label="APR" required suffix="%" inputMode="decimal" placeholder="6.9" value={apr} onChange={setApr} />
          </>
        ) : (
          <>
            <Field label="Months left on the lease" required inputMode="numeric" value={months} onChange={(v) => setMonths(v.replace(/\D/g, "").slice(0, 2))} />
            <Field label="Residual (buyout) value" hint="Optional" prefix="$" inputMode="decimal" value={residual} onChange={setResidual} />
            <Field label="Total mileage allowance" hint="Optional" inputMode="numeric" placeholder="36000" value={allowance} onChange={setAllowance} />
            <Field label="Odometer today" hint="Optional" inputMode="numeric" value={odometer} onChange={setOdometer} />
          </>
        )}
      </div>

      <p className="text-xs leading-relaxed text-muted">
        You'll find these on your monthly statement or in the Toyota Financial Services app. We use them only to run the numbers on this page. They are not
        checked against your actual agreement.
      </p>

      {error && (
        <p role="alert" className="text-sm text-signal">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={busy} className="btn-primary disabled:opacity-50">
          {busy ? "Saving…" : current ? "Update my numbers" : "Show my numbers"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="btn-ghost">
            Cancel
          </button>
        )}
        {current && (
          <button type="button" onClick={remove} disabled={busy} className="ml-auto text-sm font-medium text-muted underline hover:text-ink">
            Remove these details
          </button>
        )}
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  prefix,
  suffix,
  value,
  onChange,
  required,
  ...input
}: {
  label: string;
  hint?: string;
  prefix?: string;
  suffix?: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
} & Pick<InputHTMLAttributes<HTMLInputElement>, "inputMode" | "placeholder">) {
  return (
    <label className="block text-sm">
      <span className="font-medium">
        {label}
        {required && <span className="text-signal" aria-hidden> *</span>}
        {hint && <span className="ml-1.5 font-normal text-muted">{hint}</span>}
      </span>
      <span className="relative mt-2 block">
        {prefix && <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">{prefix}</span>}
        <input
          {...input}
          required={required}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn("field", prefix && "pl-8", suffix && "pr-9")}
        />
        {suffix && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted">{suffix}</span>}
      </span>
    </label>
  );
}
