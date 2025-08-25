import React, { useState, useEffect } from "react";
import { Plus, ArrowLeft, Send, User, Camera } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

// --- Supabase Setup ---
const supabase = createClient(
  "https://dipbxozosmqocghgclqm.supabase.co", // replace with your project URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcGJ4b3pvc21xb2NnaGdjbHFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMjUwODYsImV4cCI6MjA3MTcwMTA4Nn0.kJH6WtMK-EWuvoOAkVmMhgiYdTG7Ro7ghApMKWZgTLc" // replace with your anon key
);

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showOtherProfile, setShowOtherProfile] = useState(null);

  // --- Auth Session ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        setIsLoggedIn(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        setIsLoggedIn(true);
      } else {
        setUser(null);
        setIsLoggedIn(false);
        setProfile(null);
      }
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- Load Profile ---
  useEffect(() => {
    if (!user) return;
    async function fetchProfile() {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();
      if (data) {
        setProfile(data);
        loadChats();
      }
    }
    fetchProfile();
  }, [user]);

  // --- Load Chats ---
  async function loadChats() {
    if (!user) return;
    const { data } = await supabase
      .from("chats")
      .select("*")
      .contains("participants", [user.id]);
    if (data) setChats(data);
  }

  // --- Load Messages ---
  useEffect(() => {
    if (!activeChat) return;
    async function fetchMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", activeChat.id)
        .order("created_at", { ascending: true });
      if (data) setMessages(data);
    }
    fetchMessages();

    const channel = supabase
      .channel("room:" + activeChat.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${activeChat.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat]);

  // --- Send Message ---
  async function handleSendMessage(text) {
    if (!text.trim()) return;
    await supabase.from("messages").insert({
      chat_id: activeChat.id,
      sender_id: user.id,
      text,
      created_at: new Date().toISOString(),
    });
  }

  // --- Add Contact (send invite) ---
  async function handleAddContact(username) {
    const { data: contact } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (contact) {
      await supabase.from("chat_invites").insert({
        from_user: user.id,
        to_user: contact.id,
        status: "pending",
      });
      alert(`Invite sent to ${username}`);
    }
    setShowAddContact(false);
  }

  // --- Magic Link Login ---
  async function handleLogin(email) {
    if (!email) return alert("Please enter a valid email");

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: "https://vaulted-chat.vercel.app/auth/callback" }, // PRODUCTION redirect
    });

    if (error) {
      alert("Error: " + error.message);
    } else {
      alert("Check your email for a magic link ✉️");
    }
  }

  // --- Username Setup ---
  if (isLoggedIn && user && !profile) {
    return <UsernameSetup user={user} onComplete={(p) => setProfile(p)} />;
  }

  if (!isLoggedIn) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  // --- Main UI ---
  return (
    <div className="bg-black text-gray-400 min-h-screen flex items-center justify-center p-4 antialiased">
      <div className="w-full max-w-2xl mx-auto bg-gray-900 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-gray-600 h-[90vh] flex flex-col">
        {showProfile ? (
          <ProfileSettings profile={profile} onSave={(p) => { setProfile(p); setShowProfile(false); }} />
        ) : !activeChat ? (
          <div className="flex flex-col h-full">
            <ChatListHeader
              onAddContact={() => setShowAddContact(true)}
              onProfile={() => setShowProfile(true)}
            />
            <div className="p-4 space-y-2 flex-1 overflow-y-auto">
              {chats.length === 0 ? (
                <div className="text-center text-gray-500 mt-20">
                  No chats yet. Add a contact to start messaging.
                </div>
              ) : (
                chats.map((chat) => (
                  <ChatListItem
                    key={chat.id}
                    chat={chat}
                    userId={user.id}
                    onClick={() => setActiveChat(chat)}
                  />
                ))
              )}
            </div>
            {showAddContact && (
              <AddContactOverlay
                onAdd={handleAddContact}
                onClose={() => setShowAddContact(false)}
              />
            )}
          </div>
        ) : showOtherProfile ? (
          <UserProfile userId={showOtherProfile} onClose={() => setShowOtherProfile(null)} />
        ) : (
          <div className="flex flex-col h-full">
            <ChatViewHeader
              chat={activeChat}
              userId={user.id}
              onBack={() => setActiveChat(null)}
              onViewProfile={(uid) => setShowOtherProfile(uid)}
            />
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 mt-20">
                  No messages yet. Say hi 👋
                </div>
              ) : (
                messages.map((msg) => (
                  <Message key={msg.id} msg={msg} userId={user.id} />
                ))
              )}
            </div>
            <ChatInput onSend={handleSendMessage} />
          </div>
        )}
      </div>
    </div>
  );
}

