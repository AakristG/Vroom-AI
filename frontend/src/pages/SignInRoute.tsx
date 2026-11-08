import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { apiError } from "../api/client";
import { SignInPage } from "../components/SignInPage";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

/** Only same-site paths are allowed as a post-sign-in destination. */
const safeNext = (raw: string | null) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/financial-services");

export function SignInRoute() {
  const [params] = useSearchParams();
  const { account, profile, ready, signIn } = useAuth();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  const asName = params.get("as") ?? "";
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  usePageContext("signin");

  useEffect(() => {
    if (!ready) return;
    if (!asName) {
      if (profile) navigate(next, { replace: true });
      return;
    }
    if (account && account.first_name.toLowerCase() === asName.toLowerCase()) {
      navigate(next, { replace: true });
      return;
    }
    if (started.current) return;
    started.current = true;
    signIn(asName, asName)
      .then(() => navigate(next, { replace: true }))
      .catch((reason) => {
        started.current = false;
        setError(apiError(reason, "That sign-in doesn't match an account."));
      });
  }, [ready, asName, account, profile, next, navigate, signIn]);

  if (!asName && profile) return <Navigate to={next} replace />;

  return (
    <div className="pt-16 md:pt-[72px]">
      {error && (
        <p role="alert" className="mx-auto max-w-6xl px-5 pt-6 text-sm text-signal md:px-8">
          {error}
        </p>
      )}
      <SignInPage prefill={asName} onSignedIn={() => navigate(next, { replace: true })} />
    </div>
  );
}
