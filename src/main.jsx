import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource-variable/geist";
import App from "./App.jsx";
import "./styles.css";
import "./refined-theme.css";
import "./premium-theme.css";
import "./brand-theme.css";
createRoot(document.getElementById("root")).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
