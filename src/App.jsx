// src/App.jsx
import React, { useEffect, useState } from "react";
import { Plus, ArrowLeft, Send } from "lucide-react";
import supabase from "./supabaseClient";

// Components (inline for now)
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
      <span className="font-bold text-sm text-black">{chat.name?.[0]}</span>
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
        isMine
          ? "bg-blue-600 text-white self-end ml-auto"
          : "bg-gray-700 text-gray-100 self-start mr-auto"
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

// Overlay for contacts + invites
const AddContactOverlay = ({ onAdd, onClose, invites, onAccept, onDecline }) => {
  const [username, setUsername] = useState("");

  return (
    <div className="p-6 space-y-6">
      {/* Add contact */}
      <div>
        <h2 className="text-md font-semibold mb-2">Add Contact</h2>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
          placeholder="username"
        />
        <button
          onClick={() => onAdd(username)}
          className="mt-2 p-3 bg-gray-600 text-black rounded-xl w-full"
        >
          Add
        </button>
      </div>

      {/* Invites */}
      <div>
        <h2 className="text-md font-semibold mb-2">Invites</h2>
        {invites.length === 0 ? (
          <p className="text-gray-400 text-sm">No pending invites</p>
        ) : (
          <div className="space-y-2">
            {invites.map((invite) => (
              <div
                key={invite.id}
                className="flex items-center justify-between bg-gray-800/50 p-3 rounded-xl"
              >
                <span className="text-gray-200">{invite.from_username}</span>
                <div className="space-x-2">
                  <button
                    onClick={() => onAccept(invite.id)}
                    className="px-3 py-1 bg-green-600 text-sm text-white rounded-lg"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onDecline(invite.id)}
                    className="px-3 py-1 bg-red-600 text-sm text-white rounded-lg"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <button onClick={onClose} className="text-gray-400 text-sm">
        Close
      </button>
    </div>
  );
};

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showOverlay, setShowOverlay] = useState(false);
  const [invites, setInvites] = useState([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        setIsLoggedIn(true);
        loadChats();
        loadInvites();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (session) {
          setUser(session.user);
          setIsLoggedIn(true);
          loadChats();
          loadInvites();
        } else {
          setUser(null);
          setIsLoggedIn(false);
        }
      }
    );

    return () => listener?.subscription.unsubscribe();
  }, []);

  async function loadChats() {
    const { data, error } = await supabase.from("chats").select("*");
    if (!error) setChats(data);
  }

  async function loadInvites() {
    if (!user) return;
    const { data, error } = await supabase
      .from("invites")
      .select("id, from_username")
      .eq("to_id", user.id)
      .eq("status", "pending");

    if (!error) setInvites(data);
  }

  async function handleSendMessage(text) {
    if (!text.trim()) return;
    await supabase.from("messages").insert({
      chat_id: activeChat.id,
      sender_id: user.id,
      text,
    });
  }

  async function handleAddContact(username) {
    const { data: contact } = await supabase
      .from("users")
      .select("id, username")
      .eq("username", username)
      .single();

    if (contact) {
      await supabase.from("invites").insert({
        from_id: user.id,
        from_username: user.email,
        to_id: contact.id,
        status: "pending",
      });
      alert("Invite sent!");
    }
    setShowOverlay(false);
  }

  async function handleAcceptInvite(inviteId) {
    await supabase
      .from("invites")
      .update({ status: "accepted" })
      .eq("id", inviteId);
    loadInvites();
    loadChats();
  }

  async function handleDeclineInvite(inviteId) {
    await supabase.from("invites").update({ status: "declined" }).eq("id", inviteId);
    loadInvites();
  }

  const renderContent = () => {
    if (!isLoggedIn) {
      return <p className="text-gray-400 p-6">Please log in.</p>;
    }

    if (showOverlay) {
      return (
        <AddContactOverlay
          onAdd={handleAddContact}
          onClose={() => setShowOverlay(false)}
          invites={invites}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
        />
      );
    }

    if (!activeChat) {
      return (
        <div>
          <ChatListHeader onAddContact={() => setShowOverlay(true)} />
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
