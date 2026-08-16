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
import Checkouts from './pages/Checkouts';
import History from './pages/History';
import Reports from './pages/Reports';

import Manual from './pages/Manual';
import UserManagement from './pages/UserManagement';
import RoleManagement from './pages/RoleManagement';
import Settings from './pages/Settings';
import Profile from './pages/Profile';
import LandingPage from './pages/LandingPage';
import PermissionRoute from './components/auth/PermissionRoute';
import { useAuth } from './contexts/AuthContext';

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
      </div>
    );
  }
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <LandingPage />;
}

function App() {
  const baseUrl = import.meta.env.BASE_URL || '/';

  return (
    <ThemeProvider defaultTheme="system" storageKey="stock-flow-theme-v2">
      <AuthProvider>
        <BrowserRouter basename={baseUrl} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<HomeRoute />} />
            <Route path="/landing" element={<LandingPage />} />
            <Route path="/login" element={<Login />} />
            
            {/* Protected Routes inside PageWrapper */}
            <Route element={<PageWrapper />}>
              <Route path="/dashboard" element={<PermissionRoute permission="dashboard.view"><Dashboard /></PermissionRoute>} />
              <Route path="/projects" element={<PermissionRoute permission="projects.view"><Projects /></PermissionRoute>} />
              <Route path="/items" element={<PermissionRoute permission="items.view"><Items /></PermissionRoute>} />
              <Route path="/stock-in" element={<PermissionRoute permission="stock_in.view"><StockIn /></PermissionRoute>} />
              <Route path="/withdrawals" element={<PermissionRoute permission="withdrawals.view"><Withdrawals /></PermissionRoute>} />
              <Route path="/checkouts" element={<PermissionRoute permission="checkouts.view"><Checkouts /></PermissionRoute>} />
              <Route path="/history" element={<PermissionRoute permission="history.view"><History /></PermissionRoute>} />
              <Route path="/reports" element={<PermissionRoute permission="reports.view"><Reports /></PermissionRoute>} />
              <Route path="/users" element={<PermissionRoute permission="users.view"><UserManagement /></PermissionRoute>} />
              <Route path="/roles" element={<PermissionRoute permission="roles.view"><RoleManagement /></PermissionRoute>} />
              <Route path="/settings" element={<PermissionRoute permission="settings.view"><Settings /></PermissionRoute>} />
              <Route path="/profile" element={<PermissionRoute permission={null}><Profile /></PermissionRoute>} />
              <Route path="/manual" element={<Manual />} />
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
