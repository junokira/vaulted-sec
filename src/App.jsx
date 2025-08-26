// src/App.jsx
import React, { useEffect, useState } from "react";
import { Plus, ArrowLeft, Send } from "lucide-react";
import supabase from "./supabaseClient";

export default function App() {
  const [user, setUser] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showOverlay, setShowOverlay] = useState(false);
  const [invites, setInvites] = useState([]);

  // --- Auth Handling ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setUser(data.session.user);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- Load Chats ---
  async function loadChats() {
    if (!user) return;
    const { data, error } = await supabase
      .from("chats")
      .select("*")
      .contains("participants", [user.id]);
    if (!error) setChats(data || []);
  }

  useEffect(() => {
    loadChats();
  }, [user]);

  // --- Load Messages ---
  useEffect(() => {
    if (!activeChat) return;
    async function fetchMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", activeChat.id)
        .order("created_at", { ascending: true });
      if (!error) setMessages(data || []);
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

    return () => supabase.removeChannel(channel);
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

  // --- Invite System ---
  async function fetchInvites() {
    if (!user) return;
    const { data, error } = await supabase
      .from("invites")
      .select("id, from_id, from_username, status")
      .eq("to_id", user.id)
      .eq("status", "pending");
    if (!error) setInvites(data || []);
  }

  useEffect(() => {
    fetchInvites();
  }, [user]);

  async function handleAddContact(username) {
    const { data: targetUser, error } = await supabase
      .from("users")
      .select("id, username")
      .eq("username", username)
      .single();

    if (error || !targetUser) {
      alert("User not found.");
      return;
    }

    const { error: inviteError } = await supabase.from("invites").insert({
      from_id: user.id,
      from_username: user.email,
      to_id: targetUser.id,
      status: "pending",
    });

    if (inviteError) console.error("Invite error:", inviteError);
    else alert("Invite sent!");
  }

  async function handleAcceptInvite(inviteId, fromId) {
    try {
      await supabase.from("invites").update({ status: "accepted" }).eq("id", inviteId);

      const { data: newChat, error: chatError } = await supabase
        .from("chats")
        .insert({
          name: "New Chat",
          participants: [user.id, fromId],
        })
        .select()
        .single();

      if (chatError) throw chatError;

      setChats((prev) => [newChat, ...prev]);
      await supabase.from("invites").delete().eq("id", inviteId);
      fetchInvites();
    } catch (err) {
      console.error("Error accepting invite:", err.message);
    }
  }

  async function handleDeclineInvite(inviteId) {
    await supabase.from("invites").update({ status: "declined" }).eq("id", inviteId);
    await supabase.from("invites").delete().eq("id", inviteId);
    fetchInvites();
  }

  return (
    <div className="bg-black text-gray-200 min-h-screen flex items-center justify-center">
      <div className="w-full max-w-lg mx-auto bg-gray-900 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-gray-700">
        {!user ? (
          <div className="p-8 text-center">
            <h1 className="text-2xl font-bold">Vaulted</h1>
            <p className="text-gray-400 mt-2">Please sign in</p>
          </div>
        ) : !activeChat ? (
          <div>
            <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-700">
              <h1 className="text-xl font-bold">Vaulted</h1>
              <Plus className="w-5 h-5 cursor-pointer" onClick={() => setShowOverlay(true)} />
            </div>

            <div className="p-4 space-y-2">
              {chats.map((chat) => (
                <div
                  key={chat.id}
                  onClick={() => setActiveChat(chat)}
                  className="flex items-center p-4 rounded-xl cursor-pointer hover:bg-gray-800"
                >
                  <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
                    <span className="text-black font-bold">{chat.name[0]}</span>
                  </div>
                  <div className="ml-3">
                    <h2 className="font-semibold">{chat.name}</h2>
                  </div>
                </div>
              ))}
            </div>

            {showOverlay && (
              <div className="p-6 space-y-4 bg-gray-800">
                <h2 className="font-bold text-lg">Add Contact</h2>
                <input
                  type="text"
                  placeholder="username"
                  className="p-2 w-full rounded bg-gray-700"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleAddContact(e.target.value);
                  }}
                />

                <h2 className="font-bold text-lg mt-4">Invites</h2>
                {invites.length === 0 && <p className="text-gray-400">No invites</p>}
                {invites.map((invite) => (
                  <div key={invite.id} className="p-3 bg-gray-700 rounded-xl flex justify-between">
                    <span>{invite.from_username} wants to chat</span>
                    <div className="space-x-2">
                      <button
                        onClick={() => handleAcceptInvite(invite.id, invite.from_id)}
                        className="px-2 py-1 bg-green-600 rounded"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => handleDeclineInvite(invite.id)}
                        className="px-2 py-1 bg-red-600 rounded"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                ))}

                <button
                  onClick={() => setShowOverlay(false)}
                  className="mt-4 text-gray-400 underline"
                >
                  Close
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="bg-black/80 p-4 flex items-center border-b border-gray-700">
              <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={() => setActiveChat(null)} />
              <h2 className="ml-3">{activeChat.name}</h2>
            </div>
            <div className="flex-1 p-4 overflow-y-auto space-y-2">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`p-3 rounded-xl max-w-[70%] ${
                    msg.sender_id === user.id ? "ml-auto bg-blue-600" : "mr-auto bg-gray-700"
                  }`}
                >
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="bg-black/80 p-3 flex items-center">
              <input
                type="text"
                placeholder="Message..."
                className="flex-1 p-2 bg-gray-700 rounded-xl"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSendMessage(e.target.value);
                }}
              />
              <Send className="ml-3 w-5 h-5 cursor-pointer" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
