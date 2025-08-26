// App.jsx
import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Plus } from "lucide-react";

/* -------------------------
   Supabase client (env)
   ------------------------- */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY env vars.");
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

/* -------------------------
   App
   ------------------------- */
export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);

  const messageChannelRef = useRef(null);

  /* --- Auth/session handling --- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        handleLogin(data.session);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) handleLogin(session);
      else {
        // signed out
        setUserProfile(null);
        setChats([]);
        setActiveChat(null);
        setMessages([]);
        setInvites([]);
      }
    });

    return () => listener?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleLogin(sessionObj) {
    if (!sessionObj) return;
    const u = sessionObj.user;
    // ensure users row exists to satisfy FK constraints for messages/invites
    await ensureUserId(u.id);
    await fetchProfile(u.id);
    await loadChats();
    await loadInvites();
  }

  /* --- Helpers to ensure user row exists (fix foreign key violations) --- */
  async function ensureUserId(id) {
    if (!id) return;
    try {
      await supabase.from("users").upsert({ id }, { onConflict: "id" }).select();
    } catch (err) {
      console.warn("ensureUserId error:", err);
    }
  }

  /* --- profile fetch --- */
  async function fetchProfile(userId) {
    if (!userId) return;
    try {
      const { data } = await supabase.from("profiles").select("id, username, avatar").eq("id", userId).single();
      setUserProfile(data || null);
      // optional: mirror username into users table
      if (data?.username) {
        await supabase.from("users").upsert({ id: userId, username: data.username }, { onConflict: "id" });
      }
    } catch (err) {
      console.warn("fetchProfile:", err);
      setUserProfile(null);
    }
  }

  /* --- Chats & Invites loading --- */
  async function loadChats() {
    if (!session) return;
    setLoadingChats(true);
    try {
      const { data, error } = await supabase
        .from("chats")
        .select("id, name, participants")
        .contains("participants", [session.user.id]);

      if (error) {
        console.error("loadChats error:", error);
        setChats([]);
        setLoadingChats(false);
        return;
      }

      // fetch participant usernames
      const chatsWithNames = await Promise.all(
        (data || []).map(async (c) => {
          const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", c.participants || []);
          return { ...c, participantsInfo: profiles || [] };
        })
      );

      setChats(chatsWithNames);
    } catch (err) {
      console.error("loadChats err", err);
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadInvites() {
    if (!session) return;
    try {
      const { data, error } = await supabase
        .from("invites")
        .select("id, sender_id, recipient_id, status")
        .eq("recipient_id", session.user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("loadInvites error:", error);
        setInvites([]);
        return;
      }

      const invitesWithNames = await Promise.all(
        (data || []).map(async (inv) => {
          const { data: sp } = await supabase.from("profiles").select("username").eq("id", inv.sender_id).single();
          return { ...inv, senderName: sp?.username || "Unknown" };
        })
      );

      setInvites(invitesWithNames);
    } catch (err) {
      console.error("loadInvites err", err);
      setInvites([]);
    }
  }

  /* --- Messages: fetch + realtime subscription --- */
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      removeMessageSubscription();
      return;
    }
    (async () => {
      await fetchMessages(activeChat.id);
      subscribeToMessages(activeChat.id);
    })();
    return () => removeMessageSubscription();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeChat]);

  async function fetchMessages(chatId) {
    if (!chatId) return;
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, text, created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true });

      if (error) {
        console.error("fetchMessages error:", error);
        setMessages([]);
        return;
      }
      setMessages(data || []);
    } catch (err) {
      console.error("fetchMessages err", err);
      setMessages([]);
    }
  }

  function subscribeToMessages(chatId) {
    removeMessageSubscription();

    const channel = supabase
      .channel(`public:messages:chat_${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => [...(prev || []), payload.new]);
        }
      )
      .subscribe((status) => {
        // optional: console.log("sub status", status);
      });

    messageChannelRef.current = channel;
  }

  function removeMessageSubscription() {
    const ch = messageChannelRef.current;
    if (ch) {
      try {
        supabase.removeChannel(ch);
      } catch (err) {
        // ignore
      }
      messageChannelRef.current = null;
    }
  }

  /* --- Send message --- */
  async function sendMessage(chatId, text) {
    if (!chatId || !text?.trim() || !session) return;
    try {
      // ensure current user exists in users (prevents FK fail)
      await ensureUserId(session.user.id);

      const { data, error } = await supabase.from("messages").insert([
        { chat_id: chatId, sender_id: session.user.id, text: text.trim() },
      ]);

      if (error) {
        console.error("sendMessage error", error);
        // If FK error, attempt ensure and retry once
        if (error.code === "23503" || /foreign key/i.test(error.message || "")) {
          await ensureUserId(session.user.id);
          const r = await supabase.from("messages").insert([
            { chat_id: chatId, sender_id: session.user.id, text: text.trim() },
          ]);
          if (r.error) throw r.error;
          return r.data;
        }
        throw error;
      }
      // realtime will append message to messages array; return inserted
      return data;
    } catch (err) {
      console.error("sendMessage catch:", err);
      alert("Failed to send message. See console for details.");
      throw err;
    }
  }

  /* --- Find or create chat between two users, return the chat object --- */
  async function getOrCreateChatWith(participantId, displayName) {
    if (!session || !participantId) return null;
    const me = session.user.id;
    // ensure both user rows exist to prevent FK issues later
    await ensureUserId(me);
    await ensureUserId(participantId);

    try {
      // try to find existing chat that contains both participant ids
      const { data: found, error: findErr } = await supabase
        .from("chats")
        .select("id, name, participants")
        .contains("participants", [me, participantId]);

      if (findErr) {
        console.error("getOrCreateChatWith findErr:", findErr);
      }

      if (found && found.length > 0) {
        // pick the first
        const chat = found[0];
        await loadChats(); // refresh list
        return chat;
      }

      // create new chat
      const { data: inserted, error: insertErr } = await supabase
        .from("chats")
        .insert([{ name: displayName || null, participants: [me, participantId] }])
        .select()
        .single();

      if (insertErr) {
        console.error("getOrCreateChatWith insertErr:", insertErr);
        return null;
      }

      // refresh chat list
      await loadChats();
      return inserted;
    } catch (err) {
      console.error("getOrCreateChatWith err:", err);
      return null;
    }
  }

  /* --- Invites: send / accept / deny --- */
  async function sendInviteToUsername(username) {
    if (!session || !username) return { error: "missing" };

    try {
      const { data: recipient, error: rerr } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", username)
        .single();

      if (rerr || !recipient) {
        return { error: "User not found" };
      }

      // ensure current user row exists
      await ensureUserId(session.user.id);

      const { error } = await supabase.from("invites").insert([
        { sender_id: session.user.id, recipient_id: recipient.id, status: "pending" },
      ]);

      if (error) {
        console.error("sendInvite insert error", error);
        return { error: error.message || "Error sending invite" };
      }

      await loadInvites();
      return { ok: true };
    } catch (err) {
      console.error("sendInviteToUsername err", err);
      return { error: "Error sending invite" };
    }
  }

  async function acceptInvite(inviteId, senderId) {
    if (!inviteId || !senderId || !session) return;
    try {
      // update invite
      const { error: uerr } = await supabase.from("invites").update({ status: "accepted" }).eq("id", inviteId);
      if (uerr) {
        console.error("acceptInvite update err:", uerr);
      }

      // ensure both users exist
      await ensureUserId(session.user.id);
      await ensureUserId(senderId);

      // find or create chat and open it
      const chat = await getOrCreateChatWith(senderId);
      if (chat) {
        // fetch participantsInfo for the chat (usernames)
        const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", chat.participants || []);
        const chatWithInfo = { ...chat, participantsInfo: profiles || [] };
        setActiveChat(chatWithInfo);
        // The messages effect will load messages and subscribe
      }

      await loadInvites();
    } catch (err) {
      console.error("acceptInvite err:", err);
      alert("Failed to accept invite. See console.");
    }
  }

  async function denyInvite(inviteId) {
    if (!inviteId) return;
    try {
      await supabase.from("invites").update({ status: "denied" }).eq("id", inviteId);
      await loadInvites();
    } catch (err) {
      console.error("denyInvite err:", err);
    }
  }

  /* --- Auth helpers --- */
  async function signInWithMagicLink(email) {
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) alert("Error sending magic link: " + error.message);
    else alert("Magic link sent.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  /* --- UI helpers --- */
  function otherParticipantName(chat) {
    if (!chat || !session) return "Unknown";
    const other = (chat.participantsInfo || []).find((p) => p.id !== session.user.id);
    return other?.username || chat.name || "Unknown";
  }

  /* --- Render --- */
  if (!session) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center text-white font-sans">
        <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 w-96 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-700 mx-auto flex items-center justify-center mb-4">
            <span className="font-bold text-xl">V</span>
          </div>
          <h2 className="text-xl font-bold mb-2">Vaulted</h2>
          <p className="text-sm text-gray-400 mb-4">Sign in to continue</p>
          <button
            onClick={() => supabase.auth.signInWithOAuth({ provider: "github" })}
            className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
          >
            Sign In with GitHub
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-black min-h-screen flex items-center justify-center font-sans text-gray-300 p-4">
      <div className="w-full max-w-lg mx-auto bg-gray-900 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-gray-700">
        {/* Header */}
        <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-700">
          <div className="flex items-center gap-4">
            <div className="text-xl font-bold">Vaulted</div>
            {userProfile?.username && <div className="text-sm text-gray-400">signed in as {userProfile.username}</div>}
          </div>
          <div className="flex items-center gap-4">
            <button onClick={() => setShowAddContact(true)} className="p-2 rounded hover:bg-gray-800" title="Add contact / Invites">
              <Plus className="w-5 h-5" />
            </button>
            <button onClick={signOut} className="text-sm text-gray-400 hover:text-white">
              Sign out
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Chat list or active chat */}
          {!activeChat ? (
            <div>
              <div className="space-y-3">
                {loadingChats && <div className="text-sm text-gray-500">Loading chats…</div>}
                {!loadingChats && chats.length === 0 && <div className="text-sm text-gray-500">No chats yet. Click + to add a contact.</div>}
                {chats.map((chat) => (
                  <div key={chat.id} onClick={async () => {
                    // fetch participants info (if missing) then open
                    const { data: profiles } = await supabase.from("profiles").select("id, username").in("id", chat.participants || []);
                    setActiveChat({ ...chat, participantsInfo: profiles || [] });
                  }} className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 cursor-pointer">
                    <div className="text-gray-200">{otherParticipantName(chat)}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ChatWindow
              chat={activeChat}
              messages={messages}
              onBack={() => setActiveChat(null)}
              onSend={sendMessage}
            />
          )}
        </div>
      </div>

      {/* Add Contact / Invites Modal */}
      {showAddContact && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowAddContact(false)}></div>
          <div className="relative w-96 bg-gray-900 rounded-2xl p-6 border border-gray-800">
            <AddContactPanel
              invites={invites}
              onClose={() => {
                setShowAddContact(false);
                loadInvites();
                loadChats();
              }}
              onSendInvite={async (username) => {
                const res = await sendInviteToUsername(username);
                if (res?.error) alert(res.error);
                else {
                  alert(`Invite sent to ${username}!`);
                  await loadInvites();
                }
              }}
              onAccept={acceptInvite}
              onDeny={denyInvite}
              onRefresh={() => loadInvites()}
            />
          </div>
        </div>
      )}
    </div>
  );
}

/* =========================
   Child components
   ========================= */

function ChatWindow({ chat, messages, onBack, onSend }) {
  const [text, setText] = useState("");
  const messagesEndRef = useRef();

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col h-[60vh] md:h-[70vh]">
      <div className="flex items-center gap-4 mb-3">
        <button onClick={onBack} className="p-1 rounded hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-lg font-semibold">{chat.name || chat.participantsInfo?.find(p => p)?.username || "Conversation"}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 rounded-lg bg-transparent">
        {messages && messages.length === 0 && <div className="text-sm text-gray-500 mt-6">No messages yet — say hi 👋</div>}
        {(messages || []).map(m => <MessageBubble key={m.id} msg={m} />)}
        <div ref={messagesEndRef} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = text.trim();
            if (!v) return;
            onSend(chat.id, v).catch(() => { /* error handled inside sendMessage */ });
            setText("");
          }
        }} className="flex-1 p-3 bg-gray-800 rounded-xl text-sm text-gray-200" placeholder="Type a message..." />
        <button onClick={() => {
          const v = text.trim();
          if (!v) return;
          onSend(chat.id, v).catch(() => {});
          setText("");
        }} className="px-4 py-2 bg-gray-700 rounded-lg text-sm hover:bg-gray-600">Send</button>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  return (
    <div className="max-w-[80%] p-3 rounded-2xl bg-gray-800 text-sm">
      <div className="text-gray-200">{msg.text}</div>
      <div className="text-xs text-gray-500 mt-1">{new Date(msg.created_at).toLocaleTimeString()}</div>
    </div>
  );
}

function AddContactPanel({ onClose, onSendInvite, invites, onAccept, onDeny, onRefresh }) {
  const [username, setUsername] = useState("");

  return (
    <div>
      <h3 className="text-md font-semibold mb-3">Add Contact</h3>

      <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter username..." className="w-full p-3 rounded bg-gray-800 border border-gray-700 mb-3 text-white" />
      <button onClick={async () => {
        if (!username.trim()) return alert("Enter username");
        await onSendInvite(username.trim());
        setUsername("");
      }} className="w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600">Add</button>

      <div className="mt-6">
        <h4 className="text-sm font-semibold mb-2">Invites</h4>
        <div className="space-y-2 max-h-48 overflow-auto pr-2">
          {!invites || invites.length === 0 ? (
            <div className="text-sm text-gray-400">No invites</div>
          ) : (
            invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                <div className="text-sm text-gray-200">{inv.senderName}</div>
                <div className="space-x-2">
                  <button onClick={() => onAccept(inv.id, inv.sender_id)} className="px-2 py-1 bg-gray-600 rounded text-sm">Accept</button>
                  <button onClick={() => onDeny(inv.id)} className="px-2 py-1 bg-gray-600 rounded text-sm">Deny</button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={onRefresh} className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">Refresh</button>
        <button onClick={onClose} className="flex-1 py-2 bg-gray-800 rounded-lg hover:bg-gray-700">Close</button>
      </div>
    </div>
  );
}
