import { AccountPage } from "../components/AccountPage";
import { SignInGate } from "../components/SignInGate";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

export function FinancialServicesPage() {
  const { profile, ready } = useAuth();
  usePageContext("financial-services");
  if (!ready) return <main className="min-h-[50vh] pt-32" />;
  if (!profile) return <SignInGate next="/financial-services" title="Sign in to use financial services." />;
  return <AccountPage key={profile.customer.customer_id} p={profile} />;
}
