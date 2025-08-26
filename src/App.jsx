import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function App() {
  const [session, setSession] = useState(null);
  const [chats, setChats] = useState([]);
  const [invites, setInvites] = useState([]);
  const [usernameInput, setUsernameInput] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (session) {
      fetchChats();
      fetchInvites();
    }
  }, [session]);

  const fetchChats = async () => {
    const { data, error } = await supabase
      .from("chats")
      .select("id, participants, profiles ( username )")
      .contains("participants", [session.user.id]);

    if (error) console.error("Error fetching chats:", error);
    else setChats(data || []);
  };

  const fetchInvites = async () => {
    const { data, error } = await supabase
      .from("invites")
      .select("id, sender_id, recipient_id, status, profiles!invites_sender_id_fkey(username)")
      .eq("recipient_id", session.user.id)
      .eq("status", "pending");

    if (error) console.error("Error fetching invites:", error);
    else setInvites(data || []);
  };

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
      fetchInvites();
    }
  };

  const acceptInvite = async (inviteId, senderId) => {
    // 1. Mark invite accepted
    const { error: updateError } = await supabase
      .from("invites")
      .update({ status: "accepted" })
      .eq("id", inviteId);

    if (updateError) {
      console.error("Error accepting invite:", updateError);
      return;
    }

    // 2. Create chat with both participants
    const { error: chatError } = await supabase.from("chats").insert([
      {
        participants: [session.user.id, senderId],
      },
    ]);

    if (chatError) {
      console.error("Error creating chat:", chatError);
      return;
    }

    // Refresh lists
    fetchChats();
    fetchInvites();
  };

  const denyInvite = async (inviteId) => {
    const { error } = await supabase
      .from("invites")
      .update({ status: "denied" })
      .eq("id", inviteId);

    if (error) console.error("Error denying invite:", error);
    fetchInvites();
  };

  if (!session) {
    return (
      <div className="flex items-center justify-center h-screen bg-black text-white">
        <button
          onClick={() => supabase.auth.signInWithOAuth({ provider: "github" })}
          className="px-4 py-2 bg-blue-600 rounded-lg"
        >
          Sign In with GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-screen bg-black text-white">
      <div className="w-96 p-4 bg-gray-900 rounded-2xl shadow-lg border border-gray-800">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-bold">Vaulted</h1>
          <button
            className="text-xl font-bold"
            onClick={() => setShowModal(true)}
          >
            +
          </button>
        </div>

        {/* Chat List */}
        <div className="space-y-2">
          {chats.map((chat) => (
            <div
              key={chat.id}
              className="p-3 rounded-lg bg-gray-800 hover:bg-gray-700 cursor-pointer"
            >
              Chat with {chat.participants.length - 1} others
            </div>
          ))}
        </div>

        {/* Modal */}
        {showModal && (
          <div className="mt-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
            <h2 className="text-sm font-semibold mb-2">Add Contact</h2>
            <input
              type="text"
              placeholder="Enter username..."
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              className="w-full p-2 rounded bg-gray-900 border border-gray-600 mb-2 text-white"
            />
            <button
              onClick={sendInvite}
              className="w-full py-2 bg-blue-600 rounded-lg hover:bg-blue-500"
            >
              Add
            </button>

            <h3 className="mt-4 text-sm font-semibold">Invites</h3>
            <div className="space-y-2 mt-2">
              {invites.length === 0 && (
                <p className="text-gray-400 text-sm">No invites</p>
              )}
              {invites.map((invite) => (
                <div
                  key={invite.id}
                  className="flex justify-between items-center p-2 bg-gray-700 rounded-lg"
                >
                  <span>{invite.profiles?.username || "Unknown"}</span>
                  <div className="space-x-2">
                    <button
                      onClick={() => acceptInvite(invite.id, invite.sender_id)}
                      className="px-2 py-1 bg-green-600 rounded text-sm"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => denyInvite(invite.id)}
                      className="px-2 py-1 bg-red-600 rounded text-sm"
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
        )}
      </div>
    </div>
  );
}
