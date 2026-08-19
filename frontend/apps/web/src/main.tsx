import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { installApiMocks } from "./shared/api/mockApi";
import "./app/styles/fonts";
import "./app/styles/tokens.css";
import "./app/styles/global.css";
import "./app/styles/app-content.css";

if (import.meta.env.DEV) {
  installApiMocks();
}

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
