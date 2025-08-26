// src/App.jsx
import React, { useEffect, useState } from "react";
import { Plus, ArrowLeft, Send, Trash2 } from "lucide-react";
import supabase from "./supabaseClient";

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);

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
    if (!user) return;

    const { data: chatsData, error } = await supabase
      .from("chats")
      .select("*")
      .contains("participants", [user.id]);

    if (error) {
      console.error("Error loading chats:", error);
      return;
    }

    // Resolve usernames
    const enrichedChats = await Promise.all(
      chatsData.map(async (chat) => {
        const otherId = chat.participants.find((id) => id !== user.id);

        if (!otherId) return { ...chat, displayName: "Unknown" };

        const { data: otherUser } = await supabase
          .from("users")
          .select("username")
          .eq("id", otherId)
          .single();

        return {
          ...chat,
          displayName: otherUser?.username || "Unknown",
        };
      })
    );

    setChats(enrichedChats);
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

      if (!error) setMessages(data);
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
    if (!user) return;

    const { data: contact, error } = await supabase
      .from("users")
      .select("id, username")
      .eq("username", username)
      .single();

    if (error || !contact) {
      alert("User not found.");
      return;
    }

    const { data: existingChats } = await supabase
      .from("chats")
      .select("*")
      .contains("participants", [user.id])
      .contains("participants", [contact.id]);

    if (existingChats?.length > 0) {
      alert("Chat already exists.");
      return;
    }

    const { data: newChat, error: chatErr } = await supabase
      .from("chats")
      .insert({
        participants: [user.id, contact.id],
      })
      .select()
      .single();

    if (chatErr) {
      console.error(chatErr);
      alert("Error creating chat.");
      return;
    }

    setChats([newChat, ...chats]);
    setShowAddContact(false);
  }

  // --- Delete Chat ---
  async function deleteChat(chatId) {
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) {
      console.error("Error deleting chat:", error);
    } else {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
      setActiveChat(null);
    }
  }

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
        <ChatViewHeader
          chat={activeChat}
          onBack={() => setActiveChat(null)}
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

const ChatListItem = ({ chat, onClick, onDelete }) => (
  <div
    className="flex items-center space-x-4 p-4 rounded-xl cursor-pointer hover:bg-gray-800"
  >
    <div
      className="flex-1 flex items-center space-x-4"
      onClick={onClick}
    >
      <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
        <span className="font-bold text-sm text-black">
          {chat.displayName ? chat.displayName[0] : "?"}
        </span>
      </div>
      <div className="flex-1">
        <h2 className="text-gray-200 text-md font-semibold">
          {chat.displayName || "Unknown"}
        </h2>
      </div>
    </div>
    <Trash2
      className="w-5 h-5 text-red-500 cursor-pointer"
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
    <h2 className="ml-4 text-md font-semibold cursor-pointer">
      {chat.displayName}
    </h2>
  </div>
);

const Message = ({ msg, userId }) => {
  const isMine = msg.sender_id === userId;
  return (
    <div
      className={`flex ${
        isMine ? "justify-end" : "justify-start"
      }`}
    >
      <div
        className={`p-3 rounded-2xl max-w-[75%] ${
          isMine ? "bg-blue-600 text-white" : "bg-gray-700 text-white"
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
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSend(text);
            setText("");
          }
        }}
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
