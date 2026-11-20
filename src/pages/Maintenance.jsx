import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Wrench, Clock, RefreshCw, LogIn, LogOut, ShieldAlert } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useMaintenance } from '@/contexts/MaintenanceContext';
import { useTranslation } from '@/i18n';
import LanguageSwitcher from '@/components/common/LanguageSwitcher';

const Maintenance = () => {
  const { user, signOut } = useAuth();
  const { maintenance, refreshMaintenance } = useMaintenance();
  const { t } = useTranslation();
  const [checking, setChecking] = useState(false);

  const handleRefresh = async () => {
    setChecking(true);
    try {
      await refreshMaintenance();
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background text-foreground flex flex-col items-center justify-center p-4 sm:p-6 relative">
      <div className="absolute top-4 right-4">
        <LanguageSwitcher />
      </div>

      <Card className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-lg overflow-hidden">
        <CardHeader className="text-center pb-4 pt-8 px-6">
          <div className="mx-auto mb-4 w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-center justify-center">
            <Wrench className="w-8 h-8 text-amber-600 dark:text-amber-400" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {t('maintenance.title', 'System Under Maintenance')}
          </CardTitle>
          <CardDescription className="text-sm mt-2 leading-relaxed">
            {t(
              'maintenance.subtitle',
              'The system is temporarily unavailable while we perform scheduled maintenance. Please check back shortly.'
            )}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8 space-y-5">
          {maintenance.message ? (
            <div className="rounded-xl bg-muted/50 border border-border/70 p-4 text-sm text-foreground leading-relaxed flex items-start gap-3">
              <ShieldAlert className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="whitespace-pre-line">{maintenance.message}</p>
            </div>
          ) : null}

          {maintenance.estimated_end ? (
            <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-4 py-3 flex items-center justify-center gap-2 text-sm text-amber-700 dark:text-amber-300 font-medium">
              <Clock className="w-4 h-4 shrink-0" />
              <span>
                {t('maintenance.estimatedEnd', 'Estimated completion:')}{' '}
                <strong className="font-semibold">{maintenance.estimated_end}</strong>
              </span>
            </div>
          ) : null}

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 pt-2">
            <Button
              type="button"
              onClick={handleRefresh}
              disabled={checking}
              className="min-h-[44px] flex-1 cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${checking ? 'animate-spin' : ''}`} />
              {checking
                ? t('maintenance.checking', 'Checking status...')
                : t('maintenance.checkAgain', 'Check Again')}
            </Button>

            {user ? (
              <Button
                type="button"
                variant="outline"
                onClick={signOut}
                className="min-h-[44px] cursor-pointer"
              >
                <LogOut className="w-4 h-4 mr-2" />
                {t('maintenance.signOut', 'Sign Out')}
              </Button>
            ) : (
              <Button
                asChild
                variant="outline"
                className="min-h-[44px] cursor-pointer"
              >
                <Link to="/login">
                  <LogIn className="w-4 h-4 mr-2" />
                  {t('maintenance.adminLogin', 'Admin Sign In')}
                </Link>
              </Button>
            )}
          </div>

          <p className="text-center text-xs text-muted-foreground pt-2">
            {t('maintenance.superOnlyNote', 'Only System Administrator (SUPER) can access the system during maintenance.')}
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default Maintenance;
