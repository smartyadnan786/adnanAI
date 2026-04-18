import { 
  collection, 
  addDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  serverTimestamp,
  setDoc,
  doc,
  getDocs,
  limit
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { Message } from '../types';

export interface FirestoreErrorInfo {
  error: string;
  operationType: 'create' | 'update' | 'delete' | 'list' | 'get' | 'write';
  path: string | null;
  authInfo: any;
}

function handleFirestoreError(error: any, operation: FirestoreErrorInfo['operationType'], path: string | null): never {
  console.error(`Firestore error during ${operation} at ${path}:`, error);
  const errorInfo: FirestoreErrorInfo = {
    error: error.message || 'Unknown Firestore error',
    operationType: operation,
    path,
    authInfo: null // Placeholder, updated in App.tsx if needed
  };
  throw new Error(JSON.stringify(errorInfo));
}

export const firebaseService = {
  async createUserProfile(userId: string, profile: { email: string; displayName?: string; photoURL?: string }) {
    try {
      const userRef = doc(db, 'users', userId);
      await setDoc(userRef, {
        ...profile,
        updatedAt: serverTimestamp(),
        createdAt: serverTimestamp() // setDoc with merge could be better but this is fine for first time
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, 'write', `users/${userId}`);
    }
  },

  async createChatSession(userId: string, title: string = 'New Conversation') {
    try {
      const chatRef = await addDoc(collection(db, 'chats'), {
        userId,
        title,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return chatRef.id;
    } catch (e) {
      handleFirestoreError(e, 'create', 'chats');
    }
  },

  async addMessage(chatId: string, message: Omit<Message, 'id' | 'timestamp'>) {
    try {
      const messagesRef = collection(db, 'chats', chatId, 'messages');
      await addDoc(messagesRef, {
        ...message,
        timestamp: serverTimestamp()
      });
      
      // Update chat session timestamp
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, { updatedAt: serverTimestamp() }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, 'create', `chats/${chatId}/messages`);
    }
  },

  subscribeToMessages(chatId: string, callback: (messages: Message[]) => void) {
    const messagesRef = collection(db, 'chats', chatId, 'messages');
    const q = query(messagesRef, orderBy('timestamp', 'asc'));
    
    return onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        timestamp: doc.data().timestamp?.toDate() || new Date()
      })) as Message[];
      callback(messages);
    }, (e) => {
      console.error("Subscription error:", e);
    });
  },

  async getChatHistory(userId: string) {
    try {
      const chatsRef = collection(db, 'chats');
      const q = query(chatsRef, where('userId', '==', userId), orderBy('updatedAt', 'desc'), limit(10));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
    } catch (e) {
      handleFirestoreError(e, 'list', 'chats');
    }
  },

  async updateChatTitle(chatId: string, newTitle: string) {
    try {
      const chatRef = doc(db, 'chats', chatId);
      await setDoc(chatRef, { 
        title: newTitle,
        updatedAt: serverTimestamp() 
      }, { merge: true });
    } catch (e) {
      handleFirestoreError(e, 'update', `chats/${chatId}`);
    }
  }
};
