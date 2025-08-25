import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthCallback from "./AuthCallback";
// … other imports

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/*" element={<MainApp />} /> {/* your main app */}
      </Routes>
    </BrowserRouter>
  );
}
