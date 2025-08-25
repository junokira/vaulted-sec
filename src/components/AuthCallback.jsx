import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import supabase from '../supabaseClient';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    // Supabase parses the hash itself, we just need to wait for the session
    const run = async () => {
      // Give the SDK a moment to process the URL hash
      await new Promise(r => setTimeout(r, 50));

      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        navigate('/', { replace: true });
      } else {
        navigate('/?login=failed', { replace: true });
      }
    };
    run();
  }, [navigate]);

  return null;
}
