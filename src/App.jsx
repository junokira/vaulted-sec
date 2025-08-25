import React, { useState, useEffect } from "react";
import { Search, Plus, ArrowLeft, Send, Phone, Video } from "lucide-react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  "https://YOUR_PROJECT.supabase.co", // your Supabase URL
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRpcGJ4b3pvc21xb2NnaGdjbHFtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTYxMjUwODYsImV4cCI6MjA3MTcwMTA4Nn0.kJH6WtMK-EWuvoOAkVmMhgiYdTG7Ro7ghApMKWZgTLc" // your Supabase anon key
);

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(null);

  // --- Auth setup ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        setIsLoggedIn(true);
        loadChats();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setUser(session.user);
          setIsLoggedIn(true);
          loadChats();
        } else {
          setUser(null);
          setIsLoggedIn(false);
        }
      }
    );

    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- Handle redirect from magic link ---
  useEffect(() => {
    async function handleRedirect() {
      if (window.location.hash.includes("access_token")) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setUser(data.session.user);
          setIsLoggedIn(true);
          window.history.replaceState({}, document.title, "/");
        }
      }
    }
    handleRedirect();
  }, []);

  // --- Load Chats ---
  async function loadChats() {
    const { data, error } = await supabase.from("chats").select("*");
    if (!error) setChats(data);
  }

  // --- Load Messages ---
  useEffect(() => {
    if (!activeChat) return;

    async function fetchMessages() {
      const { data } = await supabase
        .from("messages")
        .select("*, profiles(username, avatar_url)")
        .eq("chat_id", activeChat.id)
        .order("created_at", { ascending: true });
      setMessages(data || []);
    }
    fetchMessages();

    const channel = supabase
      .channel("room:" + activeChat.id)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${activeChat.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
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
    });
  }

  // --- Add Contact ---
  async function handleAddContact(username) {
    const { data: contact } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (contact) {
      const { data } = await supabase
        .from("chats")
        .insert({
          name: username,
          participants: [user.id, contact.id],
        })
        .select()
        .single();
      setChats([data, ...chats]);
    }
    setShowAddContact(false);
  }

  // --- Magic Link Login ---
  async function handleLogin(email) {
    if (!email) {
      alert("Please enter a valid email");
      return;
    }

    const redirectTo =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000/auth/callback"
        : "https://vaulted-chat.vercel.app/auth/callback";

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo },
    });

    if (error) {
      console.error(error);
      alert("Error sending magic link: " + error.message);
    } else {
      alert("Check your email for a magic link ✉️");
    }
  }

  // --- UI Render ---
  const renderContent = () => {
    if (!isLoggedIn) return <AuthScreen onLogin={handleLogin} />;

    if (showAddContact)
      return (
        <AddContactOverlay
          onAdd={handleAddContact}
          onClose={() => setShowAddContact(false)}
        />
      );

    if (showProfile)
      return (
        <ProfileScreen
          profile={showProfile}
          onClose={() => setShowProfile(null)}
          isMe={showProfile.id === user.id}
        />
      );

    if (!activeChat)
      return (
        <div>
          <ChatListHeader onAddContact={() => setShowAddContact(true)} />
          <div className="p-4 space-y-2">
            {chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                onClick={() => setActiveChat(chat)}
              />
            ))}
          </div>
        </div>
      );

    return (
      <div className="flex flex-col h-full">
        <ChatViewHeader
          chat={activeChat}
          onBack={() => setActiveChat(null)}
          onProfile={() => setShowProfile(activeChat)}
        />
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {messages.map((msg) => (
            <Message key={msg.id} msg={msg} userId={user.id} />
          ))}
        </div>
        <ChatInput onSend={handleSendMessage} />
      </div>
    );
  };

  return (
    <div className="bg-black text-gray-400 min-h-screen flex items-center justify-center font-sans p-4 antialiased">
      <div className="w-full max-w-lg mx-auto bg-gray-900 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-gray-600">
        {renderContent()}
      </div>
    </div>
  );
}

// --- Components ---

const ChatListHeader = ({ onAddContact }) => (
  <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
    <h1 className="text-xl font-bold">Vaulted</h1>
    <Plus className="w-5 h-5 cursor-pointer" onClick={onAddContact} />
  </div>
);

