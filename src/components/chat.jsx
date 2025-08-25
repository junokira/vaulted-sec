import React, { useEffect, useState, useRef } from "react";
import supabase from "./supabaseClient";

export default function Chat({ session, chat, onBack, onOpenProfile }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [otherUser, setOtherUser] = useState(null);
  const [showMenu, setShowMenu] = useState(false);
  const bottomRef = useRef(null);

  // Fetch chat messages + other user
  useEffect(() => {
    if (!chat?.id) return;

    const fetchData = async () => {
      // Messages
      const { data: msgData } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true });
      setMessages(msgData || []);

      // Other user
      const { data: participants } = await supabase
        .from("chat_participants")
        .select("user_id, profiles(username, avatar_url)")
        .eq("chat_id", chat.id);

      if (participants) {
        const other = participants.find((p) => p.user_id !== session.user.id);
        setOtherUser(other?.profiles || null);
      }
    };

    fetchData();

    // Realtime subscription
    const channel = supabase
      .channel(`chat:${chat.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chat.id}` },
        (payload) => setMessages((prev) => [...prev, payload.new])
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chat, session.user.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    await supabase.from("messages").insert([
      {
        chat_id: chat.id,
        sender_id: session.user.id,
        content: newMessage,
      },
    ]);
    setNewMessage("");
  };

  const deleteChat = async () => {
    await supabase.from("chats").delete().eq("id", chat.id);
    onBack();
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div
        className="flex items-center justify-between p-4 bg-gray-900 border-b border-gray-800 cursor-pointer"
        onClick={() => otherUser && onOpenProfile(otherUser)}
      >
        <div className="flex items-center gap-3">
          <img
            src={otherUser?.avatar_url || "/default-avatar.png"}
            alt="avatar"
            className="w-10 h-10 rounded-full"
          />
          <p className="font-semibold">{otherUser?.username || "Unknown"}</p>
        </div>
        <div className="relative">
          <button
            className="text-xl"
            onClick={(e) => {
              e.stopPropagation();
              setShowMenu((prev) => !prev);
            }}
          >
            ⋮
          </button>
          {showMenu && (
            <div className="absolute right-0 mt-2 w-32 bg-gray-800 rounded-md shadow-lg">
              <button
                className="block w-full text-left px-4 py-2 text-red-400 hover:bg-gray-700"
                onClick={deleteChat}
              >
                Delete Chat
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => {
          const isMe = msg.sender_id === session.user.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`px-4 py-2 rounded-lg max-w-xs ${
                  isMe ? "bg-blue-600 text-white" : "bg-gray-700 text-gray-100"
                }`}
              >
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-4 flex gap-2 border-t border-gray-800">
        <input
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          className="flex-1 px-4 py-2 rounded-lg bg-gray-800 text-white focus:outline-none"
          placeholder="Message..."
        />
        <button
          onClick={sendMessage}
          className="px-4 py-2 bg-blue-600 rounded-lg text-white"
        >
          Send
        </button>
      </div>
    </div>
  );
}
