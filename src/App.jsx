import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import supabase from './supabaseClient';

// IMPORTANT: these paths MUST match your filenames exactly as in GitHub
import Chat from './components/chat.jsx';
import Contacts from './components/contacts.jsx';
import Profile from './components/profile.jsx';
import Settings from "./settings.jsx";
import AuthCallback from './components/AuthCallback.jsx';

// ---------- Auth Gate ----------
function AuthGate({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null);

  console.log('AuthGate - ready:', ready, 'session:', session); // Added for debugging

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s ?? null);
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, []);

  if (!ready) return null; // simple splash; optional spinner

  // Pass the user to the children, if a session exists
  if (session) {
    return React.cloneElement(children, { user: session.user });
  }

  return <LoginScreen />;
}

// ---------- Login Screen (magic link) ----------
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);

  async function sendLink(e) {
    e.preventDefault();
    if (!email) return;
    setSending(true);

    try {
      const redirect = `${window.location.origin}/auth/callback`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirect }
      });
      if (error) {
        alert(`Error sending magic link: ${error.message}`);
      } else {
        alert('Check your email for a magic link ✉️');
      }
    } catch (err) {
      alert(`Error sending magic link: ${err.message || err}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <form
        onSubmit={sendLink}
        className="w-full max-w-md rounded-2xl bg-[#0f172a] p-8 text-center shadow-xl"
        style={{ border: '1px solid rgba(255,255,255,0.08)' }}
      >
        <div className="mx-auto mb-4 h-14 w-14 rounded-full bg-gray-700 flex items-center justify-center text-xl font-bold text-black">
          V
        </div>
        <h1 className="text-white text-xl font-semibold">Welcome to Vaulted</h1>
        <p className="text-gray-400 text-sm mt-1">Enter your email to get a magic link login.</p>

        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          required
          className="mt-5 w-full rounded-xl bg-[#111827] text-white px-4 py-3 outline-none"
        />

        <button
          type="submit"
          disabled={sending}
          className="mt-4 w-full rounded-xl bg-gray-400/20 text-white px-4 py-3 disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Send Magic Link'}
        </button>
      </form>
    </div>
  );
}

// ---------- Shell with routes ----------
function AppShell({ user }) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-black text-white">
      {/* You can put a global header here if you want */}
      <Routes>
        {/* Auth callback MUST be a top-level route */}
        <Route path="/auth/callback" element={<AuthCallback />} />

        {/* Protected area */}
        <Route
          path="/*"
          element={
            <AuthGate>
              <Routes>
                <Route path="/" element={<Contacts user={user} />} />
                <Route path="/chat/:chatId" element={<Chat user={user} />} />
                <Route path="/profile/:userId" element={<Profile user={user} />} />
                <Route path="/settings" element={<Settings user={user} />} />
                {/* fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </AuthGate>
          }
        />
      </Routes>
    </div>
  );
}

// ---------- Root (with BrowserRouter) ----------
export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
