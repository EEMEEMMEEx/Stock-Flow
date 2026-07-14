import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './components/theme-provider';
import PageWrapper from './components/layout/PageWrapper';
import InstallPrompt from './components/InstallPrompt';
import Login from './pages/auth/Login';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Items from './pages/Items';
import StockIn from './pages/StockIn';
import Withdrawals from './pages/Withdrawals';
import History from './pages/History';
import Reports from './pages/Reports';

function App() {
  return (
    <ThemeProvider defaultTheme="light" storageKey="stock-flow-theme-v2">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes inside PageWrapper */}
            <Route element={<PageWrapper />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/items" element={<Items />} />
              <Route path="/stock-in" element={<StockIn />} />
              <Route path="/withdrawals" element={<Withdrawals />} />
              <Route path="/history" element={<History />} />
              <Route path="/reports" element={<Reports />} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
            <Toaster 
              position="top-right" 
              toastOptions={{
                className: '!bg-card !text-card-foreground !border !border-border !shadow-lg',
              }}
            />
            <InstallPrompt />
          </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
