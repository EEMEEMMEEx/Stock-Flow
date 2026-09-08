import { useEffect } from 'react';
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
      toast.error('You do not have permission to access this page', { 
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
        <span className="text-xs text-muted-foreground">Checking permissions...</span>
      </div>
    );
  }

  // Access Denied UX when user lacks permission for direct URL navigation
  if (!hasPermission) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-4">
        <Card className="max-w-md w-full rounded-xl bg-card border border-border shadow-xs text-center overflow-hidden">
          <CardContent className="p-8 space-y-6">
            {/* Lock / Shield Icon */}
            <div className="w-16 h-16 mx-auto rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-600 dark:text-amber-400 shadow-xs">
              <ShieldAlert className="w-9 h-9" />
            </div>

            {/* Error Message */}
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-foreground tracking-tight flex items-center justify-center gap-2">
                <Lock className="w-5 h-5 text-amber-500" />
                Access Denied
              </h2>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Your account does not have permission to access this page. Please contact an administrator if you need access.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                variant="outline"
                onClick={() => navigate(-1)}
                className="w-full sm:w-auto h-9 px-4 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Go Back
              </Button>

              <Button
                asChild
                className="w-full sm:w-auto h-9 px-4 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                <Link to="/">
                  <Home className="w-4 h-4" />
                  Back to Dashboard
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
