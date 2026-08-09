window.addEventListener("error", (event) => {
  document.body.innerHTML = `
    <pre style="
      white-space:pre-wrap;
      padding:20px;
      color:red;
      background:white;
      font:14px monospace;
    ">${event.message}\n\n${event.filename}:${event.lineno}:${event.colno}</pre>
  `;
});

window.addEventListener("unhandledrejection", (event) => {
  document.body.innerHTML = `
    <pre style="
      white-space:pre-wrap;
      padding:20px;
      color:red;
      background:white;
      font:14px monospace;
    ">Unhandled rejection:\n\n${String(event.reason)}</pre>
  `;
});
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "@tanstack/react-router";

import "./styles.css";
import { getRouter } from "./router";

const router = getRouter();

const container = document.getElementById("root");
if (!container) throw new Error("Application root element is missing.");

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
