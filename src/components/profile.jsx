// src/components/profile.jsx
import React, { useEffect, useState } from "react";
import supabase from "../supabaseClient";
import { useLocation } from "react-router-dom";

export default function Profile({ session }) {
  const [profile, setProfile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const location = useLocation();

  const userId = location.state?.userId ?? session?.user?.id;

  useEffect(() => {
    if (!userId) return;
    (async () => {
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single();
      if (error) {
        console.error("fetch profile", error);
        return;
      }
      setProfile(data);
    })();
  }, [userId]);

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${userId}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(fileName, file, {
        upsert: true
      });
      if (upErr) throw upErr;
      const { data } = supabase.storage.from("avatars").getPublicUrl(fileName);
      // store avatar url in profiles table
      const { error: updateErr } = await supabase.from("profiles").update({ avatar_url: data.publicUrl }).eq("id", userId);
      if (updateErr) throw updateErr;
      setProfile((p) => ({ ...p, avatar_url: data.publicUrl }));
    } catch (err) {
      console.error("upload avatar", err);
      alert("Upload failed: " + err.message);
    } finally {
      setUploading(false);
    }
  }

  if (!session && !userId) {
    return <div style={{ padding: 20 }}>Please sign in to view a profile.</div>;
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Profile</h2>
      {profile ? (
        <div>
          <img src={profile.avatar_url || ""} alt="avatar" style={{ width: 120, height: 120, borderRadius: 60, background: "#111" }} />
          <div style={{ marginTop: 12 }}>
            <input type="file" onChange={handleFile} disabled={uploading} />
          </div>
          <div style={{ marginTop: 12 }}>
            <strong>{profile.username || profile.full_name || profile.email || "Unnamed"}</strong>
          </div>
        </div>
      ) : (
        <div>Loading profile…</div>
      )}
    </div>
  );
}