const ChatListItem = ({ chat, onClick }) => (
  <div
    onClick={onClick}
    className="flex items-center space-x-4 p-4 rounded-xl cursor-pointer hover:bg-gray-800"
  >
    <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
      <span className="font-bold text-sm text-black">{chat.name[0]}</span>
    </div>
    <h2 className="text-gray-200 text-md font-semibold">{chat.name}</h2>
  </div>
);

const ChatViewHeader = ({ chat, onBack, onProfile }) => (
  <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
    <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
    <h2
      className="ml-4 text-md font-semibold cursor-pointer"
      onClick={onProfile}
    >
      {chat.name}
    </h2>
    <div className="flex items-center space-x-3">
      <Phone className="w-5 h-5" />
      <Video className="w-5 h-5" />
    </div>
  </div>
);

const Message = ({ msg, userId }) => {
  const isMine = msg.sender_id === userId;
  return (
    <div
      className={`p-3 rounded-2xl max-w-[75%] ${
        isMine ? "bg-gray-700 self-end" : "bg-gray-800 self-start"
      }`}
    >
      <p>{msg.text}</p>
    </div>
  );
};

const ChatInput = ({ onSend }) => {
  const [text, setText] = useState("");
  return (
    <div className="bg-black/80 p-4 flex items-center space-x-3 border-t border-gray-600">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && onSend(text) && setText("")}
        className="flex-1 p-2 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        placeholder="Message..."
      />
      <Send
        className="w-5 h-5 cursor-pointer"
        onClick={() => {
          onSend(text);
          setText("");
        }}
      />
    </div>
  );
};

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
    <form
      onSubmit={handleSubmit}
      className="p-8 flex flex-col space-y-4 text-center"
    >
      <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center mx-auto">
        <span className="font-bold text-lg text-black">V</span>
      </div>
      <h2 className="text-xl font-bold">Welcome to Vaulted</h2>
      <p className="text-sm text-gray-500">Enter your email to get a magic link login.</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        placeholder="you@email.com"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="p-3 bg-gray-600 text-black rounded-xl disabled:opacity-50"
      >
        {loading ? "Sending..." : "Send Magic Link"}
      </button>
    </form>
  );
};

const AddContactOverlay = ({ onAdd, onClose }) => {
  const [username, setUsername] = useState("");
  return (
    <div className="p-8 flex flex-col space-y-4">
      <h2 className="text-md font-semibold">Add Contact</h2>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        placeholder="username"
      />
      <button
        onClick={() => onAdd(username)}
        className="p-3 bg-gray-600 text-black rounded-xl"
      >
        Add
      </button>
      <button onClick={onClose} className="text-gray-400">
        Cancel
      </button>
    </div>
  );
};

// --- Profile screen (like WhatsApp full view) ---
const ProfileScreen = ({ profile, onClose, isMe }) => {
  const [username, setUsername] = useState(profile.username || "");
  const [avatarUrl, setAvatarUrl] = useState(profile.avatar_url || "");

  async function handleSave() {
    const { error } = await supabase
      .from("profiles")
      .update({ username, avatar_url: avatarUrl })
      .eq("id", profile.id);
    if (error) console.error(error);
    onClose();
  }

  return (
    <div className="p-8 flex flex-col space-y-6 items-center">
      <div className="w-24 h-24 rounded-full bg-gray-700 flex items-center justify-center">
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt="avatar"
            className="w-24 h-24 rounded-full object-cover"
          />
        ) : (
          <span className="font-bold text-2xl text-black">
            {username?.[0] || "?"}
          </span>
        )}
      </div>
      {isMe && (
        <>
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200 w-full"
            placeholder="Set username"
          />
          <input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200 w-full"
            placeholder="Paste avatar image URL"
          />
          <button
            onClick={handleSave}
            className="p-3 bg-gray-600 text-black rounded-xl"
          >
            Save
          </button>
        </>
      )}
      {!isMe && (
        <>
          <h2 className="text-lg font-semibold">{username}</h2>
          <p className="text-gray-500">Contact profile</p>
        </>
      )}
      <button onClick={onClose} className="text-gray-400">
        Back
      </button>
    </div>
  );
};
