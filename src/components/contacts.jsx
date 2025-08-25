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
      setUsername
