import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';

const PermissionRoute = ({ permission, children }) => {
  const { can, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-48 w-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!can(permission)) {
    toast.error(`คุณไม่มีสิทธิ์เข้าถึงส่วนนี้ (${permission})`, { id: `perm-denied-${permission}` });
    return <Navigate to="/" replace />;
  }

  return children;
};

export default PermissionRoute;
