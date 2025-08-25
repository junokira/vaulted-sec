import React, { useState, useEffect } from "react";
import { Plus, ArrowLeft, Send, User, MoreHorizontal } from "lucide-react";
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

  // --- Auth Session Listener ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        setIsLoggedIn(true);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setUser(session.user);
          setIsLoggedIn(true);
        } else {
          setUser(null);
          setIsLoggedIn(false);
          setProfile(null);
        }
      }
    );

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

  // --- Add Contact (creates invite) ---
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
      options: { emailRedirectTo: window.location.origin + "/auth/callback" },
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

  // --- Not logged in ---
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
            {showOtherProfile && (
              <UserProfile userId={showOtherProfile} onClose={() => setShowOtherProfile(null)} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Username Setup ---
function UsernameSetup({ user, onComplete }) {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);

  async function saveUsername() {
    if (!username.trim()) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .insert({ id: user.id, username })
      .select()
      .single();
    setLoading(false);
    if (error) {
      alert("Error: " + error.message);
    } else {
      onComplete(data);
    }
  }

  return (
    <div className="bg-black min-h-screen flex items-center justify-center">
      <div className="bg-gray-900 p-10 rounded-3xl shadow-2xl w-full max-w-md text-center">
        <h2 className="text-xl font-bold mb-4">Choose a Username</h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="username"
          className="w-full p-3 bg-gray-800 rounded-xl text-sm text-gray-200 mb-4"
        />
        <button
          onClick={saveUsername}
          disabled={loading}
          className="w-full p-3 bg-gray-600 text-black rounded-xl hover:bg-gray-500 transition disabled:opacity-50"
        >
          {loading ? "Saving..." : "Continue"}
        </button>
      </div>
    </div>
  );
}

// --- Profile Settings ---
function ProfileSettings({ profile, onSave }) {
  const [username, setUsername] = useState(profile.username);
  const [status, setStatus] = useState(profile.status || "Online");

  async function save() {
    await supabase
      .from("profiles")
      .update({ username, status })
      .eq("id", profile.id);
    onSave({ ...profile, username, status });
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-xl font-bold">My Profile</h2>
      <input value={username} onChange={(e) => setUsername(e.target.value)} className="p-2 rounded bg-gray-800 w-full"/>
      <input value={status} onChange={(e) => setStatus(e.target.value)} className="p-2 rounded bg-gray-800 w-full"/>
      <button onClick={save} className="p-3 bg-gray-600 text-black rounded-xl">Save</button>
    </div>
  );
}

// --- Auth Screen ---
const AuthScreen = ({ onLogin }) => {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    await onLogin(email);
    setLoading(false);
  }

  return (
    <div className="bg-black min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="bg-gray-900 p-10 rounded-3xl shadow-2xl w-full max-w-md text-center">
        <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center mx-auto mb-6">
          <span className="font-bold text-lg text-black">V</span>
        </div>
        <h2 className="text-2xl font-bold mb-2">Welcome to Vaulted</h2>
        <p className="text-sm text-gray-400 mb-6">Enter your email to get a magic link login.</p>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-3 bg-gray-800 rounded-xl text-sm text-gray-200 mb-4" placeholder="you@email.com" required />
        <button type="submit" disabled={loading} className="w-full p-3 bg-gray-600 text-black font-semibold rounded-xl hover:bg-gray-500 transition disabled:opacity-50">
          {loading ? "Sending..." : "Send Magic Link"}
        </button>
      </form>
    </div>
  );
};

// --- Chat UI Components ---
const ChatListHeader = ({ onAddContact, onProfile }) => (
  <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
    <h1 className="text-xl font-bold">Vaulted</h1>
    <div className="flex items-center space-x-4">
      <User className="w-5 h-5 cursor-pointer" onClick={onProfile} />
      <Plus className="w-5 h-5 cursor-pointer" onClick={onAddContact} />
    </div>
  </div>
);

function ChatListItem({ chat, userId, onClick }) {
  const otherUserId = chat.participants.find((id) => id !== userId);
  const [otherProfile, setOtherProfile] = useState(null);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", otherUserId).single()
      .then(({ data }) => setOtherProfile(data));
  }, [otherUserId]);

  return (
    <div onClick={onClick} className="flex items-center space-x-4 p-4 rounded-xl cursor-pointer hover:bg-gray-800">
      <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
        <span className="font-bold text-sm text-black">{otherProfile?.username?.[0]}</span>
      </div>
      <h2 className="text-gray-200 text-md font-semibold">{otherProfile?.username || "..."}</h2>
    </div>
  );
}

const ChatViewHeader = ({ chat, userId, onBack, onViewProfile }) => {
  const otherUserId = chat.participants.find((id) => id !== userId);
  const [otherProfile, setOtherProfile] = useState(null);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", otherUserId).single()
      .then(({ data }) => setOtherProfile(data));
  }, [otherUserId]);

  return (
    <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
      <div className="flex items-center">
        <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
        <h2 className="ml-4 text-md font-semibold">{otherProfile?.username || "Chat"}</h2>
      </div>
      <MoreHorizontal className="w-5 h-5 cursor-pointer" onClick={() => onViewProfile(otherUserId)} />
    </div>
  );
};

const Message = ({ msg, userId }) => {
  const isMine = msg.sender_id === userId;
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div className={`p-3 rounded-2xl max-w-[75%] ${isMine ? "bg-gray-700" : "bg-gray-800"}`}>
        <p>{msg.text}</p>
      </div>
    </div>
  );
};

const ChatInput = ({ onSend }) => {
  const [text, setText] = useState("");
  return (
    <div className="bg-black/80 p-4 flex items-center space-x-3 border-t border-gray-600">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && onSend(text) && setText("")} className="flex-1 p-2 bg-gray-800/50 rounded-xl text-sm text-gray-200" placeholder="Message..." />
      <Send className="w-5 h-5 cursor-pointer" onClick={() => { onSend(text); setText(""); }} />
    </div>
  );
};

const AddContactOverlay = ({ onAdd, onClose }) => {
  const [username, setUsername] = useState("");
  return (
    <div className="p-8 flex flex-col space-y-4">
      <h2 className="text-md font-semibold">Add Contact</h2>
      <input value={username} onChange={(e) => setUsername(e.target.value)} className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200" placeholder="username" />
      <button onClick={() => onAdd(username)} className="p-3 bg-gray-600 text-black rounded-xl">Send Invite</button>
      <button onClick={onClose} className="text-gray-400">Cancel</button>
    </div>
  );
};

// --- User Profile Viewer ---
function UserProfile({ userId, onClose }) {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    supabase.from("profiles").select("*").eq("id", userId).single()
      .then(({ data }) => setProfile(data));
  }, [userId]);

  return (
    <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
      <div className="bg-gray-900 p-6 rounded-xl w-80 text-center space-y-3">
        {profile ? (
          <>
            <h2 className="text-xl font-bold">{profile.username}</h2>
            <p className="text-gray-400">{profile.status}</p>
          </>
        ) : (
          <p>Loading...</p>
        )}
        <button onClick={onClose} className="p-2 bg-gray-600 text-black rounded-xl w-full">Close</button>
      </div>
    </div>
  );
}
