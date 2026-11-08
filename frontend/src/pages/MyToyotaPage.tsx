import { AccountPage } from "../components/AccountPage";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

export function MyToyotaPage() {
  const { profile } = useAuth();
  usePageContext("my-toyota");
  if (!profile) return null;
  return <AccountPage key={profile.customer.customer_id} p={profile} />;
}
