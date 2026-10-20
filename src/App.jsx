import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthProvider';
import { ThemeProvider } from './components/ThemeProvider';
import { LanguageProvider } from './i18n';
import PageWrapper from './components/layout/PageWrapper';
import PermissionRoute from './components/auth/PermissionRoute';
import { useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/common/ErrorBoundary';

const Login = lazy(() => import('./pages/auth/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Projects = lazy(() => import('./pages/Projects'));
const Items = lazy(() => import('./pages/Items'));
const StockIn = lazy(() => import('./pages/StockIn'));
const Withdrawals = lazy(() => import('./pages/Withdrawals'));
const Checkouts = lazy(() => import('./pages/Checkouts'));
const History = lazy(() => import('./pages/History'));
const Reports = lazy(() => import('./pages/Reports'));
const Scrap = lazy(() => import('./pages/Scrap'));
const Manual = lazy(() => import('./pages/Manual'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const RoleManagement = lazy(() => import('./pages/RoleManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));
const LandingPage = lazy(() => import('./landing/LandingPage'));

function PageLoadingFallback() {
  return (
    <div className="min-h-[50vh] w-full flex items-center justify-center p-8">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 rounded-full border-2 border-primary/20 border-t-primary animate-spin" />
        <span className="text-xs text-muted-foreground font-mono">Loading module...</span>
      </div>
    </div>
  );
}

// Check if running on the dedicated Landing Page site (e.g. GitHub Pages)
const isLandingSite = () => {
  if (typeof window !== 'undefined' && (
    window.location.hostname === 'github.io' || 
    window.location.hostname.endsWith('.github.io')
  )) {
    return true;
  }
  if (import.meta.env.VITE_APP_MODE === 'landing') {
    return true;
  }
  if (import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/') {
    return true;
  }
  return false;
};

function HomeRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-zinc-950">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-400"></div>
      </div>
    );
  }

  // GitHub Pages is the dedicated Landing Page host
  if (isLandingSite()) {
    return <LandingPage />;
  }

  // Main Application (Vercel / localhost):
  if (user) {
    return <Navigate to="/dashboard" replace />;
  }
  return <Navigate to="/login" replace />;
}

function App() {
  const baseUrl = import.meta.env.BASE_URL || '/';

  return (
    <ThemeProvider defaultTheme="system" storageKey="stock-flow-theme-v2">
      <LanguageProvider>
        <AuthProvider>
          <BrowserRouter basename={baseUrl} future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <ErrorBoundary>
              <Suspense fallback={<PageLoadingFallback />}>
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
                    <Route path="/scrap" element={<PermissionRoute permission="scrap.view"><Scrap /></PermissionRoute>} />
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
              </Suspense>
            </ErrorBoundary>

            <Toaster 
              position="top-right" 
              toastOptions={{
                className: '!bg-card !text-card-foreground !border !border-border !shadow-lg',
              }}
            />
          </BrowserRouter>
        </AuthProvider>
      </LanguageProvider>
    </ThemeProvider>
  );
}

export default App;
