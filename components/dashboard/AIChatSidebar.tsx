'use client';

import { useState, useRef, useEffect } from 'react';
import { processAIQuery } from '@/app/actions/ai-query';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export default function AIChatSidebar() {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<Message[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = async () => {
        if (!inputValue.trim() || loading) return;

        const userMsg: Message = {
            id: Date.now().toString(),
            role: 'user',
            content: inputValue.trim(),
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setLoading(true);

        try {
            const response = await processAIQuery(userMsg.content);

            if (response.success && response.answer) {
                const aiMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: response.answer,
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, aiMsg]);
            } else {
                const errorMsg: Message = {
                    id: (Date.now() + 1).toString(),
                    role: 'assistant',
                    content: response.error || 'Sorry, I encountered an error processing your request.',
                    timestamp: new Date()
                };
                setMessages(prev => [...prev, errorMsg]);
            }
        } catch (error) {
            const errorMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: 'Sorry, I encountered a network error. Please try again.',
                timestamp: new Date()
            };
            setMessages(prev => [...prev, errorMsg]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Toggle Button (Floating) */}
            <button
                onClick={() => setIsOpen(true)}
                className={`fixed bottom-6 right-6 z-40 p-4 bg-violet-600 hover:bg-violet-500 text-white rounded-full shadow-lg hover:shadow-violet-500/50 transition-all hover:scale-110 active:scale-95 animate-bounce-slow ${isOpen ? 'hidden' : 'flex'}`}
                aria-label="Open AI Assistant"
            >
                <span className="text-2xl">✨</span>
            </button>

            {/* Sidebar Panel */}
            <div
                className={`fixed inset-y-0 right-0 z-50 w-full sm:w-96 bg-glass border-l border-white/10 shadow-2xl transform transition-transform duration-300 ease-in-out backdrop-blur-xl ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 bg-violet-600/20 backdrop-blur-md border-b border-white/10 text-white">
                    <div className="flex items-center gap-2">
                        <span className="text-xl">✨</span>
                        <h2 className="font-semibold text-lg text-white">Financial Assistant</h2>
                    </div>
                    <button
                        onClick={() => setIsOpen(false)}
                        className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                        aria-label="Close"
                    >
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Messages Area */}
                <div className="flex-1 h-[calc(100vh-130px)] overflow-y-auto p-4 bg-slate-900/50 space-y-4 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {messages.length === 0 && (
                        <div className="text-center text-muted mt-10">
                            <p className="mb-2">👋 Hi! I can help analyze your finances.</p>
                            <p className="text-sm">Try asking:</p>
                            <div className="mt-4 space-y-2">
                                <button
                                    onClick={() => setInputValue("כמה הוצאתי על אוכל בחוץ החודש?")}
                                    className="block w-full text-left p-2 bg-white/5 border border-white/10 rounded-lg text-sm text-main hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors"
                                >
                                    "כמה הוצאתי על אוכל בחוץ החודש?"
                                </button>
                                <button
                                    onClick={() => setInputValue("Show me my top expenses")}
                                    className="block w-full text-left p-2 bg-white/5 border border-white/10 rounded-lg text-sm text-main hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors"
                                >
                                    "Show me my top expenses"
                                </button>
                                <button
                                    onClick={() => setInputValue("מה המאזן שלי כרגע?")}
                                    className="block w-full text-left p-2 bg-white/5 border border-white/10 rounded-lg text-sm text-main hover:border-violet-500/50 hover:bg-violet-500/10 transition-colors"
                                >
                                    "מה המאזן שלי כרגע?"
                                </button>
                            </div>
                        </div>
                    )}

                    {messages.map(msg => (
                        <div
                            key={msg.id}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div
                                className={`max-w-[85%] p-3 rounded-2xl ${msg.role === 'user'
                                    ? 'bg-violet-600 text-white rounded-tr-none shadow-lg shadow-violet-500/20'
                                    : 'bg-white/10 border border-white/10 text-main rounded-tl-none shadow-sm backdrop-blur-md'
                                    }`}
                            >
                                <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                            </div>
                        </div>
                    ))}

                    {loading && (
                        <div className="flex justify-start">
                            <div className="bg-white/10 border border-white/10 p-3 rounded-2xl rounded-tl-none shadow-sm backdrop-blur-md">
                                <div className="flex space-x-1">
                                    <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                    <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                    <div className="w-2 h-2 bg-white/50 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input Area */}
                <div className="absolute bottom-0 left-0 right-0 p-4 bg-slate-900 border-t border-white/10 backdrop-blur-xl">
                    <form
                        onSubmit={(e) => { e.preventDefault(); handleSend(); }}
                        className="flex gap-2"
                    >
                        <input
                            type="text"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            placeholder="Ask me anything..."
                            className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-full focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm text-white placeholder-slate-400"
                            disabled={loading}
                        />
                        <button
                            type="submit"
                            disabled={!inputValue.trim() || loading}
                            className="p-2 bg-violet-600 text-white rounded-full hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg shadow-violet-500/20"
                        >
                            <svg className="w-5 h-5 transform rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                        </button>
                    </form>
                </div>
            </div>

            {/* Backdrop for mobile */}
            {isOpen && (
                <div
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 sm:hidden"
                    onClick={() => setIsOpen(false)}
                />
            )}
        </>
    );
}
