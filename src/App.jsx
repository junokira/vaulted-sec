import React, { useState, useEffect } from 'react';
import { Plus, ArrowLeft, Send } from 'lucide-react';
import { createClient } from '@supabase/supabase-js';

// --- Supabase Setup ---
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [invites, setInvites] = useState([]);

  // --- Auth ---
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setUser(data.session.user);
        setIsLoggedIn(true);
        loadChats();
        loadInvites();
      }
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        setUser(session.user);
        setIsLoggedIn(true);
        loadChats();
        loadInvites();
      } else {
        setUser(null);
        setIsLoggedIn(false);
      }
    });

    return () => listener?.subscription.unsubscribe();
  }, []);

  // --- Load Chats ---
  async function loadChats() {
    if (!user) return;
    const { data, error } = await supabase
      .from('chats')
      .select('*')
      .contains('participants', [user.id]);
    if (!error) setChats(data || []);
  }

  // --- Load Invites ---
  async function loadInvites() {
    if (!user) return;
    const { data, error } = await supabase
      .from('invites')
      .select(`id, sender_id, recipient_id, status, sender:profiles!invites_sender_id_fkey(username)`) // join sender username
      .eq('recipient_id', user.id)
      .eq('status', 'pending');

    if (!error) setInvites(data || []);
  }

  // --- Accept/Deny Invite ---
  async function handleInviteAction(inviteId, action) {
    const { error } = await supabase
      .from('invites')
      .update({ status: action })
      .eq('id', inviteId);

    if (!error) {
      loadInvites();
      loadChats();
    }
  }

  // --- Messages ---
  useEffect(() => {
    if (!activeChat) return;
    async function fetchMessages() {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChat.id)
        .order('created_at', { ascending: true });
      setMessages(data || []);
    }
    fetchMessages();
  }, [activeChat]);

  async function handleSendMessage(text) {
    if (!text.trim()) return;
    await supabase.from('messages').insert({
      chat_id: activeChat.id,
      sender_id: user.id,
      text,
    });
  }

  // --- Add Contact ---
  async function handleAddContact(username) {
    const { data: contact } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', username)
      .single();

    if (!contact) {
      alert('User not found.');
      return;
    }

    const { error } = await supabase.from('invites').insert({
      sender_id: user.id,
      recipient_id: contact.id,
      status: 'pending',
    });

    if (error) {
      alert('Error sending invite: ' + error.message);
    } else {
      alert('Invite sent to ' + username);
      loadInvites();
    }
  }

  const renderContent = () => {
    if (!isLoggedIn) return <AuthScreen onLogin={handleLogin} />;

    if (showAddContact) {
      return (
        <AddContactOverlay onAdd={handleAddContact} onClose={() => setShowAddContact(false)} />
      );
    }

    if (!activeChat) {
      return (
        <div>
          <ChatListHeader onAddContact={() => setShowAddContact(true)} />
          <div className="p-4 space-y-2">
            {chats.map((chat) => (
              <ChatListItem key={chat.id} chat={chat} onClick={() => setActiveChat(chat)} />
            ))}

            {invites.length > 0 && (
              <div className="mt-4 space-y-2">
                <h2 className="text-gray-300 text-sm">Invites</h2>
                {invites.map((invite) => (
                  <div
                    key={invite.id}
                    className="flex items-center justify-between p-3 rounded-xl bg-gray-800"
                  >
                    <span>{invite.sender?.username || 'Unknown'}</span>
                    <div className="space-x-2">
                      <button
                        className="px-2 py-1 bg-gray-600 rounded"
                        onClick={() => handleInviteAction(invite.id, 'accepted')}
                      >
                        Accept
                      </button>
                      <button
                        className="px-2 py-1 bg-gray-700 rounded"
                        onClick={() => handleInviteAction(invite.id, 'denied')}
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="flex flex-col h-full">
        <ChatViewHeader chat={activeChat} onBack={() => setActiveChat(null)} />
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
          {messages.map((msg) => (
            <Message key={msg.id} msg={msg} userId={user.id} />
          ))}
        </div>
        <ChatInput onSend={handleSendMessage} />
      </div>
    );
  };

  return (
    <div className="bg-black text-gray-400 min-h-screen flex items-center justify-center font-sans p-4 antialiased">
      <div className="w-full max-w-lg mx-auto bg-gray-900 rounded-3xl overflow-hidden shadow-2xl ring-2 ring-gray-600 min-h-[500px]">
        {renderContent()}
      </div>
    </div>
  );
}

// --- Components ---
const ChatListHeader = ({ onAddContact }) => (
  <div className="bg-black/80 p-4 flex items-center justify-between border-b border-gray-600">
    <h1 className="text-xl font-bold">Vaulted</h1>
    <Plus className="w-5 h-5 cursor-pointer" onClick={onAddContact} />
  </div>
);

const ChatListItem = ({ chat, onClick }) => (
  <div
    onClick={onClick}
    className="flex items-center space-x-4 p-4 rounded-xl cursor-pointer hover:bg-gray-800"
  >
    <div className="w-12 h-12 rounded-full bg-gray-600 flex items-center justify-center">
      <span className="font-bold text-sm text-black">{chat.name?.[0]}</span>
    </div>
    <div className="flex-1">
      <h2 className="text-gray-200 text-md font-semibold">{chat.name}</h2>
    </div>
  </div>
);

const ChatViewHeader = ({ chat, onBack }) => (
  <div className="bg-black/80 p-4 flex items-center border-b border-gray-600">
    <ArrowLeft className="w-5 h-5 cursor-pointer" onClick={onBack} />
    <h2 className="ml-4 text-md font-semibold">{chat.name}</h2>
  </div>
);

const Message = ({ msg, userId }) => {
  const isMine = msg.sender_id === userId;
  return (
    <div
      className={`p-3 rounded-2xl max-w-[75%] ${
        isMine ? 'bg-gray-700 self-end' : 'bg-gray-800 self-start'
      }`}
    >
      <p>{msg.text}</p>
    </div>
  );
};

const ChatInput = ({ onSend }) => {
  const [text, setText] = useState('');
  return (
    <div className="bg-black/80 p-4 flex items-center space-x-3 border-t border-gray-600">
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSend(text) && setText('')}
        className="flex-1 p-2 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        placeholder="Message..."
      />
      <Send className="w-5 h-5 cursor-pointer" onClick={() => { onSend(text); setText(''); }} />
    </div>
  );
};

const AuthScreen = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    await onLogin(email);
    setLoading(false);
  }

  return (
    <form onSubmit={handleSubmit} className="p-8 flex flex-col space-y-4 text-center">
      <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center mx-auto">
        <span className="font-bold text-lg text-black">V</span>
      </div>
      <h2 className="text-xl font-bold">Welcome to Vaulted</h2>
      <p className="text-sm text-gray-500">Enter your email to get a magic link login.</p>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        placeholder="you@email.com"
        required
      />
      <button
        type="submit"
        disabled={loading}
        className="p-3 bg-gray-600 text-black rounded-xl disabled:opacity-50"
      >
        {loading ? 'Sending...' : 'Send Magic Link'}
      </button>
    </form>
  );
};

const AddContactOverlay = ({ onAdd, onClose }) => {
  const [username, setUsername] = useState('');
  return (
    <div className="p-8 flex flex-col space-y-4">
      <h2 className="text-md font-semibold">Add Contact</h2>
      <input
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className="p-3 bg-gray-800/50 rounded-xl text-sm text-gray-200"
        placeholder="username"
      />
      <button
        onClick={() => onAdd(username)}
        className="p-3 bg-gray-600 text-black rounded-xl"
      >
        Add
      </button>
      <button onClick={onClose} className="text-gray-400">
        Cancel
      </button>
    </div>
  );
};
