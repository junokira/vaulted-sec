import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, useNavigate } from "react-router-dom";
import supabase from "./supabaseClient";

import Chat from "./components/chat";
import Contacts from "./components/contacts";
import Profile from "./components/profile";
import AuthCallback from "./components/AuthCallback";
import Settings from "./settings";

const App = () => {
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if already logged in
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user) {
        setUser(data.user);
      }
    });

    // Listen for login/logout changes
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <AuthCallback />
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        <Route path="/" element={<Contacts user={user} />} />
        <Route path="/chat/:id" element={<Chat user={user} />} />
        <Route path="/profile/:id" element={<Profile user={user} />} />
        <Route path="/settings" element={<Settings user={user} />} />
      </Routes>
    </Router>
  );
};

export default App;
