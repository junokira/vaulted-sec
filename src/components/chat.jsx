import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { Link } from 'react-router-dom';

export default function Chat({ session }) {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');

  useEffect(() => {
    // Load messages
    const loadMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('id, content, created_at, user_id')
        .order('created_at', { ascending: true });
      if (!error) setMessages(data);
    };

    loadMessages();

    // Subscribe to new messages
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    const { error } = await supabase.from('messages').insert([
      { content: newMessage, user_id: session.user.id }
    ]);

    if (error) console.error(error);
    setNewMessage('');
  };

  return (
    <div className="flex flex-col h-screen bg-gray-900 text-white">
      <header className="p-4 bg-gray-800 flex justify-between items-center">
        <h1 className="text-xl font-bold">Vaulted Chat</h1>
        <div className="space-x-4">
          <Link to="/profile" className="hover:underline">Profile</Link>
          <Link to="/contacts" className="hover:underline">Contacts</Link>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg) => (
          <div key={msg.id} className={`p-2 rounded ${msg.user_id === session.user.id ? 'bg-blue-600 self-end' : 'bg-gray-700'}`}>
            {msg.content}
          </div>
        ))}
      </main>

      <form onSubmit={sendMessage} className="p-4 bg-gray-800 flex">
        <input
          className="flex-1 p-2 rounded bg-gray-700"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
        />
        <button className="ml-2 px-4 py-2 bg-blue-600 rounded" type="submit">
          Send
        </button>
      </form>
    </div>
  );
}
