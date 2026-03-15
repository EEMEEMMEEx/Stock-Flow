import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import ProductCatalog from './pages/ProductCatalog';
import Assets from './pages/Assets';
import Cart from './pages/Cart';
import Transactions from './pages/Transactions';
import Login from './pages/Login';
import PendingApproval from './pages/PendingApproval';
import Return from './pages/Return';
import Scan from './pages/Scan';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import Help from './pages/Help';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import Warehouses from './pages/Warehouses';
import ProtectedRoute from './components/ProtectedRoute';

function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/pending" element={<PendingApproval />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="products" element={<ProductCatalog />} />
              <Route path="assets" element={<Assets />} />
              <Route path="cart" element={<Cart />} />
              <Route path="transactions" element={<Transactions />} />
              <Route path="return" element={<Return />} />
              <Route path="scan" element={<Scan />} />
              <Route path="users" element={<Users />} />
              <Route path="audit-log" element={<AuditLog />} />
              <Route path="warehouses" element={<Warehouses />} />
              <Route path="profile" element={<Profile />} />
              <Route path="settings" element={<Settings />} />
              <Route path="help" element={<Help />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;

