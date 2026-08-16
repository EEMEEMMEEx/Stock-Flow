import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [assignedProjectIds, setAssignedProjectIds] = useState([]);
  const [allProjectsAccess, setAllProjectsAccess] = useState(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user);
      else setLoading(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user);
      else {
        setProfile(null);
        setPermissions([]);
        setAssignedProjectIds([]);
        setAllProjectsAccess(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userObj) => {
    if (!userObj) return;
    try {
      const userId = userObj.id;
      
      // Step A: Safely fetch user profile directly without join syntax that fails if roles relation is missing
      let { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error selecting profile:', error);
      }

      // Step B: Auto-create profile ONLY if genuinely missing from DB
      if (!data) {
        const defaultName = userObj.email ? userObj.email.split('@')[0] : 'User';
        const defaultRole = (userObj.email && userObj.email.toLowerCase() === 'admin@stockflow.com') ? 'admin' : 'staff';
        const { data: created, error: createError } = await supabase
          .from('profiles')
          .upsert([{ id: userId, full_name: defaultName, role: defaultRole, status: 'active' }])
          .select('*')
          .maybeSingle();
          
        if (!createError) data = created;
      }

      // Check if user account is inactive
      if (data && data.status === 'inactive') {
        setProfile(data);
        setPermissions([]);
        setLoading(false);
        return;
      }

      // Step C: Try fetching role record from roles table if role_id is present
      if (data && data.role_id) {
        try {
          const { data: roleData } = await supabase
            .from('roles')
            .select('*')
            .eq('id', data.role_id)
            .maybeSingle();
          if (roleData) {
            data.roles = roleData;
          }
        } catch (e) {}
      }

      setProfile(data);

      // Step D: Determine role code & admin status
      const roleStr = (data?.role || '').toLowerCase();
      const roleCode = (data?.roles?.code || '').toUpperCase();
      const isUserAdmin = roleStr === 'admin' || roleCode === 'ADMIN';

      // Step E: Fetch permissions
      await fetchPermissions(userId, data, isUserAdmin);

      // Step F: Set project access
      if (isUserAdmin) {
        setAllProjectsAccess(true);
        setAssignedProjectIds([]);
      } else {
        const { data: assignments } = await supabase
          .from('user_project_assignments')
          .select('project_id')
          .eq('user_id', userId);

        if (assignments && assignments.length > 0) {
          setAllProjectsAccess(false);
          setAssignedProjectIds(assignments.map(a => a.project_id));
        } else {
          setAllProjectsAccess(true);
          setAssignedProjectIds([]);
        }
      }
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchPermissions = async (userId, profileData, isUserAdmin) => {
    // If admin, grant all permissions immediately
    if (isUserAdmin) {
      setPermissions([
        'dashboard.view', 'projects.view', 'projects.create', 'projects.update', 'projects.delete',
        'items.view', 'items.create', 'items.update', 'items.delete',
        'stock_in.view', 'stock_in.create',
        'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete',
        'history.view', 'reports.view', 'reports.export',
        'users.view', 'users.create', 'users.update', 'users.deactivate', 'users.reset_password',
        'roles.view', 'roles.create', 'roles.update', 'roles.delete', 'roles.manage_permissions',
        'settings.view', 'settings.update'
      ]);
      return;
    }

    try {
      const { data, error } = await supabase.rpc('get_user_permissions', { p_user_id: userId });
      if (!error && Array.isArray(data) && data.length > 0) {
        setPermissions(data.map(p => p.permission_code || p.code || p));
        return;
      }
    } catch (e) {
      // Fallback mode if migration 09 not yet executed
    }

    // Fallback permissions based on role string
    const roleStr = (profileData?.role || 'staff').toLowerCase();
    if (roleStr === 'supervisor') {
      setPermissions([
        'dashboard.view', 'projects.view', 'items.view', 'stock_in.view',
        'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject',
        'checkouts.view', 'checkouts.create', 'checkouts.return',
        'history.view', 'reports.view', 'reports.export'
      ]);
    } else {
      setPermissions([
        'dashboard.view', 'projects.view', 'items.view', 'stock_in.view',
        'withdrawals.view', 'withdrawals.create',
        'checkouts.view', 'checkouts.create', 'checkouts.return',
        'history.view'
      ]);
    }
  };

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  const isUserEmailAdmin = (user?.email || '').toLowerCase() === 'admin@stockflow.com';
  const roleCode = profile?.roles?.code || (profile?.role ? profile.role.toUpperCase() : 'STAFF');
  const isAdmin = isUserEmailAdmin || roleCode === 'ADMIN' || (profile?.role || '').toLowerCase() === 'admin';
  const isActive = profile?.status === 'active';

  // Permission authorization helper
  const can = (permCode) => {
    if (!permCode) return true; // Public / unrestricted route for all logged-in active users
    if (isUserEmailAdmin || isAdmin) return true; // Admin bypass
    if (!profile || profile.status === 'inactive') return false;
    return permissions.includes(permCode);
  };



  const canAny = (permCodes = []) => permCodes.some(code => can(code));
  const canAll = (permCodes = []) => permCodes.every(code => can(code));

  return (
    <AuthContext.Provider value={{ 
      user, 
      profile, 
      loading, 
      signIn, 
      signOut, 
      isAdmin, 
      isActive,
      permissions,
      can,
      canAny,
      canAll,
      assignedProjectIds,
      allProjectsAccess,
      mustChangePassword: profile?.must_change_password === true,
      refreshProfile: () => fetchProfile(user)
    }}>

      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  return useContext(AuthContext);
};

