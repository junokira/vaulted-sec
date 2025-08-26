import React, { useEffect, useState } from "react";
import { supabase } from "./supabaseClient";

export default function App() {
  const [session, setSession] = useState(null);
  const [chats, setChats] = useState([]);
  const [invites, setInvites] = useState([]);
  const [newContact, setNewContact] = useState("");
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
  }, []);

  useEffect(() => {
    if (session) {
      fetchChats();
      fetchInvites();

      // Realtime updates
      const channel = supabase
        .channel("invites")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "invites" },
          () => {
            fetchInvites();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [session]);

  const fetchChats = async () => {
    const { data, error } = await supabase
      .from("chats")
      .select("id, participants");

    if (error) console.error(error);
    else setChats(data || []);
  };

  const fetchInvites = async () => {
    if (!session?.user) return;

    const { data, error } = await supabase
      .from("invites")
      .select(
        `
        id,
        status,
        sender:sender_id ( id, username ),
        recipient:recipient_id ( id, username )
      `
      )
      .eq("recipient_id", session.user.id)
      .eq("status", "pending");

    if (error) console.error("Error fetching invites:", error);
    else setInvites(data || []);
  };

  const sendInvite = async () => {
    if (!newContact || !session?.user) return;

    // Look up user by username in profiles
    const { data: recipient, error: profileError } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", newContact)
      .single();

    if (profileError || !recipient) {
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
      alert(`Invite sent to ${recipient.username}!`);
      setNewContact("");
    }
  };

  const acceptInvite = async (inviteId) => {
    const { error } = await supabase
      .from("invites")
      .update({ status: "accepted" })
      .eq("id", inviteId);

    if (error) {
      console.error("Error accepting invite:", error);
    } else {
      fetchInvites();
      fetchChats();
    }
  };

  const denyInvite = async (inviteId) => {
    const { error } = await supabase
      .from("invites")
      .update({ status: "denied" })
      .eq("id", inviteId);

    if (error) {
      console.error("Error denying invite:", error);
    } else {
      fetchInvites();
    }
  };

  return (
    <div className="flex justify-center items-center h-screen bg-black text-white">
      <div className="bg-gray-900 rounded-2xl shadow-lg p-4 w-96">
        <div className="flex justify-between items-center border-b border-gray-700 pb-2 mb-2">
          <h1 className="text-lg font-bold">Vaulted</h1>
          <button onClick={() => setShowModal(true)}>+</button>
        </div>

        {/* Chats list */}
        {chats.length === 0 ? (
          <p className="text-gray-500">No chats</p>
        ) : (
          chats.map((chat) => (
            <div
              key={chat.id}
              className="p-3 mb-2 bg-gray-800 rounded-xl cursor-pointer hover:bg-gray-700"
            >
              Chat {chat.id}
            </div>
          ))
        )}

        {/* Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center">
            <div className="bg-gray-900 p-6 rounded-xl w-96">
              <h2 className="font-bold text-lg mb-4">Add Contact</h2>
              <input
                type="text"
                placeholder="Enter username..."
                value={newContact}
                onChange={(e) => setNewContact(e.target.value)}
                className="w-full p-2 rounded mb-2 bg-gray-800 text-white"
              />
              <button
                onClick={sendInvite}
                className="w-full bg-blue-600 hover:bg-blue-700 p-2 rounded mb-4"
              >
                Add
              </button>

              <h3 className="font-semibold mb-2">Invites</h3>
              {invites.length === 0 ? (
                <p className="text-gray-500">No invites</p>
              ) : (
                invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex justify-between items-center bg-gray-800 p-2 rounded mb-2"
                  >
                    <span>From {invite.sender?.username || "Unknown"}</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => acceptInvite(invite.id)}
                        className="bg-green-600 px-2 py-1 rounded"
                      >
                        Accept
                      </button>
                      <button
                        onClick={() => denyInvite(invite.id)}
                        className="bg-red-600 px-2 py-1 rounded"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))
              )}

              <button
                onClick={() => setShowModal(false)}
                className="w-full mt-4 bg-gray-700 p-2 rounded"
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
