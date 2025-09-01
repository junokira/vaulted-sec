// CallBar.jsx (a simple placeholder)
import React from 'react';
import { Phone, Video, Minimize2 } from 'lucide-react';

const CallBar = ({ onJoinCall, onLeaveCall }) => {
  const [inCall, setInCall] = React.useState(false);

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 p-3 bg-gray-800 rounded-full shadow-lg flex gap-4">
      {!inCall ? (
        <>
          <button onClick={() => { onJoinCall(); setInCall(true); }} className="p-2 rounded-full bg-green-500 hover:bg-green-600 text-white">
            <Phone className="w-5 h-5" />
          </button>
          <button onClick={() => { onJoinCall(true); setInCall(true); }} className="p-2 rounded-full bg-blue-500 hover:bg-blue-600 text-white">
            <Video className="w-5 h-5" />
          </button>
        </>
      ) : (
        <button onClick={() => { onLeaveCall(); setInCall(false); }} className="p-2 rounded-full bg-red-500 hover:bg-red-600 text-white">
          <Minimize2 className="w-5 h-5" />
        </button>
      )}
    </div>
  );
};

export { CallBar };

// VideoGrid.jsx (simple placeholder)
import React from 'react';
import { XCircle } from 'lucide-react';

const VideoGrid = ({ onClose }) => {
  return (
    <div className="fixed inset-0 z-40 bg-black/90 flex items-center justify-center">
      <div className="relative w-full h-full p-4">
        <h2 className="text-xl text-center mb-4">Video Call</h2>
        <div className="grid grid-cols-2 gap-4 h-[calc(100%-4rem)]">
          <div className="bg-gray-800 rounded-xl flex items-center justify-center">Your Video</div>
          <div className="bg-gray-800 rounded-xl flex items-center justify-center">Other's Video</div>
        </div>
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">
          <XCircle className="w-8 h-8" />
        </button>
      </div>
    </div>
  );
};

export { VideoGrid };
