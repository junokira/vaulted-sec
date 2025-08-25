import React, { useEffect, useState } from "react";
import { Plus, Settings } from "lucide-react";
import supabase from "./supabaseClient";

export default function Contacts({ session, onSelectChat, onOpenSettings }) {
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [username, setUsername] = useState("");
  const [invites, setInvites] = useState([]);

  // Load chats
  useEffect(() => {
    async function loadChats() {
      const { data, error } = await supabase
        .from("chats")
        .select("id, name, participants")
        .contains("participants", [session.user.id]);

      if (!error && data) setChats(data);
    }
    loadChats();
  }, [session]);

  // Load invites
  useEffect(() => {
    async function loadInvites() {
      const { data, error } = await supabase
        .from("invites")
        .select("id, from_user, to_user, status")
        .eq("to_user", session.user.id);

      if (!error && data) setInvites(data);
    }
    loadInvites();
  }, [session]);

  // Add contact (send invite)
  async function handleAddContact(e) {
    e.preventDefault();
    if (!username.trim()) return;

    const { data: target } = await supabase
      .from("profiles")
      .select("id, username")
      .eq("username", username)
      .single();

    if (!target) {
      alert("User not found");
      return;
    }

    // create invite
    const { error } = await supabase.from("invites").insert({
      from_user: session.user.id,
      to_user: target.id,
      status: "pending",
    });

    if (error) {
      alert("Error sending invite: " + error.message);
    } else {
      alert("Invite sent!");
      setShowAddContact(false);
      setUsername("");
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-700">
        <h1 className="text-xl font-bold">Vaulted</h1>
        <div className="flex items-center space-x-4">
          <Settings
            className="w-5 h-5 cursor-pointer hover:text-white"
            onClick={onOpenSettings}
          />
          <Plus
            className="w-5 h-5 cursor-pointer hover:text-white"
            onClick={() => setShowAddContact(true)}
          />
        </div>
      </div>

      {/* Chat list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {chats.length === 0 && (
          <p className="text-center text-gray-500 text-sm">
            No chats yet. Add a contact to start chatting.
          </p>
        )}
        {chats.map((chat) => (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat)}
            className="flex items-center space-x-4 p-4 rounded-xl cursor-pointer hover:bg-gray-800 transition-colors"
          >
            <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
              <span className="font-bold text-sm text-black">
                {chat.name[0]}
              </span>
            </div>
            <div className="flex-1">
              <h2 className="text-gray-200 text-md font-semibold">{chat.name}</h2>
              <p className="text-xs text-gray-500">
                {chat.participants.length} participants
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Invites */}
      {invites.length > 0 && (
        <div className="bg-gray-800/50 p-4 border-t border-gray-700">
          <h3 className="text-sm font-semibold text-gray-300 mb-2">Invites</h3>
          {invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center justify-between p-2 bg-gray-900 rounded-lg mb-2"
            >
              <span className="text-gray-200">
                Invite from {invite.from_user}
              </span>
              <div className="space-x-2">
                <button
                  onClick={async () => {
                    await supabase
                      .from("invites")
                      .update({ status: "accepted" })
                      .eq("id", invite.id);
                    // create chat
                    await supabase.from("chats").insert({
                      name: "New Chat",
                      participants: [invite.from_user, session.user.id],
                    });
                  }}
                  className="text-xs bg-gray-600 px-2 py-1 rounded"
                >
                  Accept
                </button>
                <button
                  onClick={async () => {
                    await supabase
                      .from("invites")
                      .update({ status: "rejected" })
                      .eq("id", invite.id);
                  }}
                  className="text-xs bg-gray-700 px-2 py-1 rounded"
                >
                  Reject
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Contact Modal */}
      {showAddContact && (
        <div className="absolute inset-0 bg-black/90 flex items-center justify-center">
          <form
            onSubmit={handleAddContact}
            className="bg-gray-900 p-6 rounded-xl w-80 space-y-4"
          >
            <h2 className="text-lg font-bold">Add Contact</h2>
            <input
              type="text"
              placeholder="Enter username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full p-2 bg-gray-800 rounded text-sm text-gray-200"
            />
            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowAddContact(false)}
                className="px-3 py-1 bg-gray-700 rounded text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-3 py-1 bg-gray-600 rounded text-sm text-black font-semibold"
              >
                Send Invite
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
