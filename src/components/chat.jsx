import React, { useEffect, useState } from "react";
import { ArrowLeft, MoreHorizontal } from "lucide-react";
import supabase from "./supabaseClient";

export default function Chat({ session, chat, onBack, onOpenProfile, onDeleteChat }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");

  // Load messages
  useEffect(() => {
    async function loadMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", chat.id)
        .order("created_at", { ascending: true });
      if (!error) setMessages(data || []);
    }
    loadMessages();

    // Realtime subscription
    const channel = supabase
      .channel("chat:" + chat.id)
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

  // Send message
  async function sendMessage(e) {
    e.preventDefault();
    if (!text.trim()) return;

    await supabase.from("messages").insert({
      chat_id: chat.id,
      sender_id: session.user.id,
      text,
    });

    setText("");
  }

  return (
    <div className="flex flex-col h-full">
      {/* Chat Header */}
      <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-700">
        <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onOpenProfile(chat)}>
          <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
          <div className="flex items-center space-x-3 ml-3">
            <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center">
              <span className="font-bold text-sm text-black">{chat.name[0]}</span>
            </div>
            <h2 className="text-md font-semibold">{chat.name}</h2>
          </div>
        </div>
        <MoreHorizontal
          className="w-5 h-5 cursor-pointer"
          onClick={() => {
            if (window.confirm("Delete this chat?")) onDeleteChat(chat.id);
          }}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {messages.length === 0 && (
          <p className="text-center text-gray-500">No messages yet. Start the conversation!</p>
        )}
        {messages.map((msg) => {
          const isMine = msg.sender_id === session.user.id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`p-3 rounded-2xl max-w-[70%] ${
                  isMine ? "bg-gray-700 text-right" : "bg-gray-800 text-left"
                }`}
              >
                <p>{msg.text}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="bg-black/80 p-4 flex items-center space-x-3 border-t border-gray-700">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="flex-1 p-2 bg-gray-800/50 rounded-xl text-sm text-gray-200"
          placeholder="Message..."
        />
        <button type="submit" className="px-4 py-2 bg-gray-600 rounded-lg text-black font-semibold">
          Send
        </button>
      </form>
    </div>
  );
}
