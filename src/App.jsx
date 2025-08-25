import React, { useEffect, useState } from "react";
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import supabase from "./supabaseClient";

// Components
import AuthCallback from "./components/AuthCallback";
import Chat from "./components/chat";
import Profile from "./components/profile";
import Contacts from "./components/contacts";
import Settings from "./settings";

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check auth state on load
  useEffect(() => {
    const getUser = async () => {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        console.error("Error fetching user:", error.message);
      }
      setUser(data?.user || null);
      setLoading(false);
    };

    getUser();

    // Listen for login/logout
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        Loading...
      </div>
    );
  }

  return (
    <Router>
      <Routes>
        {/* Auth Callback */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* If logged in, show app */}
        {user ? (
          <>
            <Route path="/" element={<Contacts user={user} />} />
            <Route path="/chat/:chatId" element={<Chat user={user} />} />
            <Route path="/profile/:userId" element={<Profile currentUser={user} />} />
            <Route path="/settings" element={<Settings user={user} />} />
          </>
        ) : (
          // If not logged in, send to login
          <Route path="*" element={<Navigate to="/auth/callback" />} />
        )}
      </Routes>
    </Router>
  );
}

export default App;
