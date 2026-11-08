import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { SignInPage } from "../components/SignInPage";
import { safeNext } from "../lib/safeNext";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

export function SignInRoute() {
  const [params] = useSearchParams();
  const { profile, ready } = useAuth();
  const navigate = useNavigate();
  const next = safeNext(params.get("next"));
  usePageContext("signin");

  if (!ready) return <div className="min-h-[50vh] pt-32" aria-busy="true" />;
  if (profile) return <Navigate to={next} replace />;

  return (
    <div className="pt-16 md:pt-[72px]">
      <SignInPage onSignedIn={() => navigate(next, { replace: true })} />
    </div>
  );
}
