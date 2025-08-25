import React, { useState, useEffect } from "react";
import { ArrowLeft, User, Upload } from "lucide-react";
import supabase from "./supabaseClient";

export default function Settings({ session, onBack }) {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [status, setStatus] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");

  useEffect(() => {
    async function loadProfile() {
      if (!session?.user) return;

      const { data, error } = await supabase
        .from("profiles")
        .select("username, bio, status, avatar_url")
        .eq("id", session.user.id)
        .single();

      if (!error && data) {
        setUsername(data.username || "");
        setBio(data.bio || "");
        setStatus(data.status || "");
        setAvatarUrl(data.avatar_url || "");
      }
    }
    loadProfile();
  }, [session]);

  async function handleSave() {
    if (!session?.user) return;

    const { error } = await supabase.from("profiles").upsert({
      id: session.user.id,
      username,
      bio,
      status,
      avatar_url: avatarUrl,
    });

    if (error) {
      alert("Error saving profile: " + error.message);
    } else {
      alert("Profile updated ✅");
      onBack();
    }
  }

  async function handleAvatarUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const fileExt = file.name.split(".").pop();
    const fileName = `${session.user.id}.${fileExt}`;
    const filePath = `avatars/${fileName}`;

    let { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(filePath, file, { upsert: true });

    if (uploadError) {
      alert("Error uploading avatar: " + uploadError.message);
      return;
    }

    const { data: publicUrlData } = supabase.storage
      .from("avatars")
      .getPublicUrl(filePath);

    setAvatarUrl(publicUrlData.publicUrl);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-black/80 p-4 flex items-center border-b border-gray-700">
        <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
        <h2 className="ml-4 text-md font-semibold">Settings</h2>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center space-y-6">
        {/* Avatar Upload */}
        <div className="w-24 h-24 rounded-full bg-gray-600 flex items-center justify-center overflow-hidden relative">
          {avatarUrl ? (
            <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
          ) : (
            <User className="w-12 h-12 text-black" />
          )}
          <label className="absolute bottom-0 right-0 bg-gray-700 p-2 rounded-full cursor-pointer">
            <Upload className="w-4 h-4 text-white" />
            <input
              type="file"
              accept="image/*"
              onChange={handleAvatarUpload}
              className="hidden"
            />
          </label>
        </div>

        {/* Username */}
        <div className="w-full">
          <label className="block text-sm text-gray-400 mb-1">Username</label>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
            placeholder="Enter username"
          />
        </div>

        {/* Bio */}
        <div className="w-full">
          <label className="block text-sm text-gray-400 mb-1">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
            placeholder="Tell people about yourself..."
          />
        </div>

        {/* Status */}
        <div className="w-full">
          <label className="block text-sm text-gray-400 mb-1">Status</label>
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
            placeholder="Online / Busy / Away"
          />
        </div>

        {/* Save Button */}
        <button
          onClick={handleSave}
          className="w-full p-3 rounded-xl bg-gray-600 text-black font-semibold hover:bg-gray-700"
        >
          Save
        </button>
      </div>
    </div>
  );
}
