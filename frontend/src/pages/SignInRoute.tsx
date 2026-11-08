import { useEffect } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { SignInPage } from "../components/SignInPage";
import { profiles } from "../data/types";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

/** Only same-site paths are allowed as a post-sign-in destination. */
const safeNext = (raw: string | null) => (raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/my-toyota");

export function SignInRoute() {
  const [params] = useSearchParams();
  const { profile, signIn } = useAuth();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  usePageContext("signin");

  useEffect(() => {
    if (profile && !params.get("as")) navigate(next, { replace: true });
  }, [profile, params, next, navigate]);

  if (profile && !params.get("as")) return <Navigate to={next} replace />;

  return (
    <div className="pt-16 md:pt-[72px]">
      <SignInPage
        profiles={profiles}
        prefill={params.get("as") ?? ""}
        onSignIn={(id) => {
          signIn(id);
          navigate(next, { replace: true });
        }}
      />
    </div>
  );
}
