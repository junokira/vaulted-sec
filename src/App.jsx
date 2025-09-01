import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { ArrowLeft, Plus, Settings } from "lucide-react";
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';

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
  const [unreadCounts, setUnreadCounts] = useState({});
  const [showAddContact, setShowAddContact] = useState(false);
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [invites, setInvites] = useState([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [processingInviteIds, setProcessingInviteIds] = useState(new Set());
  const [needsProfileSetup, setNeedsProfileSetup] = useState(false);
  const [typing, setTyping] = useState({});
  const [presence, setPresence] = useState([]);
  const [receipts, setReceipts] = useState({});

  const messageChannelRef = useRef(null);
  const typingChannelRef = useRef(null);
  const messagesEndRef = useRef();

  /* --- Auth/session handling --- */
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) {
        setSession(data.session);
        onLoggedIn(data.session);
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) onLoggedIn(session);
      else {
        setUserProfile(null);
        setChats([]);
        setActiveChat(null);
        setMessages([]);
        setInvites([]);
        setNeedsProfileSetup(false);
      }
    });

    return () => listener?.subscription?.unsubscribe?.();
  }, []);

  async function onLoggedIn(sessionObj) {
    if (!sessionObj) return;
    const profile = await fetchProfile(sessionObj.user.id);
    if (!profile) {
      setNeedsProfileSetup(true);
    } else {
      setUserProfile(profile);
      setNeedsProfileSetup(false);
      await loadChats(sessionObj.user.id);
      await loadInvites(sessionObj.user.id);
    }
  }

  /* --- Subscriptions & Effects --- */
  useEffect(() => {
    if (!userProfile) return;

    // Realtime subscription for chats
    const chatChannel = supabase
      .channel("public:chats")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "chats", filter: `participants.cs.{"${userProfile.id}"}` },
        () => loadChats(userProfile.id)
      )
      .subscribe();

    // Realtime subscription for messages & unread counts
    const messagesChannel = supabase
      .channel("public:messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          const m = payload.new;
          if (m.sender_id !== userProfile.id) {
            setUnreadCounts((prev) => ({
              ...prev,
              [m.chat_id]: (prev[m.chat_id] || 0) + 1,
            }));
          }
          loadChats(userProfile.id); // Refresh chat order
        }
      )
      .subscribe();
      
    // Realtime subscription for read receipts
    const receiptsChannel = supabase
      .channel("public:message_receipts")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "message_receipts" },
        (payload) => {
          setReceipts((prev) => {
            const newReceipts = { ...prev };
            const receipt = payload.new;
            if (!newReceipts[receipt.message_id]) {
              newReceipts[receipt.message_id] = [];
            }
            // Update or add the receipt
            const existingIndex = newReceipts[receipt.message_id].findIndex(r => r.user_id === receipt.user_id);
            if (existingIndex > -1) {
              newReceipts[receipt.message_id][existingIndex] = receipt;
            } else {
              newReceipts[receipt.message_id].push(receipt);
            }
            return newReceipts;
          });
        }
      )
      .subscribe();

    // Presence & Typing channels
    const presenceChannel = supabase.channel("presence", {
      config: { presence: { key: userProfile.id } },
    });
    
    presenceChannel
      .on("presence", { event: "sync" }, () => {
        setPresence(presenceChannel.presenceState());
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          await presenceChannel.track({
            username: userProfile.username,
            last_seen: new Date().toISOString(),
            online: true,
          });
        }
      });

    const typingChannel = supabase.channel(`typing:chat_id`);
    typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        setTyping((prev) => ({ ...prev, [payload.payload.userId]: true }));
        setTimeout(() => setTyping((prev) => ({ ...prev, [payload.payload.userId]: false })), 2000);
      })
      .subscribe();
    
    typingChannelRef.current = typingChannel;

    return () => {
      supabase.removeChannel(chatChannel);
      supabase.removeChannel(messagesChannel);
      supabase.removeChannel(receiptsChannel);
      supabase.removeChannel(presenceChannel);
      supabase.removeChannel(typingChannel);
    };
  }, [userProfile]);

  /* --- Active Chat logic --- */
  useEffect(() => {
    if (!activeChat || !session) {
      setMessages([]);
      return;
    }
    
    // Mark messages as read
    supabase.rpc("mark_chat_read", { p_chat_id: activeChat.id, p_user_id: session.user.id });
    
    // Clear unread count for this chat
    setUnreadCounts(prev => ({ ...prev, [activeChat.id]: 0 }));
    
    setLoadingMessages(true);
    fetchMessages(activeChat.id).then(() => setLoadingMessages(false));
  }, [activeChat, session]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  /* --- profile fetch --- */
  async function fetchProfile(userId) {
    if (!userId) return;
    try {
      const { data, error } = await supabase.from("profiles").select("id, username, full_name, avatar_url").eq("id", userId).single();
      
      if (error && error.code === "PGRST116") {
        return null;
      }
      if (error) {
        throw error;
      }

      return data || null;
    } catch (err) {
      console.warn("fetchProfile:", err);
      return null;
    }
  }
  
  async function updateProfile(updates) {
    if (!session?.user) return { error: "No user session" };
    try {
      const { data, error } = await supabase.from('profiles').upsert(updates, { onConflict: 'id' }).select().single();
      if (error) throw error;
      
      setUserProfile(data);
      setNeedsProfileSetup(false);
      await loadChats(session.user.id);
      await loadInvites(session.user.id);

      return { success: true };
    } catch (error) {
      console.error("updateProfile error:", error);
      return { error: error.message };
    }
  }

  async function uploadAvatar(file) {
    if (!file || !session?.user) {
      return { error: "No file or user session found." };
    }
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${session.user.id}.${fileExt}`;
      const filePath = `${fileName}`;
      
      const { data, error } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const { data: publicUrlData } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      return { publicUrl: publicUrlData.publicUrl };
      
    } catch (error) {
      console.error("uploadAvatar error:", error);
      return { error: error.message };
    }
  }

  /* --- Chats & Invites load --- */
  async function loadChats(userId) {
    const id = userId || session?.user.id;
    if (!id) return;
    setLoadingChats(true);
    try {
      // Step 1: Fetch chats for the current user, along with a single message for sorting
      const { data, error: chatsError } = await supabase
        .from("chats")
        .select("*, messages(created_at, sender_id)")
        .contains("participants", [id]);

      if (chatsError) {
        throw chatsError;
      }

      const chats = data || [];

      // Step 2: Get all unique participant IDs from the fetched chats
      const allParticipantIds = new Set();
      chats.forEach(chat => {
        chat.participants.forEach(pId => allParticipantIds.add(pId));
      });

      // Step 3: Fetch all profiles for these participants in a single query
      const { data: profilesData, error: profilesError } = await supabase
        .from("profiles")
        .select("id, username, full_name, avatar_url")
        .in("id", Array.from(allParticipantIds));

      if (profilesError) {
        throw profilesError;
      }
      const profilesMap = new Map(profilesData?.map(p => [p.id, p]));

      // Step 4: Map profiles to each chat & sort
      const chatsWithProfiles = chats.map(chat => ({
        ...chat,
        participantsInfo: chat.participants.map(pId => profilesMap.get(pId) || { id: pId, username: "Unknown" }),
        // Sort messages descending to get the latest one
        messages: chat.messages.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
      }));

      // Sort chats by latest message
      const sorted = chatsWithProfiles.sort((a, b) => {
        const aTime = a.messages?.[0]?.created_at ? new Date(a.messages[0].created_at).getTime() : 0;
        const bTime = b.messages?.[0]?.created_at ? new Date(b.messages[0].created_at).getTime() : 0;
        return bTime - aTime;
      });

      setChats(sorted);
    } catch (err) {
      console.error("loadChats err", err);
      setChats([]);
    } finally {
      setLoadingChats(false);
    }
  }

  async function loadInvites(userId) {
    const id = userId || session?.user.id;
    if (!id) return;
    try {
      const { data, error } = await supabase
        .from("invites")
        .select("id, sender_id, recipient_id, status")
        .eq("recipient_id", id)
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
      console.error("loadInvites err:", err);
      setInvites([]);
    }
  }

  /* --- Messages: fetch + realtime subscription --- */
  async function fetchMessages(chatId) {
    if (!chatId) return;
    try {
      const { data, error } = await supabase
        .from("messages")
        .select("id, chat_id, sender_id, text, created_at, profiles(id, username, avatar_url)")
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

  /* --- Send message --- */
  async function sendMessage(chatId, text) {
    if (!chatId || !text?.trim() || !session) return;
    try {
      const tempId = `temp-${Date.now()}-${Math.random()}`;
      const tempMessage = {
        id: tempId,
        chat_id: chatId,
        sender_id: session.user.id,
        text: text.trim(),
        created_at: new Date().toISOString(),
        profiles: { id: session.user.id, username: userProfile.username, avatar_url: userProfile.avatar_url },
      };
      setMessages(prev => [...prev, tempMessage]);
      
      const { data, error } = await supabase.from("messages").insert([
        { chat_id: chatId, sender_id: session.user.id, text: text.trim() },
      ]).select();

      if (error) {
        console.error("sendMessage error", error);
        setMessages(prev => prev.filter(msg => msg.id !== tempId));
        throw error;
      }
      // Update the optimistic message with the real message ID
      setMessages(prev => prev.map(msg => msg.id === tempId ? data[0] : msg));

      // Mark the sent message as read
      await supabase.from("message_receipts").insert({ message_id: data[0].id, user_id: session.user.id, status: 'read' });
      
    } catch (err) {
      console.error("sendMessage catch:", err);
      alert("Failed to send message. See console for details.");
      throw err;
    }
  }
  
  function sendTypingEvent() {
    if (typingChannelRef.current) {
      typingChannelRef.current.send({
        type: "broadcast",
        event: "typing",
        payload: { userId: session.user.id, username: userProfile.username },
      });
    }
  }

  /* --- Robust chat finder/creator --- */
  async function getOrCreateChatWith(participantId, displayName) {
    if (!session || !participantId) return null;
    const me = session.user.id;

    try {
      const { data: candidateChats, error: candErr } = await supabase
        .from("chats")
        .select("id, name, participants")
        .contains("participants", [me]);

      if (candErr) {
        console.error("getOrCreateChatWith - candidate fetch error:", candErr);
      }

      const found = (candidateChats || []).find((c) => c.participants.includes(participantId) && c.participants.length === 2);

      if (found) {
        await loadChats(session.user.id);
        return found;
      }

      const { data: inserted, error: insertErr } = await supabase
        .from("chats")
        .insert([{ name: displayName || null, participants: [me, participantId] }])
        .select()
        .single();

      if (insertErr) {
        console.error("getOrCreateChatWith - insert err:", insertErr);
        return null;
      }

      await loadChats(session.user.id);
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

      const { error } = await supabase.from("invites").insert([
        { sender_id: session.user.id, recipient_id: recipient.id, status: "pending" },
      ]);

      if (error) {
        console.error("sendInvite insert error", error);
        return { error: error.message || "Error sending invite" };
      }

      await loadInvites(session.user.id);
      return { ok: true };
    } catch (err) {
      console.error("sendInviteToUsername err:", err);
      return { error: "Error sending invite" };
    }
  }

  async function acceptInvite(inviteId, senderId, senderName) {
    if (!inviteId || !senderId || !session) return;
    setProcessingInviteIds((prev) => new Set(prev).add(inviteId));

    try {
      const { error: uerr } = await supabase.from("invites").update({ status: "accepted" }).eq("id", inviteId);
      if (uerr) console.error("acceptInvite update err:", uerr);

      const chat = await getOrCreateChatWith(senderId, senderName || undefined);

      if (!chat) {
        alert("Accepted invite but failed to create or find chat. See console.");
        await loadInvites(session.user.id);
        setProcessingInviteIds((prev) => {
          const s = new Set(prev);
          s.delete(inviteId);
          return s;
        });
        return;
      }

      const { data: profiles } = await supabase.from("profiles").select("id, username, full_name, avatar_url").in("id", chat.participants || []);
      const chatWithInfo = { ...chat, participantsInfo: profiles || [] };

      setActiveChat(chatWithInfo);

      await loadInvites(session.user.id);
      await loadChats(session.user.id);
    } catch (err) {
      console.error("acceptInvite err:", err);
      alert("Failed to accept invite. See console.");
    } finally {
      setProcessingInviteIds((prev) => {
        const s = new Set(prev);
        s.delete(inviteId);
        return s;
      });
    }
  }

  async function denyInvite(inviteId) {
    if (!inviteId) return;
    try {
      await supabase.from("invites").update({ status: "denied" }).eq("id", inviteId);
      await loadInvites(session.user.id);
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

  async function signInWithPassword(email, password) {
    if (!email || !password) return;
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) alert("Error signing in: " + error.message);
    else alert("Signed in successfully.");
  }

  async function signOut() {
    await supabase.auth.signOut();
    setSession(null);
  }

  /* --- UI helpers --- */
  function otherParticipantName(chat) {
    if (!chat || !session) return "Unknown";
    const other = (chat.participantsInfo || []).find((p) => p.id !== session.user.id);
    return other?.username || other?.full_name || chat.name || "Unknown";
  }

  const getOtherParticipant = (chat) => {
    return chat.participantsInfo?.find(p => p.id !== session.user.id) || null;
  };

  const getPresence = (userId) => {
    const userPresence = presence[userId]?.[0] || null;
    return userPresence;
  };

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
          <AuthPanel
            onSignInWithMagicLink={signInWithMagicLink}
            onSignInWithPassword={signInWithPassword}
          />
        </div>
      </div>
    );
  }

  if (needsProfileSetup) {
    return (
      <div className="bg-black min-h-screen flex items-center justify-center font-sans text-gray-300 p-4">
        <div className="w-full max-w-lg mx-auto bg-gray-900 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-gray-700 p-6">
          <InitialProfileSetup
            user={session.user}
            onProfileCreate={updateProfile}
          />
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
            <button onClick={() => setShowProfileSettings(true)} className="p-2 rounded hover:bg-gray-800" title="Profile Settings">
              <Settings className="w-5 h-5" />
            </button>
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
          {!activeChat ? (
            <div>
              <div className="space-y-3">
                {loadingChats && <div className="text-sm text-gray-500">Loading chats…</div>}
                {!loadingChats && chats.length === 0 && <div className="text-sm text-gray-500">No chats yet. Click + to add a contact.</div>}
                {chats.map((chat) => {
                  const otherUser = getOtherParticipant(chat);
                  return (
                    <div key={chat.id} onClick={() => setActiveChat(chat)} className="p-3 rounded-xl bg-gray-800 hover:bg-gray-700 cursor-pointer flex items-center gap-3">
                      <img
                        src={otherUser?.avatar_url || "/default-avatar.png"}
                        className="w-10 h-10 rounded-full"
                        alt="Avatar"
                      />
                      <div className="flex-1">
                        <div className="text-gray-200">{otherParticipantName(chat)}</div>
                      </div>
                      {unreadCounts[chat.id] > 0 && (
                        <div className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">
                          {unreadCounts[chat.id]}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <ChatWindow
              chat={activeChat}
              messages={messages}
              loadingMessages={loadingMessages}
              session={session}
              userProfile={userProfile}
              onBack={() => setActiveChat(null)}
              onSend={sendMessage}
              sendTypingEvent={sendTypingEvent}
              typing={typing}
              presence={presence}
              receipts={receipts}
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
              processingInviteIds={processingInviteIds}
              onClose={() => {
                setShowAddContact(false);
                loadInvites(session.user.id);
                loadChats(session.user.id);
              }}
              onSendInvite={async (username) => {
                const res = await sendInviteToUsername(username);
                if (res?.error) alert(res.error);
                else {
                  alert(`Invite sent to ${username}!`);
                  await loadInvites(session.user.id);
                }
              }}
              onAccept={acceptInvite}
              onDeny={denyInvite}
              onRefresh={() => loadInvites(session.user.id)}
            />
          </div>
        </div>
      )}

      {/* Profile Settings Modal */}
      {showProfileSettings && userProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/70" onClick={() => setShowProfileSettings(false)}></div>
          <div className="relative w-96 bg-gray-900 rounded-2xl p-6 border border-gray-800">
            <ProfileSettingsPanel
              userProfile={userProfile}
              updateProfile={updateProfile}
              uploadAvatar={uploadAvatar}
              onClose={() => setShowProfileSettings(false)}
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

function AuthPanel({ onSignInWithMagicLink, onSignInWithPassword }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [usePassword, setUsePassword] = useState(false);

  return (
    <div className="space-y-4">
      <input
        type="email"
        placeholder="Your email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {usePassword && (
        <input
          type="password"
          placeholder="Your password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      )}
      <button
        onClick={() => {
          if (usePassword) {
            onSignInWithPassword(email, password);
          } else {
            onSignInWithMagicLink(email);
          }
        }}
        className="w-full px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Sign In
      </button>
      <div className="text-center text-sm text-gray-400">
        <button onClick={() => setUsePassword(!usePassword)} className="underline hover:text-white">
          {usePassword ? "Use magic link instead" : "Use password instead"}
        </button>
      </div>
    </div>
  );
}

function ChatWindow({ chat, messages, onBack, onSend, loadingMessages, session, userProfile, typing, presence, receipts, sendTypingEvent }) {
  const [text, setText] = useState("");
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messagesEndRef = useRef();

  useEffect(() => {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const otherParticipant = chat.participantsInfo?.find(p => p.id !== session.user.id);
  const chatName = otherParticipant?.username || otherParticipant?.full_name || "Conversation";
  const isTyping = typing[otherParticipant?.id];

  const getPresence = (userId) => {
    return presence[userId]?.[0] || null;
  };
  const otherPresence = getPresence(otherParticipant?.id);
  
  const handleEmojiSelect = (emoji) => {
    setText(prevText => prevText + emoji.native);
  };

  return (
    <div className="flex flex-col h-[60vh] md:h-[70vh]">
      <div className="flex items-center gap-4 mb-3 border-b border-gray-700 pb-2">
        <button onClick={onBack} className="p-1 rounded hover:bg-gray-800">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <img
          src={otherParticipant?.avatar_url || "/default-avatar.png"}
          className="w-10 h-10 rounded-full"
          alt="Avatar"
        />
        <div>
          <div className="text-lg font-semibold">{chatName}</div>
          {otherPresence?.online ? (
            <div className="text-xs text-green-400">● Online</div>
          ) : otherPresence?.last_seen && (
            <div className="text-xs text-gray-400">Last seen {new Date(otherPresence.last_seen).toLocaleTimeString()}</div>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 rounded-lg bg-transparent">
        {loadingMessages ? (
          <div className="text-sm text-gray-500 mt-6 text-center">Loading messages...</div>
        ) : (
          messages && messages.length === 0 ? (
            <div className="text-sm text-gray-500 mt-6 text-center">No messages yet — say hi 👋</div>
          ) : (
            (messages || []).map(m => <MessageBubble key={m.id} msg={m} isSender={m.sender_id === session.user.id} receipts={receipts[m.id]} />)
          )
        )}
        <div ref={messagesEndRef} />
      </div>
      
      {isTyping && <div className="text-sm text-gray-400 pl-3">{otherParticipant?.username || 'Someone'} is typing...</div>}

      <div className="mt-3 flex items-center gap-3">
        <input value={text} onChange={(e) => {
          setText(e.target.value);
          sendTypingEvent();
        }} onKeyDown={(e) => {
          if (e.key === "Enter") {
            const v = text.trim();
            if (!v) return;
            onSend(chat.id, v).catch(() => {});
            setText("");
          }
        }} className="flex-1 p-3 bg-gray-800 rounded-xl text-base text-gray-200" placeholder="Type a message..." />
        <button onClick={() => {
          const v = text.trim();
          if (!v) return;
          onSend(chat.id, v).catch(() => {});
          setText("");
        }} className="px-4 py-2 bg-gray-700 rounded-lg text-sm hover:bg-gray-600">Send</button>
      </div>

      {showEmojiPicker && (
        <div className="relative mt-3">
          <div className="absolute bottom-0 right-0 z-10">
            <Picker data={data} onEmojiSelect={handleEmojiSelect} theme="dark" />
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, isSender, receipts }) {
  const isReadByAll = receipts?.filter(r => r.status === 'read').length === 2;

  return (
    <div className={`flex ${isSender ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex items-end gap-2 ${isSender ? 'flex-row-reverse' : ''}`}>
        <img
          src={msg.profiles?.avatar_url || "/default-avatar.png"}
          className="w-8 h-8 rounded-full"
          alt="Avatar"
        />
        <div className={`max-w-[80%] p-3 rounded-2xl text-sm ${isSender ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-200'}`}>
          <div className="font-semibold text-xs text-gray-400 mb-1">{isSender ? "You" : (msg.profiles?.username || "Unknown")}</div>
          <div className="text-sm">{msg.text}</div>
          <div className="text-xs text-gray-400 mt-1 flex justify-end items-center gap-1">
            {new Date(msg.created_at).toLocaleTimeString()}
            {isSender && (
              <span>
                {isReadByAll ? "✓✓" : "✓"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function AddContactPanel({ onClose, onSendInvite, invites = [], onAccept, onDeny, onRefresh, processingInviteIds }) {
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
          {(!invites || invites.length === 0) ? (
            <div className="text-sm text-gray-400">No invites</div>
          ) : (
            invites.map(inv => (
              <div key={inv.id} className="flex items-center justify-between bg-gray-800 p-2 rounded">
                <div className="text-sm text-gray-200">{inv.senderName}</div>
                <div className="space-x-2">
                  <button
                    onClick={() => onAccept(inv.id, inv.sender_id, inv.senderName)}
                    className="px-2 py-1 bg-gray-600 rounded text-sm"
                    disabled={processingInviteIds && processingInviteIds.has(inv.id)}
                  >
                    {processingInviteIds && processingInviteIds.has(inv.id) ? "Accepting..." : "Accept"}
                  </button>
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

function InitialProfileSetup({ user, onProfileCreate }) {
  const [username, setUsername] = useState("");
  const [updating, setUpdating] = useState(false);

  async function handleCreate(e) {
    e.preventDefault();
    setUpdating(true);
    const updates = {
      id: user.id,
      username,
    };
    const result = await onProfileCreate(updates);
    if (result.success) {
      alert("Profile created successfully!");
    } else {
      alert("Creation failed: " + result.error);
    }
    setUpdating(false);
  }

  return (
    <div>
      <h3 className="text-md font-semibold mb-3">Create Your Profile</h3>
      <p className="text-sm text-gray-400 mb-4">You need to set a username before you can continue.</p>
      <form onSubmit={handleCreate}>
        <div className="mb-3">
          <label htmlFor="username" className="text-sm block mb-1">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
            required
          />
        </div>
        <div className="flex gap-3 mt-4">
          <button type="submit" disabled={updating} className="flex-1 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-700">
            {updating ? "Saving..." : "Create Profile"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ProfileSettingsPanel({ userProfile, updateProfile, uploadAvatar, onClose }) {
  const [username, setUsername] = useState(userProfile?.username || '');
  const [fullName, setFullName] = useState(userProfile?.full_name || '');
  const [avatarFile, setAvatarFile] = useState(null);
  const [updating, setUpdating] = useState(false);

  async function handleUpdate(e) {
    e.preventDefault();
    setUpdating(true);

    let avatarUrl = userProfile?.avatar_url || null;
    let error;

    if (avatarFile) {
      const uploadResult = await uploadAvatar(avatarFile);
      if (uploadResult.error) {
        error = uploadResult.error;
      } else {
        avatarUrl = uploadResult.publicUrl;
      }
    }

    if (error) {
      alert("Update failed: " + error);
      setUpdating(false);
      return;
    }

    const updates = {
      id: userProfile.id,
      username,
      full_name: fullName,
      avatar_url: avatarUrl,
      updated_at: new Date(),
    };
    const result = await updateProfile(updates);
    if (result.success) {
      alert("Profile updated!");
    } else {
      alert("Update failed: " + result.error);
    }
    setUpdating(false);
  }

  return (
    <div>
      <h3 className="text-md font-semibold mb-3">Profile Settings</h3>
      {userProfile?.avatar_url && (
        <div className="mb-3 text-center">
          <img src={userProfile.avatar_url} alt="Current Avatar" className="w-20 h-20 rounded-full mx-auto" />
        </div>
      )}
      <form onSubmit={handleUpdate}>
        <div className="mb-3">
          <label htmlFor="username" className="text-sm block mb-1">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
            required
          />
        </div>
        <div className="mb-3">
          <label htmlFor="fullName" className="text-sm block mb-1">Full Name</label>
          <input
            id="fullName"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="w-full p-3 rounded bg-gray-800 border border-gray-700 text-white"
          />
        </div>
        <div className="mb-3">
          <label htmlFor="avatar" className="text-sm block mb-1">Avatar</label>
          <input
            id="avatar"
            type="file"
            accept="image/*"
            onChange={(e) => setAvatarFile(e.target.files[0])}
            className="w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-gray-700 file:text-white hover:file:bg-gray-600"
          />
        </div>
        <div className="flex gap-3 mt-4">
          <button type="submit" disabled={updating} className="flex-1 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-700">
            {updating ? "Saving..." : "Save Changes"}
          </button>
          <button type="button" onClick={onClose} className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">Close</button>
        </div>
      </form>
    </div>
  );
}
