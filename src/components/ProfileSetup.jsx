// src/components/ProfileSetup.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

export default function ProfileSetup() {
  const [name, setName] = useState("");
  const navigate = useNavigate();

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("profiles").upsert({
      id: user.id,
      name,
    });

    navigate("/");
  };

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-black text-white">
      <h1 className="text-2xl mb-4">Set up your profile</h1>
      <input
        type="text"
        placeholder="Enter your name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="p-2 rounded text-black"
      />
      <button
        onClick={handleSave}
        className="mt-4 bg-blue-600 px-4 py-2 rounded"
      >
        Save
      </button>
    </div>
  );
}
