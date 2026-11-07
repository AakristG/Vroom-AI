import { useEffect, useState } from "react";
import { checkBackendHealth } from "./api/client";
import { VoiceWidget } from "./components/VoiceWidget";

function App() {
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    checkBackendHealth().then(setBackendOk);
  }, []);

  return (
    <main className="app">
      <h1>Toyota Financial Services — Voice Assistant</h1>
      <p>
        Backend:{" "}
        {backendOk === null ? "checking..." : backendOk ? "✅ connected" : "❌ unreachable"}
      </p>

      <VoiceWidget />

      {/*
        SpacetimeDB-powered live call dashboard goes here once you've run
        `spacetime generate` (see src/spacetime/module_bindings/README.md) and wired up
        src/spacetime/client.ts -- e.g. call connectToSpacetimeDB() in a useEffect and render
        rows from the call_session / call_message tables.
      */}
    </main>
  );
}

export default App;
