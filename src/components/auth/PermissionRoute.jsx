import React, { useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ShieldAlert, ArrowLeft, Home, Lock } from 'lucide-react';
import toast from 'react-hot-toast';

const PermissionRoute = ({ permission, children }) => {
  const { can, loading, profile, user } = useAuth();
  const navigate = useNavigate();
  const hasPermission = !permission || can(permission);

  useEffect(() => {
    if (!loading && profile && !hasPermission) {
      toast.error('คุณไม่มีสิทธิ์เข้าถึงเมนูนี้', { 
        id: `perm-denied-${permission}`,
        duration: 4000
      });
    }
  }, [loading, profile, hasPermission, permission]);

  // Loading state during auth/permission resolution
  if (loading || (user && !profile)) {
    return (
      <div className="h-64 w-full flex flex-col items-center justify-center gap-3">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <span className="text-xs text-muted-foreground">กำลังตรวจสอบสิทธิ์การใช้งาน...</span>
      </div>
    );
  }

  // Access Denied UX when user lacks permission for direct URL navigation
  if (!hasPermission) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full neu-flat border-0 text-center overflow-hidden">
          <CardContent className="p-8 space-y-6">
            {/* Lock / Shield Icon */}
            <div className="w-16 h-16 mx-auto rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-sm">
              <ShieldAlert className="w-9 h-9" />
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-amber-500" />
                ไม่มีสิทธิ์เข้าถึงหน้านี้
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                บัญชีของคุณยังไม่มีสิทธิ์เข้าถึงเมนูนึ้ หากจำเป็นต้องใช้งาน กรุณาติดต่อผู้ดูแลระบบเพื่อขออนุมัติสิทธิ์เพิ่มเติม
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                className="w-full sm:w-auto min-h-[44px] text-xs font-semibold neu-button flex items-center justify-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                ย้อนกลับ
              </Button>

              <Button
                asChild
                className="w-full sm:w-auto min-h-[44px] text-xs font-semibold neu-primary flex items-center justify-center gap-2"
              >
                <Link to="/">
                  <Home className="w-4 h-4" />
                  กลับหน้าหลัก (Dashboard)
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return children;
};

export default PermissionRoute;
