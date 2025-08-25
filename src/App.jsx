// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import AuthCallback from "./components/AuthCallback";
import Chat from "./components/chat";
import Profile from "./components/profile";
import Contacts from "./components/contacts";
import ProfileSetup from "./components/ProfileSetup"; // ✅ new

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Contacts />} />
        <Route path="/chat/:chatId" element={<Chat />} />
        <Route path="/profile/:userId" element={<Profile />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/setup-profile" element={<ProfileSetup />} /> {/* ✅ new */}
      </Routes>
    </Router>
  );
}
