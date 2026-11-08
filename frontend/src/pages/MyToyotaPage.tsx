import { AccountPage } from "../components/AccountPage";
import { SignInGate } from "../components/SignInGate";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

export function MyToyotaPage() {
  const { profile } = useAuth();
  usePageContext("my-toyota");
  if (!profile) return <SignInGate next="/my-toyota" title="Sign in to see your Toyota." />;
  return <AccountPage key={profile.customer.customer_id} p={profile} />;
}
