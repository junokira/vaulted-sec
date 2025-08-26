import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function App() {
  const [session, setSession] = useState(null);
  const [chats, setChats] = useState([]);
  const [invites, setInvites] = useState([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  // --- Fetch chats + invites ---
  useEffect(() => {
    if (session) {
      fetchChats();
      fetchInvites();
    }
  }, [session]);

  const fetchChats = async () => {
    const { data, error } = await supabase
      .from("chats")
      .select("id, participants")
      .contains("participants", [session.user.id]);

    if (error) {
      console.error("Error fetching chats:", error);
      return;
    }

    const chatsWithNames = await Promise.all(
      (data || []).map(async (chat) => {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, username")
          .in("id", chat.participants);

        return { ...chat, participantsInfo: profiles || [] };
      })
    );

    setChats(chatsWithNames);
  };

  const fetchInvites = async () => {
    const { data, error } = await supabase
      .from("invites")
      .select("id, sender_id, recipient_id, status")
      .eq("recipient_id", session.user.id)
      .eq("status", "pending");

    if (error) {
      console.error("Error fetching invites:", error);
      return;
    }

    const invitesWithSenders = await Promise.all(
      (data || []).map(async (invite) => {
        const { data: senderProfile } = await supabase
          .from("profiles")
          .select("username")
          .eq("id", invite.sender_id)
          .single();
        return { ...invite, senderName: senderProfile?.username || "Unknown" };
      })
    );

    setInvites(invitesWithSenders);
  };

  // --- Chat view ---
  const openChat = async (chat) => {
    setActiveChat(chat);
    const { data, error } = await supabase
      .from("messages")
      .select("id, sender_id, text, created_at")
      .eq("chat_id", chat.id)
      .order("created_at", { ascending: true });

    if (!error) setMessages(data || []);

    const channel = supabase
      .channel("chat-" + chat.id)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chat.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeChat) return;

    const { data, error } = await supabase
      .from("messages")
      .insert([
        { chat_id: activeChat.id, sender_id: session.user.id, text: newMessage },
      ])
      .select()
      .single();

    if (error) {
      console.error("Error sending message:", error);
      return;
    }

    // Push message locally so it appears instantly
    setMessages((prev) => [...prev, data]);
    setNewMessage("");
  };

  // --- Invites actions ---
  const sendInvite = async () => {
    if (!usernameInput) return;

    const { data: recipient, error: userError } = await supabase
      .from("profiles")
      .select("id")
      .eq("username", usernameInput)
      .single();

    if (userError || !recipient) {
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
      console.error("Error sending invite:", error);
      alert("Error sending invite.");
    } else {
      alert(`Invite sent to ${usernameInput}!`);
      setUsernameInput("");
    }
  };

  const acceptInvite = async (inviteId, senderId) => {
    await supabase.from("invites").update({ status: "accepted" }).eq("id", inviteId);
    await supabase.from("chats").insert([{ participants: [session.user.id, senderId] }]);
    fetchChats();
    fetchInvites();
  };

  const denyInvite = async (inviteId) => {
    await supabase.from("invites").update({ status: "denied" }).eq("id", inviteId);
    fetchInvites();
  };

  // --- Auth screen ---
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

  // --- Chat screen ---
  if (activeChat) {
    const otherUser = activeChat.participantsInfo.find((p) => p.id !== session.user.id);

    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <div className="w-[420px] h-[600px] p-4 bg-gray-900 rounded-2xl shadow-lg border border-gray-800 flex flex-col">
          <div className="flex items-center mb-4">
            <button onClick={() => setActiveChat(null)} className="mr-2 text-gray-400">
              ←
            </button>
            <h2 className="text-lg font-bold">{otherUser?.username || "Unknown"}</h2>
          </div>

          <div className="flex-1 overflow-y-auto space-y-2">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`p-2 rounded-lg max-w-[70%] ${
                  msg.sender_id === session.user.id ? "bg-gray-700 ml-auto" : "bg-gray-800"
                }`}
              >
                {msg.text}
              </div>
            ))}
          </div>

          <div className="flex items-center mt-2">
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 p-2 bg-gray-800 rounded-lg mr-2 text-white"
            />
            <button onClick={sendMessage} className="px-3 py-2 bg-gray-700 rounded-lg">
              Send
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main app (chat list) ---
  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <div className="w-[420px] min-h-[400px] p-4 bg-gray-900 rounded-2xl shadow-lg border border-gray-800 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold">Vaulted</h1>
          <button className="text-xl font-bold" onClick={() => setShowModal(true)}>
            +
          </button>
        </div>

        {/* Chat List */}
        <div className="flex-1 space-y-2 overflow-y-auto">
          {chats.length === 0 && (
            <p className="text-gray-500 text-sm text-center mt-20">
              No chats yet. Add a contact to start.
            </p>
          )}
          {chats.map((chat) => {
            const otherUser = chat.participantsInfo.find((p) => p.id !== session.user.id);
            return (
              <div
                key={chat.id}
                onClick={() => openChat(chat)}
                className="p-3 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer"
              >
                {otherUser?.username || "Unknown"}
              </div>
            );
          })}
        </div>

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 flex items-center justify-center bg-black/70">
            <div className="w-[380px] p-6 bg-gray-900 rounded-2xl shadow-lg border border-gray-700">
              <h2 className="text-md font-semibold mb-2">Add Contact</h2>
              <input
                type="text"
                placeholder="Enter username..."
                value={usernameInput}
                onChange={(e) => setUsernameInput(e.target.value)}
                className="w-full p-2 rounded bg-gray-800 border border-gray-600 mb-2 text-white"
              />
              <button
                onClick={sendInvite}
                className="w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                Add
              </button>

              <h3 className="mt-4 text-sm font-semibold">Pending Invites</h3>
              <div className="space-y-2 mt-2">
                {invites.length === 0 && (
                  <p className="text-gray-400 text-sm">No invites</p>
                )}
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex justify-between items-center p-2 bg-gray-800 rounded-lg"
                  >
                    <span>{invite.senderName}</span>
                    <div className="space-x-2">
                      <button
                        onClick={() => acceptInvite(invite.id, invite.sender_id)}
                        className="px-2 py-1 bg-gray-600 rounded text-sm"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => denyInvite(invite.id)}
                        className="px-2 py-1 bg-gray-600 rounded text-sm"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowModal(false)}
                className="mt-4 w-full py-2 bg-gray-700 rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
