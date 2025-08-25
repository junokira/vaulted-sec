import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "./supabaseClient";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    async function handleAuth() {
      try {
        // Let Supabase handle the URL callback (magic link)
        const { data, error } = await supabase.auth.getSession();

        if (error) {
          console.error("Auth error:", error);
          navigate("/"); // fallback to login
          return;
        }

        if (!data?.session) {
          console.warn("No session found after callback");
          navigate("/"); // back to login
          return;
        }

        const user = data.session.user;

        // Check if user has a username in DB
        const { data: profile, error: profileError } = await supabase
          .from("users")
          .select("username")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error("Profile fetch error:", profileError.message);
        }

        if (!profile || !profile.username) {
          // No username yet → send to profile setup
          navigate("/profile-setup");
        } else {
          // Already has username → go to chats
          navigate("/");
        }
      } catch (err) {
        console.error("Unexpected error:", err);
        navigate("/");
      }
    }

    handleAuth();
  }, [navigate]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-black text-white">
      <p>Completing sign-in, please wait...</p>
    </div>
  );
}
