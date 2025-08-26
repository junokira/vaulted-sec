// src/App.jsx
import React, { useEffect, useState } from "react";
import { ArrowLeft, Plus, Send, Trash2 } from "lucide-react";
import supabase from "./supabaseClient";
import "./index.css";

// ============================
// App.jsx (main entry point)
// ============================
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfile, setShowProfile] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({}); // { chatId: count }

  // --- Supabase Auth ---
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

  // --- Load Chats ---
  async function loadChats() {
    const { data, error } = await supabase.from("chats").select("*");
    if (!error) setChats(data);
  }

  // --- Load Messages ---
  useEffect(() => {
    if (!activeChat) return;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", activeChat.id)
        .order("created_at", { ascending: true });
      if (!error) {
        setMessages(data);
        setUnreadCounts((prev) => ({ ...prev, [activeChat.id]: 0 })); // reset unread
      }
    }
    fetchMessages();

    // Realtime subscription
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
          if (payload.new.sender_id !== user.id) {
            setUnreadCounts((prev) => ({
              ...prev,
              [activeChat.id]: (prev[activeChat.id] || 0) + 1,
            }));
          }
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat, user]);

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
      .from("users")
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

  // --- Delete Chat ---
  async function handleDeleteChat(chatId) {
    await supabase.from("messages").delete().eq("chat_id", chatId);
    await supabase.from("chats").delete().eq("id", chatId);
    setChats(chats.filter((c) => c.id !== chatId));
    setActiveChat(null);
  }

  // --- Magic Link Login ---
  async function handleLogin(email) {
    if (!email) {
      alert("Please enter a valid email");
      return;
    }

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error(error);
      alert("Error sending magic link: " + error.message);
    } else {
      alert("Check your email for a magic link from Vaulted ✉️");
    }
  }

  // --- Auth Callback Handler ---
  useEffect(() => {
    const hash = window.location.hash;
    if (hash.includes("access_token")) {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          setUser(data.session.user);
          setIsLoggedIn(true);
          loadChats();
          window.history.replaceState({}, document.title, "/");
        }
      });
    }
  }, []);

  // --- Render Content ---
  const renderContent = () => {
    if (!isLoggedIn) {
      return <AuthScreen onLogin={handleLogin} />;
    }

    if (showAddContact) {
      return (
        <AddContactOverlay
          onAdd={handleAddContact}
          onClose={() => setShowAddContact(false)}
        />
      );
    }

    if (showProfile) {
      return (
        <ProfileOverlay userId={showProfile} onClose={() => setShowProfile(null)} />
      );
    }

    if (!activeChat) {
      return (
        <div>
          <ChatListHeader onAddContact={() => setShowAddContact(true)} />
          <div className="p-4 space-y-2">
            {chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                currentUser={user}
                unread={unreadCounts[chat.id]}
                onClick={() => setActiveChat(chat)}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <ChatViewHeader
          chat={activeChat}
          user={user}
          onBack={() => setActiveChat(null)}
          onDelete={handleDeleteChat}
          onProfile={setShowProfile}
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

// ============================
// Components
// ============================

const ChatListHeader = ({ onAddContact }) => (
  <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
    <h1 className="text-xl font-bold">Vaulted</h1>
    <Plus className="w-5 h-5 cursor-pointer" onClick={onAddContact} />
  </div>
);

// ✅ FIX: Show other participant username + unread badge
const ChatListItem = ({ chat, currentUser, unread, onClick }) => {
  const otherParticipant = chat.participants?.find((p) => p !== currentUser.id);
  const [otherUser, setOtherUser] = useState(null);

  useEffect(() => {
    if (otherParticipant) {
      supabase
        .from("users")
        .select("username")
        .eq("id", otherParticipant)
        .single()
        .then(({ data }) => {
          if (data) setOtherUser(data.username);
        });
    }
  }, [otherParticipant]);

  return (
    <div
      onClick={onClick}
      className="flex items-center space-x-4 p-4 rounded-xl cursor-pointer hover:bg-gray-800"
    >
      <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center relative">
        <span className="font-bold text-sm text-black">
          {otherUser ? otherUser[0] : "?"}
        </span>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {unread}
          </span>
        )}
      </div>
      <div className="flex-1">
        <h2 className="text-gray-200 text-md font-semibold">
          {otherUser || chat.name}
        </h2>
      </div>
    </div>
  );
};

const ChatViewHeader = ({ chat, user, onBack, onDelete, onProfile }) => {
  const otherParticipant = chat.participants?.find((p) => p !== user.id);
  const [otherUser, setOtherUser] = useState(null);

  useEffect(() => {
    if (otherParticipant) {
      supabase
        .from("users")
        .select("id, username, email")
        .eq("id", otherParticipant)
        .single()
        .then(({ data }) => {
          if (data) setOtherUser(data);
        });
    }
  }, [otherParticipant]);

  return (
    <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
      <div className="flex items-center space-x-3">
        <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
        <h2
          className="ml-2 text-md font-semibold cursor-pointer"
          onClick={() => onProfile(otherUser?.id)}
        >
          {otherUser?.username || chat.name}
        </h2>
      </div>
      <Trash2
        className="w-5 h-5 cursor-pointer text-red-400"
        onClick={() => onDelete(chat.id)}
      />
    </div>
  );
};

// ✅ Messages left/right
const Message = ({ msg, userId }) => {
  const isMine = msg.sender_id === userId;
  return (
    <div className={`flex ${isMine ? "justify-end" : "justify-start"}`}>
      <div
        className={`p-3 rounded-2xl max-w-[70%] ${
          isMine
            ? "bg-gray-700 text-white self-end"
            : "bg-gray-800 text-gray-200 self-start"
        }`}
      >
        <p>{msg.text}</p>
      </div>
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
        onKeyDown={(e) =>
          e.key === "Enter" && onSend(text) && setText("")
        }
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
      <p className="text-sm text-gray-500">
        Enter your email to get a magic link login.
      </p>
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

// ✅ Profile Overlay
const ProfileOverlay = ({ userId, onClose }) => {
  const [profile, setProfile] = useState(null);

  useEffect(() => {
    if (userId) {
      supabase
        .from("users")
        .select("username, email")
        .eq("id", userId)
        .single()
        .then(({ data }) => setProfile(data));
    }
  }, [userId]);

  if (!profile) return null;

  return (
    <div className="p-8 flex flex-col space-y-4">
      <h2 className="text-lg font-bold">Profile</h2>
      <p className="text-gray-300">Username: {profile.username}</p>
      <p className="text-gray-300">Email: {profile.email}</p>
      <button onClick={onClose} className="text-gray-400 mt-4">
        Close
      </button>
    </div>
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
