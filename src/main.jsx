import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import "./index.css";
import App from "./App.jsx";
import { FeedbackProvider } from "./components/Feedback.jsx";

// Service worker: оболочка приложения открывается офлайн.
// В dev-режиме регистрация не нужна — там её заменяет HMR.
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <FeedbackProvider>
      <App />
    </FeedbackProvider>
  </StrictMode>,
);

