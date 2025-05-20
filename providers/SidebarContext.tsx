'use client'
import React, { createContext, useContext, useState, ReactNode } from 'react';

interface SidebarContextType {
    showSidebar: boolean;
    toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function useSidebar(): SidebarContextType {
    const context = useContext(SidebarContext);
    if (!context) {
        throw new Error('useSidebar must be used within a SidebarProvider');
    }
    return context;
}

interface SidebarProviderProps {
    children: ReactNode;
}

export function SidebarProvider({ children }: SidebarProviderProps): JSX.Element {
    const [showSidebar, setShowSidebar] = useState(false);

    const toggleSidebar = () => {
        setShowSidebar(!showSidebar);
    };

    return (
        <SidebarContext.Provider value={{ showSidebar, toggleSidebar }}>
            {children}
        </SidebarContext.Provider>
    );
}
