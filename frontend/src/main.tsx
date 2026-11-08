import { LaunchSplash } from "./components/LaunchSplash";
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { AssistantProvider } from "./state/assistant";
import { AuthProvider } from "./state/auth";
import { CompareProvider } from "./state/compare";
import { VoiceSessionProvider } from "./state/voiceSession";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <CompareProvider>
          <AssistantProvider>
            <VoiceSessionProvider>
              <><LaunchSplash /><App /></>
            </VoiceSessionProvider>
          </AssistantProvider>
        </CompareProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);

