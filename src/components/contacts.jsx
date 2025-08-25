import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserPlus } from "lucide-react";
import supabase from "../supabaseClient";

const Contacts = ({ user }) => {
  const [contacts, setContacts] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchContacts();
  }, []);

  async function fetchContacts() {
    let { data } = await supabase.from("profiles").select("*");
    setContacts(data || []);
  }

  return (
    <div className="p-4 text-white bg-black h-screen">
      <h2 className="text-lg font-bold mb-4">Contacts</h2>
      <ul>
        {contacts.map((contact) => (
          <li
            key={contact.id}
            onClick={() => navigate(`/chat/${contact.id}`)}
            className="flex items-center p-2 hover:bg-gray-800 cursor-pointer rounded"
          >
            <div className="w-10 h-10 rounded-full bg-gray-600 flex items-center justify-center mr-3">
              {contact.avatar ? (
                <img src={contact.avatar} alt={contact.username} className="w-10 h-10 rounded-full" />
              ) : (
                <UserPlus className="w-5 h-5 text-white" />
              )}
            </div>
            <span>{contact.username}</span>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default Contacts;