// ✅ Username setup (same as before)
function UsernameSetup({ user, onComplete }) {
  const [username, setUsername] = useState("");
  async function saveUsername() {
    if (!username.trim()) return;
    const { data, error } = await supabase
      .from("profiles")
      .insert({ id: user.id, username })
      .select()
      .single();
    if (!error) onComplete(data);
  }
  return (
    <div className="bg-black min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 p-10 rounded-3xl w-full max-w-md text-center">
        <h2 className="text-xl font-bold mb-4">Choose a Username</h2>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="username" className="w-full p-3 bg-gray-800 rounded-xl text-sm text-gray-200 mb-4" />
        <button onClick={saveUsername} className="w-full p-3 bg-gray-600 text-black rounded-xl">Continue</button>
      </div>
    </div>
  );
}

// ✅ Profile Settings with photo upload
function ProfileSettings({ profile, onSave }) {
  const [username, setUsername] = useState(profile.username);
  const [status, setStatus] = useState(profile.status || "Online");
  const [avatar, setAvatar] = useState(profile.avatar_url || "");

  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;
    const { data, error } = await supabase.storage.from("avatars").upload(`${profile.id}/${file.name}`, file, { upsert: true });
    if (!error) {
      const url = supabase.storage.from("avatars").getPublicUrl(`${profile.id}/${file.name}`).data.publicUrl;
      setAvatar(url);
    }
  }

  async function save() {
    await supabase.from("profiles").update({ username, status, avatar_url: avatar }).eq("id", profile.id);
    onSave({ ...profile, username, status, avatar_url: avatar });
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">My Profile</h2>
      <div className="flex flex-col items-center space-y-2">
        <img src={avatar || "https://placehold.co/100x100"} alt="avatar" className="w-24 h-24 rounded-full object-cover" />
        <label className="cursor-pointer text-blue-400 flex items-center space-x-1">
          <Camera size={16} />
          <span>Change Photo</span>
          <input type="file" className="hidden" onChange={handleFileUpload} />
        </label>
      </div>
      <input value={username} onChange={(e) => setUsername(e.target.value)} className="p-2 rounded bg-gray-800 w-full"/>
      <input value={status} onChange={(e) => setStatus(e.target.value)} className="p-2 rounded bg-gray-800 w-full"/>
      <button onClick={save} className="p-3 bg-gray-600 text-black rounded-xl w-full">Save</button>
    </div>
  );
}

// ✅ Full-screen User Profile
function UserProfile({ userId, onClose }) {
  const [profile, setProfile] = useState(null);
  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", userId).single().then(({ data }) => setProfile(data));
  }, [userId]);

  if (!profile) return <p>Loading...</p>;

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex items-center p-4 border-b border-gray-700">
        <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onClose} />
        <h2 className="ml-4 text-lg font-bold">{profile.username}</h2>
      </div>
      <div className="flex flex-col items-center p-6 space-y-4">
        <img src={profile.avatar_url || "https://placehold.co/150"} alt="avatar" className="w-32 h-32 rounded-full object-cover" />
        <h3 className="text-xl">{profile.username}</h3>
        <p className="text-gray-400">{profile.status || "Hey there! I'm using Vaulted."}</p>
      </div>
    </div>
  );
}
