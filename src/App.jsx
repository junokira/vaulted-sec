import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { supabase } from "./supabaseClient";
import AuthCallback from "./AuthCallback";
import Chat from "./Chat";
import Profile from "./Profile";
import Contacts from "./Contacts";

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load session on startup
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUser(data.session.user);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black text-white">
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Magic link redirect */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Authenticated routes */}
        {user ? (
          <>
            <Route path="/" element={<Contacts user={user} />} />
            <Route path="/chat/:chatId" element={<Chat user={user} />} />
            <Route path="/profile/:id" element={<Profile user={user} />} />
          </>
        ) : (
          <Route path="*" element={<Navigate to="/auth/callback" />} />
        )}
      </Routes>
    </Router>
  );
}
