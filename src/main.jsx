import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx"; // must match file name exactly (App.jsx)

import "./index.css"; // optional, only if you have global styles

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
