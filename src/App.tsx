import { useState, useRef, useEffect, FormEvent } from 'react';
import { GoogleGenAI } from "@google/genai";
import { motion, AnimatePresence } from "motion/react";
import { 
  Send, 
  LayoutGrid, 
  Settings, 
  History, 
  CheckCircle2, 
  MoreHorizontal, 
  LogOut, 
  Plus, 
  LogIn, 
  Search, 
  Menu,
  MessageSquare,
  Pencil,
  Check,
  X
} from "lucide-react";
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth, signInWithGoogle, signOut as firebaseSignOut } from './lib/firebase';
import { firebaseService } from './services/firebaseService';
import { Message, ChatSession } from './types';
import { cn } from './lib/utils';

// shadcn UI components
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

const SYSTEM_INSTRUCTIONS = `
You are a smart AI assistant designed to give short, clear, and precise answers.

Rules:
1. Always keep answers brief (2–4 lines max unless asked for detail).
2. Focus only on the most important information.
3. Avoid unnecessary explanations, examples, or repetition.
4. Use simple and easy language.
5. If needed, use bullet points for clarity.
6. If the question is complex, summarize the answer in the shortest possible way.
7. Only expand if the user explicitly asks for "explain in detail".

Tone:
- Professional but friendly
- Clear and direct
`;

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ChatSession[]>([]);
  const [currentChatId, setCurrentChatId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingChatId, setEditingChatId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setAuthLoading(false);
      if (u) {
        await firebaseService.createUserProfile(u.uid, {
          email: u.email!,
          displayName: u.displayName || undefined,
          photoURL: u.photoURL || undefined
        });
        loadHistory(u.uid);
      } else {
        setMessages([]);
        setHistory([]);
        setCurrentChatId(null);
      }
    });
    return unsubscribe;
  }, []);

  // Message Syncing
  useEffect(() => {
    if (currentChatId) {
      const unsubscribe = firebaseService.subscribeToMessages(currentChatId, (msgs) => {
        setMessages(msgs);
      });
      return unsubscribe;
    }
  }, [currentChatId]);

  // Scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  async function loadHistory(uid: string) {
    const chats = await firebaseService.getChatHistory(uid);
    if (chats) setHistory(chats as ChatSession[]);
  }

  async function handleNewChat() {
    if (!user) return;
    const chatId = await firebaseService.createChatSession(user.uid);
    if (chatId) {
      setCurrentChatId(chatId);
      setMessages([]);
      loadHistory(user.uid);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading || !user) return;

    let chatId = currentChatId;
    if (!chatId) {
      chatId = await firebaseService.createChatSession(user.uid, input.slice(0, 30));
      if (!chatId) return;
      setCurrentChatId(chatId);
    }

    const userInput = input;
    setInput('');
    setIsLoading(true);

    // Save user message to Firestore
    await firebaseService.addMessage(chatId, {
      role: 'user',
      content: userInput,
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: [
          ...messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: userInput }] }
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTIONS,
          temperature: 0.7,
        },
      });

      // Save assistant message to Firestore
      await firebaseService.addMessage(chatId, {
        role: 'model',
        content: response.text || "I'm sorry, I couldn't generate a response.",
      });
      
      loadHistory(user.uid);
    } catch (error) {
      console.error('AI Error:', error);
      await firebaseService.addMessage(chatId, {
        role: 'model',
        content: "An error occurred. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }

  const filteredHistory = history.filter(chat => 
    chat.title?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  async function handleRename(chatId: string) {
    if (!editingTitle.trim() || !user) return;
    await firebaseService.updateChatTitle(chatId, editingTitle.trim());
    setEditingChatId(null);
    loadHistory(user.uid);
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 mb-8 shrink-0">
        <div className="w-8 h-8 bg-brand rounded-lg shadow-sm flex items-center justify-center text-white font-bold">A</div>
        <span className="font-bold text-lg tracking-tight text-foreground">ADNAN AI</span>
      </div>

      <Button 
        onClick={handleNewChat}
        variant="secondary"
        className="w-full mb-6 py-6 rounded-xl font-bold flex gap-2 border border-blue-100 bg-blue-50/50 hover:bg-blue-50 text-brand"
      >
        <Plus size={18} />
        New Conversation
      </Button>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
        <Input 
          placeholder="Search history..." 
          className="pl-10 bg-muted/30 border-none rounded-xl text-xs h-10"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <ScrollArea className="flex-1 -mx-2 px-2">
        <div className="space-y-4">
          <div>
            <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-[1.5px] mb-3 px-3">Recent Sessions</div>
            <div className="space-y-1">
              {filteredHistory.map(chat => (
                <div key={chat.id} className="group relative">
                  {editingChatId === chat.id ? (
                    <div className="flex items-center gap-1 px-2 py-1 bg-muted/50 rounded-xl mb-1">
                      <Input 
                        autoFocus
                        value={editingTitle}
                        onChange={(e) => setEditingTitle(e.target.value)}
                        className="h-8 text-xs bg-transparent border-none focus-visible:ring-0"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRename(chat.id);
                          if (e.key === 'Escape') setEditingChatId(null);
                        }}
                      />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 shrink-0" onClick={() => handleRename(chat.id)}>
                        <Check size={14} />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 shrink-0" onClick={() => setEditingChatId(null)}>
                        <X size={14} />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center group/item">
                      <Button 
                        variant={currentChatId === chat.id ? "secondary" : "ghost"}
                        onClick={() => setCurrentChatId(chat.id)}
                        className={cn(
                          "w-full justify-start gap-3 h-12 rounded-xl transition-all px-3 flex-1 overflow-hidden",
                          currentChatId === chat.id ? "bg-blue-50 text-brand font-bold" : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        <MessageSquare size={16} className={cn("shrink-0", currentChatId === chat.id ? "text-brand" : "text-muted-foreground/50")} />
                        <span className="truncate text-xs">{chat.title || 'Untitled Chat'}</span>
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChatId(chat.id);
                          setEditingTitle(chat.title || '');
                        }}
                        className="absolute right-2 opacity-0 group-hover/item:opacity-100 transition-opacity h-8 w-8 text-muted-foreground hover:text-brand"
                      >
                        <Pencil size={14} />
                      </Button>
                    </div>
                  )}
                </div>
              ))}
              {filteredHistory.length === 0 && (
                <div className="text-[10px] text-muted-foreground italic px-3 pt-2">No matching results</div>
              )}
            </div>
          </div>
        </div>
      </ScrollArea>

      <div className="pt-4 mt-auto border-t border-border flex flex-col gap-4">
        <div className="flex items-center gap-3 px-2">
          <Avatar className="w-9 h-9 border border-border">
            <AvatarImage src={user.photoURL || undefined} referrerPolicy="no-referrer" />
            <AvatarFallback className="bg-muted text-[10px] font-bold text-muted-foreground">
              {user.displayName?.slice(0, 2).toUpperCase() || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold truncate text-foreground leading-tight">{user.displayName}</div>
            <div className="text-[10px] text-muted-foreground truncate">{user.email}</div>
          </div>
        </div>
        <Button 
          variant="ghost" 
          onClick={firebaseSignOut}
          className="w-full justify-start gap-3 text-destructive hover:text-destructive hover:bg-destructive/5 rounded-xl font-semibold px-3"
        >
          <LogOut size={18} />
          <span>Sign Out</span>
        </Button>
      </div>
    </div>
  );

  if (authLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-background">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className="w-10 h-10 border-4 border-brand border-t-transparent rounded-full"
        />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-sm w-full border-none shadow-2xl rounded-[32px] overflow-hidden">
          <CardContent className="p-10 text-center space-y-8">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-cyan-400 rounded-2xl mx-auto flex items-center justify-center text-white shadow-lg rotate-3">
              <LayoutGrid size={32} />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Access Adnan AI</h1>
              <p className="text-muted-foreground mt-2 text-sm leading-relaxed">Precision intelligence at your fingertips. Sign in to continue with your saved sessions.</p>
            </div>
            <Button 
              onClick={signInWithGoogle}
              size="lg"
              className="w-full h-14 rounded-2xl font-bold bg-brand hover:bg-blue-700 shadow-xl shadow-blue-500/20"
            >
              <LogIn className="mr-2" size={20} />
              Sign in with Google
            </Button>
            <Separator />
            <div className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">Enterprise Ready • Secure</div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full bg-muted/10 font-sans antialiased text-foreground overflow-hidden">
      {/* Sidebar - Desktop */}
      <aside className="w-[300px] border-r border-border bg-card hidden lg:block overflow-hidden">
        <div className="h-full p-6">
          <SidebarContent />
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-background relative overflow-hidden">
        {/* Header */}
        <header className="h-16 border-b border-border bg-card/80 backdrop-blur-md flex items-center justify-between px-6 shrink-0 z-20">
          <div className="flex items-center gap-4">
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu size={20} />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-6 w-[300px]">
                <SidebarContent />
              </SheetContent>
            </Sheet>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-success/30 text-success bg-success/5 animate-pulse rounded-full font-bold text-[10px] py-0 px-2">
                <div className="w-1 h-1 bg-success rounded-full mr-1.5" />
                ACTIVE
              </Badge>
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest hidden sm:inline">Precision Mode</span>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-[10px] font-bold text-muted-foreground hidden sm:block">ENGINE: GEMINI-3-FLASH</div>
            <Button variant="ghost" size="icon" className="rounded-full">
              <Settings size={18} />
            </Button>
          </div>
        </header>

        {/* Chat Area Viewport */}
        <div className="flex-1 overflow-hidden relative">
          <ScrollArea className="h-full w-full">
            <div className="max-w-3xl mx-auto px-4 md:px-8 py-8 lg:py-12 space-y-10">
              {messages.length === 0 && !currentChatId && (
                <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-4">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }} 
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-16 h-16 bg-blue-50 text-brand rounded-3xl flex items-center justify-center mb-6 shadow-sm border border-blue-100"
                  >
                    <MessageSquare size={32} />
                  </motion.div>
                  <h2 className="text-3xl font-bold tracking-tight">How can I assist you today?</h2>
                  <p className="text-sm text-muted-foreground mt-4 max-w-sm leading-relaxed">Experience high-precision intelligence. Start a new session for optimized answers and deep insights.</p>
                  <Button 
                    onClick={handleNewChat}
                    size="lg"
                    className="mt-10 rounded-2xl px-10 h-14 font-bold bg-brand hover:bg-blue-700 shadow-2xl shadow-blue-500/20"
                  >
                    Initiate New Session
                  </Button>
                </div>
              )}

              <AnimatePresence mode="popLayout" initial={false}>
                {messages.map((m) => (
                  <motion.div
                    key={m.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={cn(
                      "flex gap-4 group",
                      m.role === 'user' ? "flex-row-reverse" : "flex-row"
                    )}
                  >
                    <Avatar className={cn(
                      "w-9 h-9 mt-1 shadow-sm",
                      m.role === 'user' ? "order-1" : ""
                    )}>
                      {m.role === 'user' ? (
                        <>
                          <AvatarImage src={user.photoURL || undefined} referrerPolicy="no-referrer" />
                          <AvatarFallback className="bg-muted text-xs font-bold">{user.displayName?.slice(0, 1) || 'U'}</AvatarFallback>
                        </>
                      ) : (
                        <AvatarFallback className="bg-brand text-white text-xs font-bold">AI</AvatarFallback>
                      )}
                    </Avatar>
                    <div className={cn(
                      "max-w-[85%] sm:max-w-[70%] space-y-1",
                      m.role === 'user' ? "items-end" : "items-start"
                    )}>
                      <div className={cn(
                        "chat-bubble",
                        m.role === 'user' ? "chat-bubble-user" : "chat-bubble-assistant shadow-sm"
                      )}>
                        <p className="text-[14px] leading-relaxed whitespace-pre-wrap font-medium">{m.content}</p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {isLoading && (
                <div className="flex gap-4">
                  <Avatar className="w-9 h-9 mt-1 animate-pulse"><AvatarFallback className="bg-brand text-white text-xs font-bold">AI</AvatarFallback></Avatar>
                  <div className="chat-bubble-assistant opacity-50 flex items-center justify-center h-10 px-4">
                    <MoreHorizontal size={20} className="animate-bounce" />
                  </div>
                </div>
              )}
              
              <div className="h-4" /> {/* Refined padding at bottom */}
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="p-6 md:p-8 bg-background/80 backdrop-blur-md border-t border-border z-10 shrink-0">
          <form onSubmit={handleSubmit} className="max-w-2xl mx-auto space-y-4">
            <div className="relative group shadow-2xl shadow-blue-500/5 rounded-2xl">
              <div className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-blue-500/20 to-transparent opacity-0 group-focus-within:opacity-100 transition-opacity" />
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={currentChatId ? "Ask anything..." : "Message AI..."}
                className="h-14 px-6 bg-card border-border border-2 rounded-2xl focus-visible:ring-brand focus-visible:border-brand transition-all text-[15px] pr-16 shadow-sm"
              />
              <Button
                type="submit"
                disabled={!input.trim() || isLoading}
                size="icon"
                className="absolute right-2 top-2 h-10 w-10 bg-brand hover:bg-blue-700 rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
              >
                <Send size={18} />
              </Button>
            </div>
            
            <div className="flex items-center justify-center gap-4 text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60 overflow-hidden text-center whitespace-nowrap px-4">
              <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-blue-500" /> CLOUD SYNCED</span>
              <span className="opacity-20">|</span>
              <span className="flex items-center gap-2"><div className="w-1 h-1 rounded-full bg-green-500" /> SECURE HANDSHAKE</span>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
