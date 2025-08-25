import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import { MoreVertical } from "lucide-react";

const Chat = ({ user }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  useEffect(() => {
    fetchMessages();

    const channel = supabase
      .channel(`chat:${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  async function fetchMessages() {
    let { data } = await supabase
      .from("messages")
      .select("*")
      .eq("chat_id", id)
      .order("created_at", { ascending: true });
    setMessages(data || []);
  }

  async function sendMessage() {
    if (!text) return;
    await supabase.from("messages").insert([
      { chat_id: id, sender_id: user.id, content: text },
    ]);
    setText("");
  }

  async function handleDeleteChat() {
    const confirmDelete = window.confirm("Are you sure you want to delete this chat?");
    if (!confirmDelete) return;

    // Delete messages first
    await supabase.from("messages").delete().eq("chat_id", id);

    // Delete chat
    await supabase.from("chats").delete().eq("id", id);

    navigate("/"); // back to contacts
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      {/* Header */}
      <div className="p-3 border-b border-gray-700 flex justify-between items-center relative">
        <button onClick={() => navigate("/")}>← Back</button>
        <h2>Chat {id}</h2>
        <button onClick={() => setShowMenu((prev) => !prev)}>
          <MoreVertical className="w-5 h-5" />
        </button>

        {showMenu && (
          <div className="absolute right-2 top-12 bg-gray-800 rounded shadow-md">
            <button
              onClick={handleDeleteChat}
              className="block px-4 py-2 w-full text-left hover:bg-red-600"
            >
              Delete Chat
            </button>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`p-2 rounded-lg max-w-xs ${
              msg.sender_id === user.id
                ? "ml-auto bg-blue-600"
                : "mr-auto bg-gray-700"
            }`}
          >
            {msg.content}
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="p-3 border-t border-gray-700 flex space-x-2">
        <input
          className="flex-1 p-2 bg-gray-800 rounded"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message..."
        />
        <button onClick={sendMessage} className="bg-blue-600 px-4 rounded">
          Send
        </button>
      </div>
    </div>
  );
};

export default Chat;
