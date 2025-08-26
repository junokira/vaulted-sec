// src/App.jsx
import React, { useEffect, useState } from "react";
import {
  Plus,
  ArrowLeft,
  Send,
  MoreVertical,
} from "lucide-react";
import supabase from "./supabaseClient";
import "./index.css";

// --- Main App ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);

  // --- Auth + Session ---
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
    const { data, error } = await supabase
      .from("chats")
      .select("*, users!chats_participants_fkey(username)")
      .contains("participants", [user?.id]);

    if (!error) setChats(data || []);
  }

  // --- Load Messages ---
  useEffect(() => {
    if (!activeChat) return;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*, users!messages_sender_id_fkey(username)")
        .eq("chat_id", activeChat.id)
        .order("created_at", { ascending: true });
      if (!error) setMessages(data || []);
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
  async function deleteChat(chatId) {
    await supabase.from("chats").delete().eq("id", chatId);
    setChats((prev) => prev.filter((c) => c.id !== chatId));
    if (activeChat?.id === chatId) setActiveChat(null);
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

    if (!activeChat) {
      return (
        <div>
          <ChatListHeader onAddContact={() => setShowAddContact(true)} />

          {/* Invites */}
          <InviteList userId={user.id} />

          <div className="p-4 space-y-2">
            {chats.map((chat) => (
              <ChatListItem
                key={chat.id}
                chat={chat}
                onClick={() => setActiveChat(chat)}
                onDelete={() => deleteChat(chat.id)}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <ChatViewHeader chat={activeChat} onBack={() => setActiveChat(null)} />
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm flex flex-col">
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

const ChatListItem = ({ chat, onClick, onDelete }) => (
  <div
    onClick={onClick}
    className="flex items-center justify-between p-4 rounded-xl cursor-pointer hover:bg-gray-800"
  >
    <div className="flex items-center space-x-4">
      <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
        <span className="font-bold text-sm text-black">
          {chat.name?.[0] || "?"}
        </span>
      </div>
      <div>
        <h2 className="text-gray-200 text-md font-semibold">
          {chat.name || "Unknown"}
        </h2>
      </div>
    </div>
    <MoreVertical
      className="w-5 h-5 text-gray-400 hover:text-red-400"
      onClick={(e) => {
        e.stopPropagation();
        onDelete();
      }}
    />
  </div>
);

const ChatViewHeader = ({ chat, onBack }) => (
  <div className="bg-black/80 p-4 flex items-center border-b border-gray-600">
    <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
    <h2 className="ml-4 text-md font-semibold">{chat.name}</h2>
  </div>
);

const Message = ({ msg, userId }) => {
  const isMine = msg.sender_id === userId;
  return (
    <div
      className={`p-3 rounded-2xl max-w-[75%] ${
        isMine
          ? "bg-blue-600 text-white self-end"
          : "bg-gray-700 text-gray-200 self-start"
      }`}
    >
      <p className="text-xs font-semibold mb-1">
        {msg.users?.username || (isMine ? "You" : "Unknown")}
      </p>
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

const InviteList = ({ userId }) => {
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    async function loadInvites() {
      const { data } = await supabase
        .from("invites")
        .select("id, from_id, status, users!invites_from_id_fkey(username)")
        .eq("to_id", userId)
        .eq("status", "pending");

      setInvites(data || []);
    }
    loadInvites();
  }, [userId]);

  async function handleInvite(id, action) {
    await supabase.from("invites").update({ status: action }).eq("id", id);
    setInvites((prev) => prev.filter((i) => i.id !== id));
  }

  if (invites.length === 0) return null;

  return (
    <div className="p-4 border-b border-gray-600">
      <h2 className="text-gray-200 font-semibold mb-2">Invites</h2>
      {invites.map((invite) => (
        <div
          key={invite.id}
          className="flex justify-between items-center bg-gray-800 p-3 rounded-xl mb-2"
        >
          <span>{invite.users?.username || "Unknown User"}</span>
          <div className="space-x-2">
            <button
              onClick={() => handleInvite(invite.id, "accepted")}
              className="px-2 py-1 bg-green-600 text-white rounded"
            >
              Accept
            </button>
            <button
              onClick={() => handleInvite(invite.id, "denied")}
              className="px-2 py-1 bg-red-600 text-white rounded"
            >
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
