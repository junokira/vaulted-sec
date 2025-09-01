
// Profile.js
// This is the main component for your profile settings page.

import { supabase } from './supabaseClient'; // Make sure this path is correct!
import React, { useState, useEffect } from 'react'; // Example using React hooks

const Profile = () => {
  // State variables to hold the form data
  const [loading, setLoading] = useState(true);
  const [username, setUsername] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [avatarUrl, setAvatarUrl] = useState(null);

  useEffect(() => {
    // This function runs when the component loads
    getProfile();
  }, []);

  async function getProfile() {
    try {
      setLoading(true);
      const user = supabase.auth.user();

      // Fetch the user's profile from the 'profiles' table
      let { data, error, status } = await supabase
        .from('profiles')
        .select(`username, full_name, avatar_url`)
        .eq('id', user.id)
        .single();

      if (error && status !== 406) {
        throw error;
      }

      // If data is found, set the state variables to the profile values
      if (data) {
        setUsername(data.username);
        setFullName(data.full_name);
        setAvatarUrl(data.avatar_url);
      }
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function updateProfile(e) {
    e.preventDefault();

    try {
      setLoading(true);
      const user = supabase.auth.user();

      const updates = {
        id: user.id,
        username,
        full_name: fullName,
        avatar_url: avatarUrl,
        updated_at: new Date(),
      };

      // Use upsert to update the row. The RLS policy allows this!
      let { error } = await supabase.from('profiles').upsert(updates);

      if (error) {
        throw error;
      }

      alert('Profile updated successfully!');
    } catch (error) {
      alert(error.message);
    } finally {
      setLoading(false);
    }
  }

  // --- JSX (HTML-like) to render the form ---
  return (
    <div className="form-widget">
      <h2>Profile Settings</h2>
      <form onSubmit={updateProfile}>
        <div>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username || ''}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="fullName">Full Name</label>
          <input
            id="fullName"
            type="text"
            value={fullName || ''}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="avatarUrl">Avatar URL</label>
          <input
            id="avatarUrl"
            type="text"
            value={avatarUrl || ''}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
        </div>

        <div>
          <button className="button block primary" disabled={loading}>
            {loading ? 'Updating ...' : 'Update Profile'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Profile;
