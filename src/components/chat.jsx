// src/components/chat.jsx
import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

/**
 * chat.jsx
 * - renders messages left / right (sender vs me)
 * - simplified: pulls messages from "messages" table
 */

export default function Chat({ session }) {
  const { chatId } = useParams();
  const nav = useNavigate();
  const [messages, setMessages] = useState([]);
  const inputRef = useRef();

  useEffect(() => {
    if (!chatId) return;
    let isMounted = true;
    (async () => {
      const { data, error } = await supabase
        .from("messages")
        .select("id,chat_id,body,sender_id,created_at")
        .eq("chat_id", chatId)
        .order("created_at", { ascending: true })
        .limit(200);

      if (error) {
        console.error("fetch messages", error);
        return;
      }
      if (isMounted) setMessages(data || []);
    })();

    // realtime subscription to new messages
    const sub = supabase
      .channel(`messages:chat=${chatId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `chat_id=eq.${chatId}` },
        (payload) => {
          setMessages((m) => [...m, payload.new]);
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      sub.unsubscribe();
    };
  }, [chatId]);

  async function sendMessage(e) {
    e?.preventDefault();
    const text = inputRef.current.value.trim();
    if (!text) return;
    if (!session?.user) {
      alert("You must be signed in to send messages.");
      return;
    }
    const { error } = await supabase.from("messages").insert({
      chat_id: chatId,
      body: text,
      sender_id: session.user.id,
    });
    if (error) {
      alert("Send failed: " + error.message);
    } else {
      inputRef.current.value = "";
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <button onClick={() => nav(-1)} style={{ marginBottom: 12 }}>← Back</button>
      <div style={{ maxWidth: 900 }}>
        <div style={{ minHeight: 400, display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.map((m) => {
            const mine = session?.user?.id === m.sender_id;
            return (
              <div key={m.id} style={{
                display: "flex",
                justifyContent: mine ? "flex-end" : "flex-start",
              }}>
                <div style={{
                  background: mine ? "#2563eb" : "#1f2937",
                  color: "white",
                  padding: "10px 14px",
                  borderRadius: 16,
                  maxWidth: "70%"
                }}>
                  {m.body}
                </div>
              </div>
            );
          })}
        </div>

        <form onSubmit={sendMessage} style={{ display: "flex", marginTop: 12, gap: 8 }}>
          <input ref={inputRef} placeholder="Message..." style={{ flex: 1, padding: 12, borderRadius: 8 }} />
          <button type="submit" style={{ padding: "10px 14px", borderRadius: 8 }}>Send</button>
        </form>
      </div>
    </div>
  );
}
