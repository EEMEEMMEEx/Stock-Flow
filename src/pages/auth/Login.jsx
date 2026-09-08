import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Package, Lock, Mail } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import toast from 'react-hot-toast';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(email, password);
      if (error) throw error;
      navigate('/');
      toast.success('Signed in successfully');
    } catch (error) {
      console.error('[Login Error]:', error);
      let msg = error.message || 'An error occurred while signing in';
      if (
        error?.status === 500 || 
        String(error?.status) === '500' || 
        error?.name === 'AuthRetryableFetchError' ||
        msg.includes('Internal Server Error') || 
        msg.includes('500')
      ) {
        msg = 'Supabase Authentication service is temporarily unavailable (HTTP 500). Please check the authentication service/database or try logging in again.';
      } else if (msg.includes('Email logins are disabled')) {
        msg = 'Email logins are disabled in Supabase. Please enable Email Provider in Supabase Dashboard.';
      } else if (msg.includes('Invalid login credentials')) {
        msg = 'Invalid email or password. Please check your credentials and try again.';
      }

      toast.error(msg, { duration: 6000 });
    } finally {
      setLoading(false);
    }


  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-200/40 blur-[120px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-purple-200/40 blur-[120px]" />
      
      <Card className="w-full max-w-md relative z-10 shadow-2xl border-slate-200">
        <CardHeader className="space-y-3 pb-6">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-purple-600 flex items-center justify-center mb-2 mx-auto">
            <Package className="w-6 h-6 text-white" />
          </div>
          <CardTitle className="text-3xl font-bold text-center">StockFlow</CardTitle>
          <CardDescription className="text-center text-base">
            Sign in to manage project inventory
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  type="email"
                  placeholder="Email"
                  autoComplete="email"
                  className="pl-10 h-12 bg-background/50 border-white/10 focus:border-primary"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Lock className="absolute left-3 top-3 h-5 w-5 text-muted-foreground" />
                <Input
                  type="password"
                  placeholder="Password"
                  autoComplete="current-password"
                  className="pl-10 h-12 bg-slate-50 border-slate-200 focus:border-primary"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
            </div>
            <Button 
              type="submit" 
              className="w-full h-12 text-base font-medium shadow-lg shadow-primary/20" 
              disabled={loading}
            >
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default Login;
