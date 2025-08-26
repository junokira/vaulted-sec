// src/App.jsx
import React, { useEffect, useState } from "react";
import { Plus, ArrowLeft, Send } from "lucide-react";
import supabase from "./supabaseClient";

// --- Main App ---
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [inviteCount, setInviteCount] = useState(0);

  // --- Supabase Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        setIsLoggedIn(true);
        loadChats();
        loadInviteCount();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setUser(session.user);
          setIsLoggedIn(true);
          loadChats();
          loadInviteCount();
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

  // --- Load Invite Count for badge ---
  async function loadInviteCount() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { count } = await supabase
      .from("invites")
      .select("*", { count: "exact", head: true })
      .eq("recipient_id", user.id)
      .eq("status", "pending");

    setInviteCount(count || 0);
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

  const renderContent = () => {
    if (!isLoggedIn) {
      return <AuthScreen />;
    }

    if (showAddContact) {
      return (
        <AddContactOverlay
          onClose={() => {
            setShowAddContact(false);
            loadInviteCount();
          }}
        />
      );
    }

    if (!activeChat) {
      return (
        <div>
          <ChatListHeader
            onAddContact={() => setShowAddContact(true)}
            inviteCount={inviteCount}
          />
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
    }

    return (
      <div className="flex flex-col h-full">
        <ChatViewHeader chat={activeChat} onBack={() => setActiveChat(null)} />
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

const ChatListHeader = ({ onAddContact, inviteCount }) => (
  <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
    <h1 className="text-xl font-bold">Vaulted</h1>
    <div
      className="relative cursor-pointer"
      onClick={onAddContact}
    >
      <Plus className="w-5 h-5" />
      {inviteCount > 0 && (
        <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
          {inviteCount}
        </span>
      )}
    </div>
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
    <div className="flex-1">
      <h2 className="text-gray-200 text-md font-semibold">{chat.name}</h2>
    </div>
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
        isMine ? "bg-blue-600 text-white self-end" : "bg-gray-700 text-gray-200 self-start"
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

// Auth Screen Placeholder
const AuthScreen = () => (
  <div className="p-6 text-center">
    <h2 className="text-lg">Please log in to continue</h2>
  </div>
);

// --- Overlay with Add + Invites ---
const AddContactOverlay = ({ onClose }) => {
  const [username, setUsername] = useState("");
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    async function fetchInvites() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("invites")
        .select(
          `
          id,
          sender_id,
          status,
          profiles!invites_sender_id_fkey (username)
        `
        )
        .eq("recipient_id", user.id)
        .eq("status", "pending");

      if (!error && data) setInvites(data);
    }
    fetchInvites();
  }, []);

  async function handleAddContact() {
    if (!username.trim()) return;

    const { data: userProfile, error } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (error || !userProfile) {
      alert("User not found.");
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const { error: insertError } = await supabase.from("invites").insert({
      sender_id: user.id,
      recipient_id: userProfile.id,
      status: "pending",
    });

    if (insertError) {
      console.error(insertError);
      alert("Error sending invite.");
    } else {
      alert(`Invite sent to ${userProfile.username}!`);
      setUsername("");
    }
  }

  async function handleAccept(invite) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    await supabase
      .from("chats")
      .insert({
        name: invite.profiles.username,
        participants: [user.id, invite.sender_id],
      })
      .select()
      .single();

    await supabase.from("invites").delete().eq("id", invite.id);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  async function handleDecline(invite) {
    await supabase.from("invites").delete().eq("id", invite.id);
    setInvites((prev) => prev.filter((i) => i.id !== invite.id));
  }

  return (
    <div className="p-6 flex flex-col space-y-4">
      <h2 className="text-md font-semibold">Add Contact</h2>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        placeholder="Enter username..."
      />
      <button
        onClick={handleAddContact}
        className="p-3 bg-blue-600 text-white rounded-xl hover:bg-blue-500"
      >
        Add
      </button>

      <h3 className="text-md font-semibold mt-6">Invites</h3>
      {invites.length === 0 ? (
        <p className="text-gray-400 text-sm">No invites</p>
      ) : (
        <div className="space-y-3">
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between bg-gray-800/50 p-3 rounded-xl"
            >
              <span className="text-gray-200 text-sm">
                {invite.profiles?.username || "Unknown"}
              </span>
              <div className="flex space-x-2">
                <button
                  onClick={() => handleAccept(invite)}
                  className="px-3 py-1 bg-green-600 text-white text-xs rounded-lg hover:bg-green-500"
                >
                  Accept
                </button>
                <button
                  onClick={() => handleDecline(invite)}
                  className="px-3 py-1 bg-red-600 text-white text-xs rounded-lg hover:bg-red-500"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={onClose} className="text-gray-400 mt-4">
        Close
      </button>
    </div>
  );
};
