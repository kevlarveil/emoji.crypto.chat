import { useState, useEffect, useRef } from 'react';
import { auth, db, initializeAuth } from './firebase.jsx';
import { 
  collection, addDoc, onSnapshot, query, serverTimestamp, setDoc, doc, where
} from 'firebase/firestore';

// --- ENCRYPTION LOGIC ---
const xorEncrypt = (str, key) => {
  let output = '';
  for (let i = 0; i < str.length; i++) {
    const keyChar = key.charCodeAt(i % key.length);
    const encryptedChar = str.charCodeAt(i) ^ keyChar;
    output += String.fromCharCode(encryptedChar);
  }
  const encoded = new TextEncoder().encode(output);
  return btoa(String.fromCharCode.apply(null, encoded));
};

const xorDecrypt = (base64Str, key) => {
  try {
    const binaryStr = atob(base64Str);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const decodedStr = new TextDecoder().decode(bytes);
    let output = '';
    for (let i = 0; i < decodedStr.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const decryptedChar = decodedStr.charCodeAt(i) ^ keyChar;
      output += String.fromCharCode(decryptedChar);
    }
    return output;
  } catch (e) {
    return base64Str;
  }
};

const isOnlyEmojis = (str) => {
  const emojiRegex = /(\p{Emoji_Presentation}|\p{Emoji}\uFE0F|\u200D)+/gu;
  return str.trim().length > 0 && str.replace(emojiRegex, '').trim().length === 0;
};

