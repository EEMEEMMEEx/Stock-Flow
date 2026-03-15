import React, { useEffect } from 'react';
import { ThemeContext } from './ThemeContextValue';

export const ThemeProvider = ({ children }) => {
    // Always use light theme
    useEffect(() => {
        document.documentElement.setAttribute('data-theme', 'light');
    }, []);

    const value = {
        theme: 'light',
        isDark: false,
    };

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
};
