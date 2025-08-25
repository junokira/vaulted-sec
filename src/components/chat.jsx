import React, { useEffect, useState, useRef } from "react";
import supabase from "./supabaseClient";
import { MoreVertical } from "lucide-react";

export default function Chat({ chat, session, theme, onBack, onOpenProfile }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [chatUsers, setChatUsers] = useState([]);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!chat) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("id, content, sender_id, created_at")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true });
      setMessages(data || []);
    };

    const fetchChatUsers = async () => {
      const { data } = await supabase
        .from("chat_participants")
        .select("user_id, profiles(username, avatar_url)")
        .eq("chat_id", chat.id);

      setChatUsers(data?.map((p) => p.profiles) || []);
    };

    fetchMessages();
    fetchChatUsers();

    const channel = supabase
      .channel(`chat-${chat.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chat.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chat]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    await supabase.from("messages").insert([
      {
        chat_id: chat.id,
        sender_id: session.user.id,
        content: input.trim(),
      },
    ]);
    setInput("");
  };

  const otherUser = chatUsers.find((u) => u.id !== session.user.id);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <button onClick={onBack} className="text-sm text-gray-400">← Back</button>
        <div className="flex items-center gap-2">
          <img
            src={otherUser?.avatar_url || "/default-avatar.png"}
            alt="avatar"
            className="w-8 h-8 rounded-full cursor-pointer"
            onClick={() => onOpenProfile(otherUser)}
          />
          <span className="font-semibold">{otherUser?.username || "Unknown"}</span>
        </div>
        <button onClick={() => onOpenProfile(otherUser)}>
          <MoreVertical size={20} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {messages.map((msg) => {
          const isMe = msg.sender_id === session.user.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`px-4 py-2 rounded-lg max-w-xs ${
                  isMe
                    ? theme === "blue"
                      ? "bg-blue-600 text-white"
                      : "bg-green-600 text-white"
                    : "bg-gray-700 text-gray-100"
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
      <div className="flex items-center p-3 border-t border-gray-700">
        <input
          type="text"
          className="flex-1 px-3 py-2 bg-gray-800 rounded text-white outline-none"
          placeholder="Message..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()}
        />
        <button
          onClick={sendMessage}
          className={`ml-2 px-4 py-2 rounded ${
            theme === "blue"
              ? "bg-blue-600 hover:bg-blue-500"
              : "bg-green-600 hover:bg-green-500"
          }`}
        >
          Send
        </button>
      </div>
    </div>
  );
}
