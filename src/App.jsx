// App.jsx
import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Plus } from "lucide-react";

/**
 * Environment config (do NOT hardcode keys here).
 * Make sure these are set in your dev/production environment:
 * VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing. Set env variables."
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function App() {
  const [session, setSession] = useState(null);
  const [userProfile, setUserProfile] = useState(null); // from profiles table
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const messagesRef = useRef(null); // store subscription channel

  // --- Auth/session handling ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        onLogin(data.session);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        if (session) onLogin(session);
        else {
          setUserProfile(null);
          setChats([]);
          setActiveChat(null);
          setMessages([]);
          setInvites([]);
        }
      }
    );

    return () => listener?.subscription?.unsubscribe?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Called after sign in / session available
  async function onLogin(sessionObj) {
    const user = sessionObj.user;
    // ensure the user's row exists in `users` table to satisfy FK checks
    await ensureUsersRow(user);
    // fetch profile (profiles table) if available
    await fetchProfile(user.id);
    // load primary app data
    await loadChats();
    await loadInvites();
  }

  // Upsert a row into 'users' table so messages/invites FKs are satisfied
  async function ensureUsersRow(user) {
    try {
      await supabase
        .from("users")
        .upsert(
          {
            id: user.id,
            email: user.email || null,
            // don't overwrite username here -- profiles table may be used
          },
          { onConflict: "id" }
        )
        .select();
    } catch (err) {
      console.warn("ensureUsersRow error:", err);
    }
  }

  async function fetchProfile(userId) {
    if (!userId) return;
    try {
      const { data } = await supabase
        .from("profiles")
        .select("id, username, avatar")
        .eq("id", userId)
        .single();
      setUserProfile(data || null);
      // optionally upsert username to users table as well (keeps parity)
      if (data) {
        await supabase
          .from("users")
          .upsert({ id: userId, username: data.username }, { onConflict: "id" });
      }
    } catch (err) {
      console.warn("fetchProfile error:", err);
      setUserProfile(null);
    }
  }

  // --- Chats & Invites loading ---
  async function loadChats() {
    if (!session) return;
    setLoadingChats(true);
    try {
      // select chats that contain the current user in participants (array column)
      const { data, error } = await supabase
        .from("chats")
        .select("id, name, participants")
        .contains("participants", [session.user.id]);

      if (error) {
        console.error("fetch chats error", error);
        setChats([]);
        setLoadingChats(false);
        return;
      }

      // fetch usernames for participant ids
      const chatsWithNames = await Promise.all(
        (data || []).map(async (c) => {
          const { data: profiles } = await supabase
            .from("profiles")
            .select("id, username")
            .in("id", c.participants || []);
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
      // pending invites where current user is recipient
      const { data, error } = await supabase
        .from("invites")
        .select("id, sender_id, recipient_id, status")
        .eq("recipient_id", session.user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching invites:", error);
        setInvites([]);
        return;
      }

      // annotate sender usernames
      const invitesWithSenders = await Promise.all(
        (data || []).map(async (inv) => {
          const { data: senderProfile } = await supabase
            .from("profiles")
            .select("username")
            .eq("id", inv.sender_id)
            .single();
          return { ...inv, senderName: senderProfile?.username || "Unknown" };
        })
      );

      setInvites(invitesWithSenders);
    } catch (err) {
      console.error("loadInvites error", err);
      setInvites([]);
    }
  }

  // --- Open chat: load messages + subscribe realtime ---
  useEffect(() => {
    if (!activeChat) {
      setMessages([]);
      removeMessagesSubscription();
      return;
    }
    let cancelled = false;
    (async () => {
      await fetchMessages(activeChat.id);
      if (!cancelled) subscribeToMessages(activeChat.id);
    })();

    return () => {
      cancelled = true;
      removeMessagesSubscription();
    };
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
        console.error("Error fetching messages", error);
        setMessages([]);
        return;
      }
      setMessages(data || []);
      // scroll or focus could be added
    } catch (err) {
      console.error("fetchMessages err", err);
      setMessages([]);
    }
  }

  function subscribeToMessages(chatId) {
    removeMessagesSubscription(); // ensure only one

    const chan = supabase
      .channel(`public:messages:chat_${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((prev) => [...(prev || []), payload.new]);
        }
      )
      .subscribe((status) => {
        // status logs can help debug
        // console.log("subscribe status", status);
      });

    messagesRef.current = chan;
  }

  function removeMessagesSubscription() {
    const chan = messagesRef.current;
    if (chan) {
      try {
        supabase.removeChannel(chan);
      } catch (err) {
        // ignore
      }
      messagesRef.current = null;
    }
  }

  // --- Message send ---
  async function sendMessage(chatId, text, retry = true) {
    if (!chatId || !text?.trim() || !session) return;

    // ensure user exists in users table (fix FK constraint)
    await ensureUsersRow(session.user);

    try {
      const { data, error } = await supabase.from("messages").insert([
        {
          chat_id: chatId,
          sender_id: session.user.id,
          text: text.trim(),
        },
      ]);

      if (error) {
        console.error("sendMessage error", error);
        // if FK/constraint error, attempt to ensure user row and retry once
        if (
          retry &&
          (error.code === "23503" || error.message?.includes("violates foreign key"))
        ) {
          await ensureUsersRow(session.user);
          return sendMessage(chatId, text, false);
        }
        alert("Failed to send message. See console for details.");
        throw error;
      }
      // insertion triggers realtime listener that appends the message
      return data;
    } catch (err) {
      console.error("sendMessage err", err);
      throw err;
    }
  }

  // --- Create chat between current user and contactId (other) ---
  async function createChatWith(recipientId, nameForChat) {
    if (!session || !recipientId) return null;
    // ensure both users exist in users table to avoid FK violations
    await ensureUsersRow(session.user);

    try {
      // create chat row with participants array
      const { data, error } = await supabase
        .from("chats")
        .insert([
          {
            name: nameForChat || null,
            participants: [session.user.id, recipientId],
          },
        ])
        .select()
        .single();

      if (error) {
        console.error("createChat error", error);
        return null;
      }

      // refresh chats list and return new chat
      await loadChats();
      return data;
    } catch (err) {
      console.error("createChat err", err);
      return null;
    }
  }

  // --- Invites: send / accept / deny ---
  async function sendInviteToUsername(username) {
    if (!session || !username) return { error: "missing" };
    try {
      // find recipient in profiles
      const { data: recipient, error: rerr } = await supabase
        .from("profiles")
        .select("id, username")
        .eq("username", username)
        .single();

      if (rerr || !recipient) {
        return { error: "User not found" };
      }

      // ensure our user row exists (FK)
      await ensureUsersRow(session.user);

      const { error: ierr } = await supabase.from("invites").insert([
        {
          sender_id: session.user.id,
          recipient_id: recipient.id,
          status: "pending",
        },
      ]);

      if (ierr) {
        console.error("sendInvite insert error", ierr);
        return { error: ierr.message || "Error sending invite" };
      }

      // refresh invites
      await loadInvites();
      return { ok: true };
    } catch (err) {
      console.error("sendInviteToUsername err", err);
      return { error: "Error sending invite" };
    }
  }

  async function acceptInvite(inviteId, senderId) {
    try {
      // update invite to accepted
      await supabase.from("invites").update({ status: "accepted" }).eq("id", inviteId);

      // create chat with sender
      await createChatWith(senderId);

      await loadInvites();
      await loadChats();
    } catch (err) {
      console.error("acceptInvite err", err);
    }
  }

  async function denyInvite(inviteId) {
    try {
      await supabase.from("invites").update({ status: "denied" }).eq("id", inviteId);
      await loadInvites();
    } catch (err) {
      console.error("denyInvite err", err);
    }
  }

  // --- Auth helpers ---
  async function signInWithMagicLink(email) {
    if (!email) return;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      alert("Error sending magic link: " + error.message);
    } else {
      alert("Magic link sent! Check your email.");
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  // --- UI helpers ---
  function otherParticipantName(chat) {
    if (!chat || !session) return "Unknown";
    const other = (chat.participantsInfo || []).find((p) => p.id !== session.user.id);
    return other?.username || chat.name || "Unknown";
  }

  // --- Render UI ---
  if (!session) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center text-white font-sans">
        <div className="p-8 rounded-2xl bg-gray-900 border border-gray-800 w-96 text-center">
          <div className="mb-4">
            <div className="w-16 h-16 rounded-full bg-gray-700 mx-auto flex items-center justify-center">
              <span className="font-bold text-xl">V</span>
            </div>
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
            {userProfile?.username && (
              <div className="text-sm text-gray-400 ml-2">signed in as {userProfile.username}</div>
            )}
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowAddContact(true)}
              className="p-2 rounded hover:bg-gray-800"
              title="Add contact / Invites"
            >
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
                {!loadingChats && chats.length === 0 && (
                  <div className="text-sm text-gray-500">No chats yet. Click + to add a contact.</div>
                )}
                {chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => setActiveChat(chat)}
                    className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 cursor-pointer"
                  >
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
              onSend={async (text) => {
                try {
                  await sendMessage(activeChat.id, text);
                } catch (err) {
                  console.error("Send failed", err);
                  alert("Failed to send message. See console for details.");
                }
              }}
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
              onClose={() => {
                setShowAddContact(false);
                loadInvites();
                loadChats();
              }}
              onSendInvite={async (username) => {
                const res = await sendInviteToUsername(username);
                if (res?.error) {
                  alert(res.error);
                } else {
                  alert(`Invite sent to ${username}!`);
                }
              }}
              invites={invites}
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

const ChatWindow = ({ chat, messages, onBack, onSend }) => {
  const [text, setText] = useState("");
  const messagesEndRef = useRef();

  useEffect(() => {
    // scroll to bottom when messages change
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  return (
    <div className="flex flex-col h-[60vh] md:h-[70vh]">
      <div className="flex items-center gap-4 mb-3">
        <button onClick={onBack} className="p-1 rounded hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="text-lg font-semibold">{chat.name || "Conversation"}</div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 rounded-lg bg-transparent">
        {messages && messages.length === 0 && (
          <div className="text-sm text-gray-500 mt-6">No messages yet — say hi 👋</div>
        )}

        {(messages || []).map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}

        <div ref={messagesEndRef} />
      </div>

      <div className="mt-3 flex items-center gap-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const v = text.trim();
              if (!v) return;
              onSend(v);
              setText("");
            }
          }}
          className="flex-1 p-3 bg-gray-800 rounded-xl text-sm text-gray-200"
          placeholder="Type a message..."
        />
        <button
          onClick={() => {
            const v = text.trim();
            if (!v) return;
            onSend(v);
            setText("");
          }}
          className="px-4 py-2 bg-gray-700 rounded-lg text-sm hover:bg-gray-600"
        >
          Send
        </button>
      </div>
    </div>
  );
};

const MessageBubble = ({ msg }) => {
  // can't know current user id here easily; styles are neutral
  return (
    <div className="max-w-[80%] p-3 rounded-2xl bg-gray-800 text-sm">
      <div className="text-gray-200">{msg.text}</div>
      <div className="text-xs text-gray-500 mt-1">{new Date(msg.created_at).toLocaleTimeString()}</div>
    </div>
  );
};

const AddContactPanel = ({ onClose, onSendInvite, invites, onAccept, onDeny, onRefresh }) => {
  const [username, setUsername] = useState("");

  return (
    <div>
      <h3 className="text-md font-semibold mb-3">Add Contact</h3>

      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Enter username..."
        className="w-full p-3 rounded bg-gray-800 border border-gray-700 mb-3 text-white"
      />
      <button
        onClick={async () => {
          if (!username.trim()) return alert("Enter username");
          await onSendInvite(username.trim());
          setUsername("");
        }}
        className="w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
      >
        Add
      </button>

      <div className="mt-6">
        <h4 className="text-sm font-semibold mb-2">Invites</h4>
        <div className="space-y-2 max-h-48 overflow-auto pr-2">
          {!invites || invites.length === 0 ? (
            <div className="text-sm text-gray-400">No invites</div>
          ) : (
            invites.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                <div className="text-sm text-gray-200">{inv.senderName}</div>
                <div className="space-x-2">
                  <button
                    onClick={() => onAccept(inv.id, inv.sender_id)}
                    className="px-2 py-1 bg-gray-600 rounded text-sm"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onDeny(inv.id)}
                    className="px-2 py-1 bg-gray-600 rounded text-sm"
                  >
                    Deny
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button onClick={onRefresh} className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">
          Refresh
        </button>
        <button onClick={onClose} className="flex-1 py-2 bg-gray-800 rounded-lg hover:bg-gray-700">
          Close
        </button>
      </div>
    </div>
  );
};
