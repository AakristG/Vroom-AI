import { AccountPage } from "../components/AccountPage";
import { usePageContext } from "../state/assistant";
import { useAuth } from "../state/auth";

export function FinancialServicesPage() {
  const { profile } = useAuth();
  usePageContext("financial-services");
  if (!profile) return null;
  return <AccountPage key={profile.customer.customer_id} p={profile} />;
}
