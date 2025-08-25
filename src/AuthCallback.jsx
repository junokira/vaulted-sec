import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        navigate("/");
      }
    });
  }, [navigate]);

  async function handleLogin(e) {
    e.preventDefault();
    const email = e.target.email.value;
    await supabase.auth.signInWithOtp({ email });
    alert("Magic link sent!");
  }

  return (
    <form onSubmit={handleLogin} className="p-6 bg-black text-white">
      <h2 className="text-xl font-bold mb-4">Login with Magic Link</h2>
      <input
        type="email"
        name="email"
        placeholder="Enter email"
        className="p-2 bg-gray-800 rounded w-full mb-3"
      />
      <button type="submit" className="bg-blue-600 px-4 py-2 rounded w-full">
        Send Magic Link
      </button>
    </form>
  );
};

export default AuthCallback;
