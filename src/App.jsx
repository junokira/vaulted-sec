// src/App.jsx
import React, { useEffect, useState } from "react";
import { Routes, Route, Link, useNavigate } from "react-router-dom";
import supabase from "./supabaseClient"; // default export available
import AuthCallback from "./AuthCallback.jsx";
import Contacts from "./components/contacts.jsx";
import Chat from "./components/chat.jsx";
import Profile from "./components/profile.jsx";
import Settings from "./settings.jsx";

/**
 * App.jsx
 * - top-level auth handling
 * - simple nav
 */

export default function App() {
  const [session, setSession] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    // initialize current session
    let mounted = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(data?.session ?? null);
      } catch (e) {
        console.warn("getSession error", e);
      }
    })();

    // subscribe to auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      // redirect on sign-in
      if (session) navigate("/");
    });

    return () => {
      mounted = false;
      subscription?.unsubscribe();
    };
  }, [navigate]);

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
    navigate("/");
  }

  return (
    <div className="app-root">
      <header className="topbar">
        <div className="left">
          <Link to="/" className="brand">Vaulted</Link>
        </div>
        <div className="right">
          {session?.user ? (
            <>
              <span className="user-email">{session.user.email}</span>
              <button onClick={() => navigate("/profile")}>Profile</button>
              <button onClick={signOut}>Sign out</button>
            </>
          ) : (
            <button onClick={() => navigate("/")}>Sign in</button>
          )}
        </div>
      </header>

      <main>
        <Routes>
          <Route path="/" element={<Contacts session={session} />} />
          <Route path="/auth/callback" element={<AuthCallback />} />
          <Route path="/chat/:chatId" element={<Chat session={session} />} />
          <Route path="/profile" element={<Profile session={session} />} />
          <Route path="/settings" element={<Settings session={session} />} />
          {/* fallback */}
          <Route path="*" element={<div>Not Found</div>} />
        </Routes>
      </main>
    </div>
  );
}
