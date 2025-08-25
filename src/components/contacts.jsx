import React, { useEffect, useState } from "react";
import supabase from "./supabaseClient";

export default function Contacts({ session, onSelectChat }) {
  const [chats, setChats] = useState([]);

  useEffect(() => {
    if (!session?.user) return;

    const fetchChats = async () => {
      const { data, error } = await supabase
        .from("chat_participants")
        .select("chat_id, chats(id, participants:user_id(profiles(username, avatar_url)))")
        .eq("user_id", session.user.id);

      if (error) {
        console.error(error);
        return;
      }

      // Format chats properly
      const formatted = data.map((cp) => {
        const chat = cp.chats;
        const others = chat.participants.filter(
          (p) => p.profiles && p.profiles.id !== session.user.id
        );
        return {
          id: chat.id,
          participants: others.map((p) => p.profiles),
        };
      });

      setChats(formatted);
    };

    fetchChats();
  }, [session]);

  return (
    <div className="p-4 space-y-3">
      {chats.length === 0 && (
        <p className="text-gray-400">No chats yet. Start a new one!</p>
      )}
      {chats.map((chat) => {
        const otherUsers = chat.participants;
        const isGroup = otherUsers.length > 1;
        const displayName = isGroup
          ? otherUsers.map((u) => u.username).join(", ")
          : otherUsers[0]?.username || "Unknown";
        const avatar = isGroup
          ? "/group-avatar.png"
          : otherUsers[0]?.avatar_url || "/default-avatar.png";

        return (
          <div
            key={chat.id}
            onClick={() => onSelectChat(chat)}
            className="flex items-center gap-3 p-3 rounded-lg cursor-pointer hover:bg-gray-800"
          >
            <img
              src={avatar}
              alt="avatar"
              className="w-10 h-10 rounded-full"
            />
            <div>
              <p className="font-semibold">{displayName}</p>
              <p className="text-xs text-gray-400">
                {isGroup ? `${otherUsers.length} members` : "Chat"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
