import React, { useState, useEffect } from 'react';
import {
  Search,
  Plus,
  ArrowLeft,
  Send,
  MoreHorizontal,
} from 'lucide-react';
import { supabase } from './supabaseClient';

// -------------------------
// Main App Component
// -------------------------
export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeChat, setActiveChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chats, setChats] = useState([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [usernameInput, setUsernameInput] = useState('');

  // -------------------------
  // Auth Session & Callback Handling
  // -------------------------
  useEffect(() => {
    const handleAuth = async () => {
      // Handle new magic link (supabase v2 uses ?code=)
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          console.error('Auth error:', error.message);
        } else if (data.session) {
          setUser(data.session.user);
          setIsLoggedIn(true);
          loadProfile(data.session.user.id);
          loadChats();
        }
        // clean URL
        window.history.replaceState({}, document.title, '/');
      }

      // Restore session if already logged in
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        setUser(data.session.user);
        setIsLoggedIn(true);
        loadProfile(data.session.user.id);
        loadChats();
      }

      // Listen to auth state changes
      supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          setUser(session.user);
          setIsLoggedIn(true);
          loadProfile(session.user.id);
          loadChats();
        } else {
          setUser(null);
          setIsLoggedIn(false);
        }
      });
    };

    handleAuth();
  }, []);

  // -------------------------
  // Load Profile
  // -------------------------
  async function loadProfile(userId) {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();
    if (!error && data) setProfile(data);
  }

  // -------------------------
  // Load Chats
  // -------------------------
  async function loadChats() {
    const { data, error } = await supabase.from('chats').select('*');
    if (!error) setChats(data);
  }

  // -------------------------
  // Messages for Active Chat
  // -------------------------
  useEffect(() => {
    if (!activeChat) return;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('chat_id', activeChat.id)
        .order('created_at', { ascending: true });
      if (!error) setMessages(data);
    }
    fetchMessages();

    // realtime
    const channel = supabase
      .channel('room:' + activeChat.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${activeChat.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat]);

  // -------------------------
  // Send Message
  // -------------------------
  async function handleSendMessage(text) {
    if (!text.trim()) return;
    await supabase.from('messages').insert({
      chat_id: activeChat.id,
      sender_id: user.id,
      text,
    });
  }

  // -------------------------
  // Add Contact (Invite)
  // -------------------------
  async function handleAddContact(username) {
    if (!username.trim()) return;

    const { data: contact } = await supabase
      .from('profiles')
      .select('id, username')
      .eq('username', username)
      .single();

    if (contact) {
      // Instead of direct chat, insert an invite
      await supabase.from('invites').insert({
        from_id: user.id,
        to_id: contact.id,
      });
      alert('Invite sent to ' + username);
    }
    setShowAddContact(false);
  }

  // -------------------------
  // Save Username (Onboarding)
  // -------------------------
  async function saveUsername() {
    if (!usernameInput.trim()) return;
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      username: usernameInput,
    });
    if (error) {
      alert(error.message);
    } else {
      setProfile({ ...profile, username: usernameInput });
    }
  }

  // -------------------------
  // Login (Magic Link)
  // -------------------------
  async function handleLogin(email) {
    if (!email) return;

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      console.error(error);
      alert('Error sending magic link: ' + error.message);
    } else {
      alert('Check your email for a magic link ✉️');
    }
  }

  // -------------------------
  // UI Rendering
  // -------------------------
  if (!isLoggedIn) {
    return <AuthScreen onLogin={handleLogin} />;
  }

  // If logged in but no username yet
  if (profile && !profile.username) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-black text-white space-y-4">
        <h2 className="text-xl font-bold">Set your username</h2>
        <input
          className="p-2 bg-gray-800 rounded"
          value={usernameInput}
          onChange={(e) => setUsernameInput(e.target.value)}
          placeholder="Choose a username"
        />
        <button onClick={saveUsername} className="px-4 py-2 bg-blue-600 rounded">
          Save
        </button>
      </div>
    );
  }

  if (showAddContact) {
    return (
      <AddContactOverlay onAdd={handleAddContact} onClose={() => setShowAddContact(false)} />
    );
  }

  if (!activeChat) {
    return (
      <div className="bg-black text-gray-200 min-h-screen flex flex-col">
        <ChatListHeader onAddContact={() => setShowAddContact(true)} />
        <div className="p-4 space-y-2">
          {chats.map((chat) => (
            <ChatListItem key={chat.id} chat={chat} onClick={() => setActiveChat(chat)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-black text-white">
      <ChatViewHeader chat={activeChat} onBack={() => setActiveChat(null)} />
      <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
        {messages.map((msg) => (
          <Message key={msg.id} msg={msg} userId={user.id} />
        ))}
      </div>
      <ChatInput onSend={handleSendMessage} />
    </div>
  );
}

// -------------------------
// Components
// -------------------------
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
      <span className="font-bold text-sm text-black">{chat.name?.[0] || '?'}</span>
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
    <MoreHorizontal className="ml-auto w-5 h-5" />
  </div>
);

const Message = ({ msg, userId }) => {
  const isMine = msg.sender_id === userId;
  return (
    <div
      className={`p-3 rounded-2xl max-w-[75%] ${
        isMine ? 'bg-blue-600 self-end' : 'bg-gray-700 self-start'
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
      <Send
        className="w-5 h-5 cursor-pointer"
        onClick={() => {
          onSend(text);
          setText('');
        }}
      />
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
    <form
      onSubmit={handleSubmit}
      className="flex flex-col items-center justify-center h-screen bg-black text-white space-y-4"
    >
      <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center">
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
    <div className="p-8 flex flex-col space-y-4 bg-black text-white h-screen">
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
        Send Invite
      </button>
      <button onClick={onClose} className="text-gray-400">
        Cancel
      </button>
    </div>
  );
};
