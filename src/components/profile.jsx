import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Profile({ session }) {
  const [username, setUsername] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');

  useEffect(() => {
    const loadProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('username, avatar_url')
        .eq('id', session.user.id)
        .single();

      if (data) {
        setUsername(data.username || '');
        setAvatarUrl(data.avatar_url || '');
      }
    };

    loadProfile();
  }, [session]);

  const saveProfile = async () => {
    const { error } = await supabase.from('profiles').upsert({
      id: session.user.id,
      username,
      avatar_url: avatarUrl,
    });
    if (error) alert(error.message);
    else alert('Profile updated!');
  };

  return (
    <div className="p-6 text-white">
      <h2 className="text-xl font-bold mb-4">Edit Profile</h2>
      <input
        className="w-full p-2 mb-2 rounded bg-gray-800"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Username"
      />
      <input
        className="w-full p-2 mb-2 rounded bg-gray-800"
        value={avatarUrl}
        onChange={(e) => setAvatarUrl(e.target.value)}
        placeholder="Avatar URL"
      />
      {avatarUrl && (
        <img src={avatarUrl} alt="avatar" className="w-24 h-24 rounded-full mt-2" />
      )}
      <button
        onClick={saveProfile}
        className="mt-4 bg-blue-600 px-4 py-2 rounded"
      >
        Save
      </button>
    </div>
  );
}
