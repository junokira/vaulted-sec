import React, { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import supabase from "./supabaseClient";

// components
import AuthCallback from "./AuthCallback";
import Contacts from "./Contacts";
import Chat from "./Chat";
import Profile from "./Profile";

// ---------------------- MAIN APP ----------------------
export default function App() {
  const [session, setSession] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [viewingProfile, setViewingProfile] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  // Track auth state
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  if (!session) {
    return <AuthScreen />;
  }

  if (viewingProfile) {
    return (
      <Profile
        user={viewingProfile}
        onClose={() => setViewingProfile(null)}
      />
    );
  }

  if (showSettings) {
    return <Settings session={session} onClose={() => setShowSettings(false)} />;
  }

  return (
    <BrowserRouter>
      <Routes>
        {/* Supabase callback route */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Main app */}
        <Route
          path="/*"
          element={
            <div className="bg-black text-gray-300 min-h-screen flex justify-center font-sans">
              <div className="w-full max-w-lg bg-gray-900 rounded-2xl overflow-hidden shadow-xl ring-1 ring-gray-700 flex flex-col h-screen">
                {!activeChat ? (
                  <Contacts
                    session={session}
                    onSelectChat={setActiveChat}
                    onOpenSettings={() => setShowSettings(true)}
                  />
                ) : (
                  <Chat
                    session={session}
                    chat={activeChat}
                    onBack={() => setActiveChat(null)}
                    onOpenProfile={(user) => setViewingProfile(user)}
                  />
                )}
              </div>
            </div>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

// ---------------------- AUTH SCREEN ----------------------
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  const sendMagicLink = async (e) => {
    e.preventDefault();
    if (!email) return;

    setSending(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setSending(false);

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Check your email for the magic link!");
    }
  };

  return (
    <div className="bg-black min-h-screen flex items-center justify-center text-white">
      <form
        onSubmit={sendMagicLink}
        className="bg-gray-900 p-8 rounded-2xl w-full max-w-sm space-y-6 shadow-lg border border-gray-700 text-center"
      >
        <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center mx-auto">
          <span className="font-bold text-lg text-black">V</span>
        </div>
        <h2 className="text-xl font-bold">Welcome to Vaulted</h2>
        <p className="text-sm text-gray-400">Enter your email to sign in</p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200 focus:outline-none"
          placeholder="you@email.com"
          required
        />
        <button
          type="submit"
          disabled={sending}
          className="w-full p-3 rounded-xl bg-gray-600 text-black font-semibold hover:bg-gray-700 disabled:opacity-50"
        >
          {sending ? "Sending..." : "Send Magic Link"}
        </button>
        <p className="text-xs text-gray-500">Your private keys never leave your device.</p>
      </form>
    </div>
  );
}

// ---------------------- SETTINGS ----------------------
function Settings({ session, onClose }) {
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    async function loadProfile() {
      const { data, error } = await supabase
        .from("profiles")
        .select("username, avatar_url, bio")
        .eq("id", session.user.id)
        .single();

      if (data) {
        setUsername(data.username || "");
        setAvatar(data.avatar_url || "");
        setBio(data.bio || "");
      }
      if (error) console.error(error);
    }
    loadProfile();
  }, [session]);

  async function saveProfile(e) {
    e.preventDefault();
    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      username,
      avatar_url: avatar,
      bio,
    });

    if (error) {
      alert("Error saving profile: " + error.message);
    } else {
      alert("Profile updated!");
      onClose();
    }
  }

  return (
    <div className="bg-black min-h-screen flex items-center justify-center text-white">
      <form
        onSubmit={saveProfile}
        className="bg-gray-900 p-8 rounded-2xl w-full max-w-sm space-y-6 shadow-lg border border-gray-700 text-center"
      >
        <h2 className="text-xl font-bold">Profile Settings</h2>
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        />
        <input
          type="text"
          placeholder="Avatar URL"
          value={avatar}
          onChange={(e) => setAvatar(e.target.value)}
          className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        />
        <textarea
          placeholder="Bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        />
        <button
          type="submit"
          className="w-full p-3 rounded-xl bg-gray-600 text-black font-semibold hover:bg-gray-700"
        >
          Save
        </button>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 block w-full mt-2"
        >
          Cancel
        </button>
      </form>
    </div>
  );
}
