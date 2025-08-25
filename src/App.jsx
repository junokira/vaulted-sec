import React, { useEffect, useState } from "react";
import supabase from "./supabaseClient";
import AuthCallback from "./AuthCallback";
import Chat from "./Chat";
import Profile from "./Profile";
import Contacts from "./Contacts";

export default function App() {
  const [session, setSession] = useState(null);
  const [view, setView] = useState("contacts"); // "contacts", "chat", "profile", "settings"
  const [selectedChat, setSelectedChat] = useState(null);
  const [profileUser, setProfileUser] = useState(null);
  const [theme, setTheme] = useState("blue"); // blue | green

  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setSession(session);
    };
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (!session) {
    return <AuthCallback />;
  }

  const handleOpenChat = (chat) => {
    setSelectedChat(chat);
    setView("chat");
  };

  const handleOpenProfile = (user) => {
    setProfileUser(user);
    setView("profile");
  };

  const handleDeleteChat = async (chatId) => {
    await supabase.from("chats").delete().eq("id", chatId);
    setView("contacts");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSession(null);
    setView("contacts");
  };

  return (
    <div
      className={`h-screen w-screen flex flex-col ${
        theme === "blue" ? "bg-black text-white" : "bg-gray-900 text-white"
      }`}
    >
      <header className="flex items-center justify-between p-4 border-b border-gray-700">
        <h1 className="text-xl font-bold">Vaulted</h1>
        <div className="flex gap-4">
          <button
            onClick={() => setTheme(theme === "blue" ? "green" : "blue")}
            className="text-sm px-3 py-1 rounded bg-gray-800 hover:bg-gray-700"
          >
            Theme
          </button>
          <button
            onClick={() => setView("settings")}
            className="text-sm px-3 py-1 rounded bg-gray-800 hover:bg-gray-700"
          >
            Settings
          </button>
          <button
            onClick={handleLogout}
            className="text-sm px-3 py-1 rounded bg-red-600 hover:bg-red-500"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="flex-1 overflow-hidden">
        {view === "contacts" && (
          <Contacts
            onOpenChat={handleOpenChat}
            onOpenProfile={handleOpenProfile}
            session={session}
          />
        )}

        {view === "chat" && (
          <Chat
            chat={selectedChat}
            session={session}
            theme={theme}
            onBack={() => setView("contacts")}
            onOpenProfile={handleOpenProfile}
          />
        )}

        {view === "profile" && (
          <Profile
            user={profileUser}
            onDeleteChat={handleDeleteChat}
            onBack={() => setView("contacts")}
          />
        )}

        {view === "settings" && (
          <div className="p-4">
            <h2 className="text-lg font-bold mb-4">Settings</h2>
            <Settings session={session} />
            <button
              onClick={() => setView("contacts")}
              className="mt-6 px-4 py-2 rounded bg-gray-700 hover:bg-gray-600"
            >
              Back
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

function Settings({ session }) {
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [avatar, setAvatar] = useState(null);

  useEffect(() => {
    const fetchProfile = async () => {
      const { data } = await supabase
        .from("profiles")
        .select("username, bio, avatar_url")
        .eq("id", session.user.id)
        .single();
      if (data) {
        setUsername(data.username || "");
        setBio(data.bio || "");
        setAvatar(data.avatar_url || null);
      }
    };
    fetchProfile();
  }, [session]);

  const handleSave = async () => {
    let avatarUrl = avatar;

    // handle file upload
    if (avatar instanceof File) {
      const fileName = `${session.user.id}-${Date.now()}`;
      const { data, error } = await supabase.storage
        .from("avatars")
        .upload(fileName, avatar);

      if (!error) {
        const { data: publicUrl } = supabase.storage
          .from("avatars")
          .getPublicUrl(fileName);
        avatarUrl = publicUrl.publicUrl;
      }
    }

    await supabase
      .from("profiles")
      .upsert({
        id: session.user.id,
        username,
        bio,
        avatar_url: avatarUrl,
      })
      .eq("id", session.user.id);

    alert("Profile updated!");
  };

  return (
    <div className="flex flex-col gap-4">
      <label>
        Username
        <input
          type="text"
          className="w-full p-2 bg-gray-800 rounded"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
      </label>

      <label>
        Bio
        <textarea
          className="w-full p-2 bg-gray-800 rounded"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
        />
      </label>

      <label>
        Avatar
        <input
          type="file"
          className="w-full p-2 bg-gray-800 rounded"
          onChange={(e) => setAvatar(e.target.files[0])}
        />
      </label>

      <button
        onClick={handleSave}
        className="px-4 py-2 bg-green-600 rounded hover:bg-green-500"
      >
        Save
      </button>
    </div>
  );
}
