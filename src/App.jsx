// App.jsx
import React, { useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient"; // <-- keep keys out of this file

export default function App() {
  const [session, setSession] = useState(null);
  const [chats, setChats] = useState([]);
  const [invites, setInvites] = useState([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  const messagesEndRef = useRef(null);
  const subscriptionRef = useRef(null);

  // --- scroll to bottom when messages change ---
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // --- auth session handling ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => listener?.subscription?.unsubscribe?.();
  }, []);

  // --- load chats & invites when authenticated ---
  useEffect(() => {
    if (!session) return;
    fetchChats();
    fetchInvites();
  }, [session]);

  // --- fetch chats (with participant usernames) ---
  async function fetchChats() {
    if (!session) return;
    try {
      const { data: chatRows, error } = await supabase
        .from("chats")
        .select("id, participants")
        .contains("participants", [session.user.id]);

      if (error) throw error;

      // attach participant profile info
      const chatsWithProfiles = await Promise.all(
        (chatRows || []).map(async (c) => {
          const { data: profiles, error: pErr } = await supabase
            .from("profiles")
            .select("id, username")
            .in("id", c.participants);
          if (pErr) console.warn("profiles fetch error", pErr);
          return { ...c, participantsInfo: profiles || [] };
        })
      );

      setChats(chatsWithProfiles);
    } catch (err) {
      console.error("fetchChats error", err);
    }
  }

  // --- fetch pending invites for current user ---
  async function fetchInvites() {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from("invites")
        .select("id, sender_id, recipient_id, status")
        .eq("recipient_id", session.user.id)
        .eq("status", "pending");

      if (error) throw error;

      const decorated = await Promise.all(
        (data || []).map(async (inv) => {
          const { data: sender, error: sErr } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", inv.sender_id)
            .single();
          if (sErr) console.warn("invite sender lookup error", sErr);
          return { ...inv, senderName: sender?.username || "Unknown" };
        })
      );

      setInvites(decorated);
    } catch (err) {
      console.error("fetchInvites error", err);
    }
  }

  // --- open a chat: load messages + subscribe to realtime inserts ---
  async function openChat(chat) {
    if (!session || !chat) return;

    // cleanup previous subscription
    if (subscriptionRef.current) {
      try {
        await supabase.removeChannel(subscriptionRef.current);
      } catch (e) {
        // ignore
      }
      subscriptionRef.current = null;
    }

    setActiveChat(chat);
    setMessages([]);

    try {
      const { data: msgs, error } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, text, created_at")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setMessages(msgs || []);
    } catch (err) {
      console.error("load messages error", err);
    }

    // subscribe to new messages on this chat
    const channel = supabase
      .channel(`chat-${chat.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${chat.id}`,
        },
        (payload) => {
          if (payload?.new) {
            setMessages((prev) => [...prev, payload.new]);
          }
        }
      )
      .subscribe();

    subscriptionRef.current = channel;
  }

  // --- safe send message ---
  async function sendMessage() {
    if (!newMessage.trim()) return;
    if (!activeChat || !activeChat.id) {
      alert("No active chat selected.");
      return;
    }
    const text = newMessage.trim();

    try {
      // insert and return the row
      const { data, error } = await supabase
        .from("messages")
        .insert([
          {
            chat_id: activeChat.id,
            sender_id: session.user.id,
            text,
          },
        ])
        .select("id, chat_id, sender_id, text, created_at")
        .single();

      if (error) throw error;

      // optimistic / immediate local append (even though realtime also will add it)
      setMessages((prev) => [...prev, data]);
      setNewMessage("");
    } catch (err) {
      console.error("sendMessage error", err);
      alert("Failed to send message. See console for details.");
    }
  }

  // --- send an invite by username ---
  async function sendInvite() {
    if (!usernameInput.trim() || !session) return;
    try {
      const { data: recipient, error: userErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("username", usernameInput.trim())
        .single();

      if (userErr || !recipient) {
        alert("User not found.");
        return;
      }

      const { error } = await supabase.from("invites").insert([
        {
          sender_id: session.user.id,
          recipient_id: recipient.id,
          status: "pending",
        },
      ]);

      if (error) {
        throw error;
      }

      alert(`Invite sent to ${usernameInput}!`);
      setUsernameInput("");
      fetchInvites();
    } catch (err) {
      console.error("sendInvite error", err);
      alert("Error sending invite.");
    }
  }

  async function acceptInvite(inviteId, senderId) {
    try {
      await supabase.from("invites").update({ status: "accepted" }).eq("id", inviteId);
      await supabase.from("chats").insert([{ participants: [session.user.id, senderId] }]);
      fetchChats();
      fetchInvites();
      setShowModal(false);
    } catch (err) {
      console.error("acceptInvite error", err);
    }
  }

  async function denyInvite(inviteId) {
    try {
      await supabase.from("invites").update({ status: "denied" }).eq("id", inviteId);
      fetchInvites();
    } catch (err) {
      console.error("denyInvite error", err);
    }
  }

  // --- UI pieces ---
  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: "github" })}
          className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
        >
          Sign In with GitHub
        </button>
      </div>
    );
  }

  // Active chat view
  if (activeChat) {
    const other = activeChat.participantsInfo?.find((p) => p.id !== session.user.id);

    const formatTime = (iso) => {
      if (!iso) return "";
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    };

    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="w-[420px] h-[600px] p-4 bg-gray-900 rounded-2xl shadow-lg border border-gray-800 flex flex-col">
          <div className="flex items-center mb-4">
            <button onClick={() => setActiveChat(null)} className="mr-2 text-gray-400">
              ←
            </button>
            <h2 className="text-lg font-bold">{other?.username || "Unknown"}</h2>
          </div>

          <div className="flex-1 overflow-y-auto px-1 space-y-3">
            {messages.map((m) => {
              const mine = m.sender_id === session.user.id;
              return (
                <div key={m.id} className={`max-w-[80%] ${mine ? "ml-auto" : ""}`}>
                  <div
                    className={`p-3 rounded-xl ${mine ? "bg-gray-700" : "bg-gray-800"}`}
                  >
                    <div className="text-sm">{m.text}</div>
                    <div className="text-xs text-gray-400 mt-1 text-right">{formatTime(m.created_at)}</div>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-center mt-3">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="Type a message..."
              className="flex-1 p-3 bg-gray-800 rounded-lg mr-2 text-white"
            />
            <button
              onClick={sendMessage}
              className="px-4 py-2 bg-gray-700 rounded-lg disabled:opacity-60"
              disabled={!newMessage.trim()}
            >
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Chat list + modal
  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <div className="w-[420px] min-h-[420px] p-4 bg-gray-900 rounded-2xl shadow-lg border border-gray-800 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold">Vaulted</h1>
          <button className="text-xl font-bold" onClick={() => setShowModal(true)}>
            +
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2">
          {chats.length === 0 && (
            <p className="text-gray-500 text-sm text-center mt-20">No chats yet. Add a contact to start.</p>
          )}

          {chats.map((c) => {
            const other = c.participantsInfo?.find((p) => p.id !== session.user.id);
            return (
              <div
                key={c.id}
                onClick={() => openChat(c)}
                className="p-3 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer"
              >
                {other?.username || "Unknown"}
              </div>
            );
          })}
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/60">
            <div className="w-[380px] p-6 bg-gray-900 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-md font-semibold mb-3">Add Contact</h2>

              <input
                type="text"
                placeholder="Enter username..."
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full p-3 rounded bg-gray-800 border border-gray-700 mb-3 text-white"
              />
              <button onClick={sendInvite} className="w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600 mb-4">
                Add
              </button>

              <h3 className="mt-2 text-sm font-semibold">Pending Invites</h3>
              <div className="space-y-2 mt-2 max-h-44 overflow-auto">
                {invites.length === 0 && <p className="text-gray-400 text-sm">No invites</p>}
                {invites.map((inv) => (
                  <div key={inv.id} className="flex justify-between items-center p-2 bg-gray-800 rounded-lg">
                    <span>{inv.senderName}</span>
                    <div className="space-x-2">
                      <button
                        onClick={() => acceptInvite(inv.id, inv.sender_id)}
                        className="px-2 py-1 bg-gray-600 rounded text-sm"
                      >
                        Accept
                      </button>
                      <button onClick={() => denyInvite(inv.id)} className="px-2 py-1 bg-gray-600 rounded text-sm">
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button onClick={() => setShowModal(false)} className="mt-4 w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
