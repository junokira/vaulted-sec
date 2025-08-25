import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

export default function Contacts({ session }) {
  const [contacts, setContacts] = useState([]);

  useEffect(() => {
    const loadContacts = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, avatar_url')
        .neq('id', session.user.id); // all except me

      if (!error) setContacts(data);
    };

    loadContacts();
  }, [session]);

  return (
    <div className="p-6 text-white">
      <h2 className="text-xl font-bold mb-4">Contacts</h2>
      <ul className="space-y-3">
        {contacts.map((c) => (
          <li key={c.id} className="flex items-center space-x-3">
            <img
              src={c.avatar_url || 'https://placehold.co/50'}
              alt={c.username}
              className="w-10 h-10 rounded-full"
            />
            <span>{c.username || c.id}</span>
            <Link
              to="/chat"
              className="ml-auto bg-blue-600 px-2 py-1 rounded text-sm"
            >
              Message
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
