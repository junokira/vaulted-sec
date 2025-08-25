import React from "react";

const Settings = ({ user }) => {
  return (
    <div className="p-6 bg-black text-white h-screen">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>
      <p>Email: {user?.email}</p>
      <p>Username: {user?.username}</p>
      {/* Expand with avatar upload, theme, etc. */}
    </div>
  );
};

export default Settings;
