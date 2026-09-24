'use client';
import { createContext, useContext } from 'react';
import type { TouristMessages } from '@/lib/public-map/messages';
const Context = createContext<TouristMessages | null>(null);
export function TouristMessagesProvider({ messages, children }: { readonly messages: TouristMessages; readonly children: React.ReactNode }) { return <Context.Provider value={messages}>{children}</Context.Provider>; }
export function useTouristMessages(): TouristMessages { const value = useContext(Context); if (!value) throw new Error('TouristMessagesProvider is missing'); return value; }
