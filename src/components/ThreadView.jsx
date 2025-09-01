import React, { useEffect, useState } from 'react';
import { supabase } from './App';
import { MessageBubble } from './App';

const ThreadView = ({ parentMessage, onClose, session, onReplySent }) => {
  const [replies, setReplies] = useState([]);
  const [replyText, setReplyText] = useState("");

  const fetchReplies = async () => {
    const { data, error } = await supabase
      .from("messages")
      .select("id, chat_id, sender_id, text, content, type, created_at, profiles:sender_id(id, username, avatar_url)")
      .eq("reply_to", parentMessage.id)
      .order("created_at", { ascending: true });
    if (!error) setReplies(data || []);
  };

  const sendReply = async () => {
    if (!replyText.trim()) return;
    const { data, error } = await supabase
      .from("messages")
      .insert({
        chat_id: parentMessage.chat_id,
        sender_id: session.user.id,
        text: replyText,
        reply_to: parentMessage.id,
      })
      .select().single();
    if (!error) {
      setReplyText("");
      await fetchReplies();
      if (onReplySent) onReplySent(data);
    }
  };

  useEffect(() => {
    fetchReplies();
    const channel = supabase.channel(`thread:${parentMessage.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `reply_to=eq.${parentMessage.id}` }, fetchReplies)
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [parentMessage.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose}></div>
      <div className="relative w-full max-w-lg mx-auto bg-gray-900 rounded-2xl p-6 border border-gray-800 flex flex-col h-[80vh]">
        <h3 className="text-md font-semibold mb-3">Thread</h3>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">Close</button>
        
        <div className="border-b border-gray-700 pb-4 mb-4">
          <MessageBubble msg={parentMessage} isSender={parentMessage.sender_id === session.user.id} />
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2">
          {replies.map(r => <MessageBubble key={r.id} msg={r} isSender={r.sender_id === session.user.id} />)}
        </div>

        <div className="mt-4 flex gap-2">
          <input
            type="text"
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendReply()}
            placeholder="Reply to thread..."
            className="flex-1 p-3 rounded-xl bg-gray-800 text-gray-200"
          />
          <button onClick={sendReply} className="px-4 py-2 bg-gray-700 rounded-lg hover:bg-gray-600">Send</button>
        </div>
      </div>
    </div>
  );
};

export { ThreadView };
