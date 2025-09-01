import { supabase } from "./App"; // Assuming App.jsx is at the root and exports supabase

async function uploadMedia(file, session, pathPrefix = 'chat_media') {
  if (!file || !session?.user) throw new Error('No file or user.');
  const ext = file.name.split('.').pop();
  const name = `${session.user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const { data, error } = await supabase.storage.from('chat_media').upload(name, file, { cacheControl: '3600', upsert: false });
  if (error) throw error;
  const { publicURL } = supabase.storage.from('chat_media').getPublicUrl(name);
  return publicURL;
}

export { uploadMedia };