export default function EmojiCryptoChat() {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [roomInput, setRoomInput] = useState('');
  const [nickname, setNickname] = useState('');
  const [userId, setUserId] = useState('');
  const [userStatus, setUserStatus] = useState('online'); // online, away, offline
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isNicknameModalOpen, setIsNicknameModalOpen] = useState(false);
  const [modalInput, setModalInput] = useState('');
  const [notification, setNotification] = useState(null);
  const [loading, setLoading] = useState(true);
  const [roomUsers, setRoomUsers] = useState([]);
  const messagesEndRef = useRef(null);

  // Initialize Firebase Auth
  useEffect(() => {
    initializeAuth().then(() => {
      const unsubscribe = auth.onAuthStateChanged((user) => {
        if (user) {
          setUserId(user.uid);
          setLoading(false);
        }
      });
      return () => unsubscribe();
    });
  }, []);

  // Update user status in Firestore
  useEffect(() => {
    if (!userId || !currentRoom || !nickname) return;

    const userRef = doc(db, `rooms/${currentRoom}/users`, userId);
    setDoc(userRef, {
      userId,
      nickname,
      status: userStatus,
      lastSeen: serverTimestamp()
    }, { merge: true });
  }, [userId, currentRoom, userStatus, nickname]);

  // Listen to room users
  useEffect(() => {
    if (!currentRoom) return;

    const usersRef = collection(db, `rooms/${currentRoom}/users`);
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const users = snapshot.docs.map(doc => doc.data());
      setRoomUsers(users);
    });

    return () => unsubscribe();
  }, [currentRoom]);

  // Listen to messages in current room
  useEffect(() => {
    if (!userId || !currentRoom) return;

    const messagesRef = collection(db, `rooms/${currentRoom}/messages`);
    const q = query(messagesRef);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMessages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      fetchedMessages.sort((a, b) => {
        const tsA = a.timestamp?.toMillis() || 0;
        const tsB = b.timestamp?.toMillis() || 0;
        return tsA - tsB;
      });

      setMessages(fetchedMessages);
    });

    return () => unsubscribe();
  }, [userId, currentRoom]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const saveNickname = async () => {
    if (!modalInput.trim() || modalInput.trim().length < 2) {
      setNotification({ type: 'error', message: 'Nickname must be 2+ characters!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    setNickname(modalInput.trim());
    setIsNicknameModalOpen(false);
    setModalInput('');
    setNotification({ type: 'success', message: `Identity set to "${modalInput}"! 🚀` });
    setTimeout(() => setNotification(null), 3000);
  };

  const joinRoom = async () => {
    if (!roomInput.trim()) {
      setNotification({ type: 'error', message: 'Enter a room code!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (!nickname) {
      setNotification({ type: 'error', message: 'Set your identity first! 📛' });
      setIsNicknameModalOpen(true);
      return;
    }

    try {
      setCurrentRoom(roomInput.toUpperCase());
      setMessages([]);
      setNotification({ type: 'success', message: `Joined room: ${roomInput.toUpperCase()} 🚀` });
      setTimeout(() => setNotification(null), 3000);
    } catch (error) {
      setNotification({ type: 'error', message: 'Failed to join room' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const leaveRoom = () => {
    setCurrentRoom(null);
    setMessages([]);
    setRoomUsers([]);
    setRoomInput('');
  };

  const sendMessage = async () => {
    if (!newMessage.trim()) {
      setNotification({ type: 'error', message: 'Message cannot be empty!' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    if (!isOnlyEmojis(newMessage)) {
      setNotification({ type: 'error', message: '❌ Only emojis allowed! 🔒' });
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    try {
      const messagesRef = collection(db, `rooms/${currentRoom}/messages`);
      const encryptedContent = xorEncrypt(newMessage.trim(), currentRoom);
      
      await addDoc(messagesRef, {
        userId,
        userNickname: nickname,
        encryptedContent: encryptedContent,
        timestamp: serverTimestamp()
      });
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      setNotification({ type: 'error', message: 'Failed to send message' });
      setTimeout(() => setNotification(null), 3000);
    }
  };

  const quickEmojis = [
    '💰', '💎', '📈', '📉', '🏦', '💳', '💵', '💸',
    '🔒', '🔑', '🔗', '🤯', '💯', '🚀', '✨', '🧊',
    '🪙', '🟣', '☀️', '🐕', '🕯️', '🔶', '🌱', '🌊',
    '📱', '💻', '📞', '📧', '📡', '⛏️', '🤖', '🕶️'
  ];

  const handleQuickSelect = (emoji) => {
    setNewMessage(prev => prev + emoji);
  };

  const getStatusEmoji = (status) => {
    switch(status) {
      case 'online': return '🟢';
      case 'away': return '🟡';
      case 'offline': return '⚫';
      default: return '⚫';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-xl font-medium text-indigo-500">Connecting to Firestore... 🔗</p>
      </div>
    );
  }

  // Room Selection Screen
  if (!currentRoom) {
    return (
      <div className="flex flex-col h-screen max-h-screen bg-gradient-to-br from-indigo-600 to-purple-700">
        {notification && (
          <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl text-white max-w-sm ${
            notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
          }`}>
            <div className="flex justify-between items-center">
              <p className="font-bold">{notification.type === 'success' ? 'Success!' : 'Error!'}</p>
              <button onClick={() => setNotification(null)} className="text-white opacity-70">×</button>
            </div>
            <p className="mt-1 text-sm">{notification.message}</p>
          </div>
        )}

        <div className="flex items-center justify-center min-h-screen p-4">
          <div className="bg-white rounded-2xl shadow-2xl p-8 w-full max-w-md">
            <h1 className="text-4xl font-extrabold text-center text-indigo-700 mb-2">
              🧊 Crypto Money Talk 💎
            </h1>
            <p className="text-center text-gray-600 mb-8">Encrypted emoji chat rooms</p>

            {!nickname && (
              <div className="mb-6">
                <button
                  onClick={() => setIsNicknameModalOpen(true)}
                  className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-4 rounded-xl transition"
                >
                  👤 Set Your Identity
                </button>
              </div>
            )}

            {nickname && (
              <div className="mb-6 p-3 bg-indigo-50 rounded-lg">
                <p className="text-sm text-gray-600">Your Identity:</p>
                <p className="text-lg font-bold text-indigo-700">{nickname}</p>
              </div>
            )}

            <div className="space-y-3 mb-6">
              <label className="block text-sm font-medium text-gray-700">Room Code</label>
              <input
                type="text"
                value={roomInput}
                onChange={(e) => setRoomInput(e.target.value.toUpperCase())}
                onKeyDown={(e) => e.key === 'Enter' && joinRoom()}
                placeholder="e.g., CRYPTO2024"
                maxLength={20}
                className="w-full p-3 border-2 border-indigo-400 rounded-lg focus:border-indigo-600 focus:outline-none text-lg font-bold"
                style={{ color: '#000000', backgroundColor: '#ffffff' }}
              />
              <p className="text-xs text-gray-500">Create or join a private chat room</p>
            </div>

            <button
              onClick={joinRoom}
              disabled={!nickname || !roomInput.trim()}
              className={`w-full py-3 rounded-xl font-bold text-white transition ${
                !nickname || !roomInput.trim()
                  ? 'bg-indigo-300 cursor-not-allowed'
                  : 'bg-indigo-600 hover:bg-indigo-700 shadow-lg'
              }`}
            >
              🚀 Enter Room
            </button>

            {nickname && (
              <button
                onClick={() => setIsNicknameModalOpen(true)}
                className="w-full mt-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-4 rounded-lg transition"
              >
                Change Identity
              </button>
            )}
          </div>
        </div>

        {isNicknameModalOpen && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75 flex items-center justify-center z-40 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
              <h2 className="text-xl font-bold text-indigo-700 border-b pb-3 mb-4">Set Your Identity 🏷️</h2>
              <input
                type="text"
                value={modalInput}
                onChange={(e) => setModalInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveNickname()}
                maxLength={15}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '2px solid #4f46e5',
                  borderRadius: '8px',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  color: '#000000',
                  backgroundColor: '#ffffff',
                  boxSizing: 'border-box',
                  marginBottom: '8px'
                }}
                placeholder="CryptoWhale"
                autoFocus
              />
              <div className="flex justify-end space-x-3 mt-4">
                <button
                  onClick={() => setIsNicknameModalOpen(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={saveNickname}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Chat Room Screen
  return (
    <div className="flex flex-col h-screen max-h-screen bg-gray-50 font-sans">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-xl text-white max-w-sm ${
          notification.type === 'success' ? 'bg-green-500' : 'bg-red-500'
        }`}>
          <div className="flex justify-between items-center">
            <p className="font-bold">{notification.type === 'success' ? 'Success!' : 'Error!'}</p>
            <button onClick={() => setNotification(null)} className="text-white opacity-70">×</button>
          </div>
          <p className="mt-1 text-sm">{notification.message}</p>
        </div>
      )}

      {/* Header with Room Info */}
      <header className="p-4 border-b border-gray-200 bg-white shadow-lg z-10">
        <div className="flex justify-between items-center mb-3">
          <div>
            <h1 className="text-2xl font-extrabold text-indigo-700">🧊 {currentRoom} 💎</h1>
            <p className="text-sm text-gray-600">You: {nickname}</p>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={userStatus}
              onChange={(e) => setUserStatus(e.target.value)}
              className="px-3 py-2 bg-gray-100 rounded-lg text-sm font-semibold"
            >
              <option value="online">🟢 Online</option>
              <option value="away">🟡 Away</option>
              <option value="offline">⚫ Offline</option>
            </select>
            <button
              onClick={leaveRoom}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg"
            >
              Leave
            </button>
          </div>
        </div>

        {/* Online Users */}
        <div className="bg-indigo-50 p-3 rounded-lg">
          <p className="text-xs font-semibold text-gray-600 mb-2">Users in room ({roomUsers.length}):</p>
          <div className="flex flex-wrap gap-2">
            {roomUsers.map((user) => (
              <div key={user.userId} className="bg-white px-3 py-1 rounded-full text-sm flex items-center space-x-1 shadow-sm">
                <span>{getStatusEmoji(user.status)}</span>
                <span className="font-semibold">{user.nickname}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-grow p-4 overflow-y-auto space-y-4 bg-white">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <span className="text-6xl mb-3">🔒</span>
            <p className="text-xl font-medium">Encrypted messages appear here.</p>
            <p className="text-md">Start the secure conversation below.</p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMine = msg.userId === userId;
            const decryptedContent = msg.encryptedContent 
              ? xorDecrypt(msg.encryptedContent, currentRoom)
              : msg.content || '';
            
            return (
              <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'} mb-3`}>
                <div className={`max-w-xs md:max-w-md lg:max-w-lg p-3 rounded-xl shadow-lg ${
                  isMine
                    ? 'bg-indigo-600 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-tl-none'
                }`}>
                  <div className="text-xs font-semibold mb-1">{isMine ? 'You' : msg.userNickname}</div>
                  <div className="text-3xl sm:text-4xl leading-snug break-words">{decryptedContent}</div>
                  <div className="text-xs text-opacity-75 mt-1 pt-1 border-t border-gray-400 border-opacity-30 italic">
                    {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString() : 'pending'}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <footer className="p-4 border-t border-gray-200 bg-white shadow-2xl z-10">
        <div className="mb-3 flex flex-wrap gap-2 justify-center sm:justify-start">
          {quickEmojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => handleQuickSelect(emoji)}
              className="text-2xl p-1 rounded-full bg-gray-50 hover:bg-indigo-100 transition-colors transform hover:scale-110 shadow-sm"
              title={`Add ${emoji}`}
            >
              {emoji}
            </button>
          ))}
        </div>

        <div className="flex space-x-3">
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
            placeholder="Encrypted money talk only... 🔒"
            className="flex-grow p-3 border-2 border-indigo-400 rounded-xl focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600 text-2xl"
            style={{ height: '56px' }}
          />
          <button
            onClick={sendMessage}
            disabled={!newMessage.trim() || !isOnlyEmojis(newMessage)}
            className={`px-6 py-3 rounded-xl font-bold text-white transition ${
              !newMessage.trim() || !isOnlyEmojis(newMessage)
                ? 'bg-indigo-300 cursor-not-allowed'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-xl hover:shadow-2xl transform hover:-translate-y-0.5'
            }`}
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}