import React, { useEffect, useState } from "react";
import { ArrowLeft, User, Lock } from "lucide-react";
import supabase from "./supabaseClient";

export default function Profile({ chat, onBack }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    async function loadProfile() {
      // Get the other participant in the chat
      const otherId = chat.participants.find((id) => id !== chat.currentUserId);

      if (!otherId) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("id, username, avatar_url, bio, status")
        .eq("id", otherId)
        .single();

      if (!error) setProfile(data);
    }
    loadProfile();
  }, [chat]);

  if (!profile) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-gray-500">
        Loading profile...
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-black/80 p-4 flex items-center border-b border-gray-700">
        <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
        <h2 className="ml-4 text-md font-semibold">Contact Info</h2>
      </div>

      {/* Profile content */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center space-y-6">
        {/* Avatar */}
        <div className="w-24 h-24 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden">
          {profile.avatar_url ? (
            <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-12 h-12 text-black" />
          )}
        </div>

        {/* Username */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-200">{profile.username}</h1>
          <p className="text-sm text-gray-500">{profile.status || "Offline"}</p>
        </div>

        {/* Bio */}
        {profile.bio && (
          <div className="bg-gray-800/50 p-4 rounded-xl w-full">
            <h3 className="text-gray-400 text-sm font-semibold">About</h3>
            <p className="text-gray-200 text-sm mt-1">{profile.bio}</p>
          </div>
        )}

        {/* Actions */}
        <div className="w-full space-y-4">
          <div className="flex items-center space-x-4 p-4 rounded-xl bg-gray-800/50 cursor-pointer">
            <Lock className="w-5 h-5 text-gray-500" />
            <div>
              <p className="text-md text-gray-200">Block Contact</p>
              <p className="text-xs text-gray-500">Prevent messages and calls</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
