// src/components/contacts.jsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import { MoreVertical } from "lucide-react";

/*
  contacts.jsx
  - shows list of chats / contacts
  - click the name bar to view profile (like WhatsApp)
  - 3-dots opens a small menu with "Delete chat"
*/

export default function Contacts({ session }) {
  const [contacts, setContacts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    // demo: fetch simple "chats" table; replace with your schema
    async function fetchContacts() {
      if (!session) return;
      const { data, error } = await supabase
        .from("chats")
        .select("id,name,last_message,participants")
        .limit(50);
      if (error) {
        console.error("fetch contacts error", error);
        return;
      }
      setContacts(data || []);
    }
    fetchContacts();
  }, [session]);

  async function handleDelete(chatId) {
    if (!confirm("Delete this chat? This cannot be undone.")) return;
    // delete chat row (requires server policies)
    const { error } = await supabase.from("chats").delete().eq("id", chatId);
    if (error) {
      alert("Failed to delete chat: " + error.message);
    } else {
      setContacts((c) => c.filter((x) => x.id !== chatId));
    }
  }

  function openProfileFor(contact) {
    // navigate to profile view for this contact
    navigate("/profile", { state: { userId: contact.owner ?? contact.id } });
  }

  function openChat(chat) {
    navigate(`/chat/${chat.id}`);
  }

  return (
    <div className="contacts-list" style={{ padding: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <h2>Chats</h2>
        <button onClick={() => navigate("/settings")}>+</button>
      </div>

      {contacts.length === 0 && <div>No chats yet.</div>}

      {contacts.map((c) => (
        <div key={c.id} className="contact-item" style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          borderRadius: 10,
          marginBottom: 10,
          background: "#0f1720",
          cursor: "pointer"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }} onClick={() => openChat(c)}>
            <div style={{
              width: 44, height: 44, borderRadius: 22,
              background: "#2a2f36", display: "flex", alignItems: "center", justifyContent: "center",
              color: "#fff", fontWeight: 700
            }}>{(c.name || "U").slice(0,1).toUpperCase()}</div>
            <div onClick={(e)=>{ e.stopPropagation(); openProfileFor(c); }} style={{flex:1}}>
              <div style={{ fontWeight: 700 }}>{c.name || "Unknown"}</div>
              <div style={{ fontSize: 13, color: "#9ca3af" }}>{c.last_message || "No messages yet"}</div>
            </div>
          </div>

          <div style={{ marginLeft: 12 }}>
            <button onClick={(e) => { e.stopPropagation(); if (confirm("Delete this chat?")) handleDelete(c.id); }}>
              <MoreVertical />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
