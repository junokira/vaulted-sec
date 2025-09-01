import React from 'react';
import { supabase } from './App';

const ReactionsBar = ({ messageId, myUserId, reactions, onUpdate }) => {
  const groupedReactions = reactions?.reduce((acc, r) => {
    acc[r.emoji] = acc[r.emoji] ? acc[r.emoji] + 1 : 1;
    return acc;
  }, {}) || {};

  const myReactionEmojis = new Set(reactions?.filter(r => r.user_id === myUserId).map(r => r.emoji));

  const toggleReaction = async (emoji) => {
    if (myReactionEmojis.has(emoji)) {
      await supabase.from("message_reactions").delete().eq("message_id", messageId).eq("user_id", myUserId).eq("emoji", emoji);
    } else {
      await supabase.from("message_reactions").insert([{ message_id: messageId, user_id: myUserId, emoji }]);
    }
    // Call the parent to refresh/update state
    if (onUpdate) onUpdate();
  };

  return (
    <div className="flex gap-2 mt-2">
      {Object.entries(groupedReactions).map(([emoji, count]) => (
        <button key={emoji} onClick={() => toggleReaction(emoji)} className={`text-xs px-2 py-1 rounded-full ${myReactionEmojis.has(emoji) ? 'bg-blue-500 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
          {emoji} {count}
        </button>
      ))}
      <button onClick={() => toggleReaction('👍')} className="text-xs px-2 py-1 rounded-full bg-gray-700 hover:bg-gray-600">👍</button>
      <button onClick={() => toggleReaction('❤️')} className="text-xs px-2 py-1 rounded-full bg-gray-700 hover:bg-gray-600">❤️</button>
    </div>
  );
};

export { ReactionsBar };
