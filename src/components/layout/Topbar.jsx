import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, Menu, UserCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const Topbar = () => {
  const { profile, signOut } = useAuth();

  return (
    <header className="h-16 border-b bg-white/80 backdrop-blur-xl sticky top-0 z-30 flex items-center justify-between px-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="w-5 h-5" />
        </Button>
      </div>
      
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          <UserCircle className="w-6 h-6 text-muted-foreground" />
          <div className="hidden sm:block">
            <p className="font-medium leading-none">{profile?.full_name || 'User'}</p>
            <p className="text-xs text-muted-foreground mt-1 capitalize">{profile?.role}</p>
          </div>
        </div>
        <div className="h-6 w-px bg-border mx-2"></div>
        <Button variant="ghost" size="icon" onClick={signOut} title="Logout">
          <LogOut className="w-5 h-5 text-muted-foreground" />
        </Button>
      </div>
    </header>
  );
};

export default Topbar;
