import React from "react";
import { User, Settings } from "lucide-react";

const Profile = ({ user }) => {
  return (
    <div className="p-6 text-white bg-black h-screen">
      <div className="flex items-center space-x-4 mb-6">
        <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center">
          {user.avatar ? (
            <img src={user.avatar} alt={user.username} className="w-16 h-16 rounded-full" />
          ) : (
            <User className="w-8 h-8 text-white" />
          )}
        </div>
        <div>
          <h2 className="text-xl font-bold">{user.username}</h2>
          <p className="text-gray-400">{user.email}</p>
        </div>
      </div>

      <button className="flex items-center space-x-2 bg-gray-800 px-4 py-2 rounded hover:bg-gray-700">
        <Settings className="w-5 h-5" />
        <span>Account Settings</span>
      </button>
    </div>
  );
};

export default Profile;
