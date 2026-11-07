import { useEffect, useState } from "react";
import { AccountPage } from "./components/AccountPage";
import { LandingPage } from "./components/LandingPage";
import { SignInPage } from "./components/SignInPage";
import { SiteFooter, SiteHeader } from "./components/SiteHeader";
import { profiles } from "./data/types";

const STORAGE_KEY = "tfs-customer";

type View = "home" | "signin" | "account";

function App() {
  const [customerId, setCustomerId] = useState<string | null>(() => sessionStorage.getItem(STORAGE_KEY));
  const [view, setView] = useState<View>(() => (sessionStorage.getItem(STORAGE_KEY) ? "account" : "home"));

  const profile = profiles.find((p) => p.customer.customer_id === customerId) ?? null;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [view, customerId]);

  const goHome = (section?: string) => {
    setView("home");
    if (section) {
      window.setTimeout(() => document.getElementById(section)?.scrollIntoView({ behavior: "smooth" }), 40);
    }
  };

  const signIn = (id: string) => {
    sessionStorage.setItem(STORAGE_KEY, id);
    setCustomerId(id);
    setView("account");
  };

  const signOut = () => {
    sessionStorage.removeItem(STORAGE_KEY);
    setCustomerId(null);
    setView("home");
  };

  return (
    <div className="min-h-screen bg-daylight text-ink">
      <SiteHeader
        signedInName={profile?.customer.first_name ?? null}
        onHome={goHome}
        onSignIn={() => setView("signin")}
        onAccount={() => setView(profile ? "account" : "signin")}
        onSignOut={signOut}
      />
      {view === "account" && profile ? (
        <AccountPage key={profile.customer.customer_id} p={profile} />
      ) : view === "signin" ? (
        <SignInPage profiles={profiles} onSignIn={signIn} />
      ) : (
        <LandingPage onSignIn={() => setView("signin")} />
      )}
      <SiteFooter />
    </div>
  );
}

export default App;
