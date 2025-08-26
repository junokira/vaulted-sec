// src/AuthCallback.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "./supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function handle() {
      try {
        // Supabase v2 helper to parse url and store session
        const { data, error } = await supabase.auth.getSessionFromUrl({
          storeSession: true
        });
        if (error) {
          console.error("auth callback error", error);
          // redirect to home showing an error
          navigate("/?authError=" + encodeURIComponent(error.message));
          return;
        }
        // success: stored; redirect to app root
        navigate("/");
      } catch (err) {
        console.error("AuthCallback exception", err);
        navigate("/");
      }
    }
    handle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div style={{ padding: 40 }}>Signing you in…</div>;
}
