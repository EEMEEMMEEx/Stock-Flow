import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const AuthContext = createContext({});

// Canonical All Permissions list for Admin bypass
export const ALL_CANONICAL_PERMISSIONS = [
  'dashboard.view',
  'projects.view', 'projects.create', 'projects.update', 'projects.delete',
  'items.view', 'items.create', 'items.update', 'items.delete', 'items.transfer', 'items.adjust_stock',
  'stock_in.view', 'stock_in.create',
  'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete',
  'checkouts.view', 'checkouts.create', 'checkouts.return', 'checkouts.extend',
  'history.view',
  'reports.view', 'reports.export',
  'users.view', 'users.create', 'users.update', 'users.deactivate', 'users.reset_password', 'users.delete',
  'roles.view', 'roles.create', 'roles.update', 'roles.delete', 'roles.manage_permissions',
  'settings.view', 'settings.update'
];

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

  // Listen for real-time RBAC updates (role_permissions, roles, profiles) for current user
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`realtime_auth_rbac_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'role_permissions' },
        () => {
          fetchProfile(user);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'roles' },
        () => {
          fetchProfile(user);
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` },
        () => {
          fetchProfile(user);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fetchProfile = async (userObj) => {
    if (!userObj) return;
    try {
      const userId = userObj.id;
      
      // Step A: Safely fetch user profile directly
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

      // Step C: Resolve role record and synchronize role_id
      if (data) {
        try {
          let roleData = null;
          if (data.role_id) {
            const { data: rd } = await supabase
              .from('roles')
              .select('*')
              .eq('id', data.role_id)
              .maybeSingle();
            roleData = rd;
          }
          
          // If role_id was not set or not found, lookup by role code string
          if (!roleData && data.role) {
            const searchCode = (data.role || 'staff').toUpperCase().trim();
            let targetCodes = [searchCode];
            if (['STAFF', 'OPERATOR', 'REQUESTER'].includes(searchCode)) {
              targetCodes = ['STAFF', 'OPERATOR', 'REQUESTER'];
            } else if (['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(searchCode)) {
              targetCodes = ['SUPERVISOR', 'APPROVER', 'MANAGER'];
            } else if (['ADMIN', 'ADMINISTRATOR'].includes(searchCode)) {
              targetCodes = ['ADMIN', 'ADMINISTRATOR'];
            }

            const { data: rd } = await supabase
              .from('roles')
              .select('*')
              .in('code', targetCodes)
              .limit(1)
              .maybeSingle();
            roleData = rd;

            // Auto-backfill role_id on profile in background
            if (roleData?.id && !data.role_id) {
              data.role_id = roleData.id;
              supabase.from('profiles').update({ role_id: roleData.id }).eq('id', userId).then();
            }
          }

          if (roleData) {
            data.roles = roleData;
          }
        } catch (e) {
          console.warn('Error resolving role metadata:', e);
        }
      }

      setProfile(data);

      // Step D: Determine role code & admin status
      const roleStr = (data?.role || '').toLowerCase();
      const roleCode = (data?.roles?.code || '').toUpperCase();
      const isSuperAdmin = (userObj.email || '').toLowerCase() === 'admin@stockflow.com' || roleCode === 'SUPER';
      const isUserAdmin = isSuperAdmin || roleStr === 'admin' || roleCode === 'ADMIN';

      // Step E: Fetch dynamic permissions (Configured Permissions Matrix)
      await fetchPermissions(userId, data, isSuperAdmin);

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
      setPermissions(ALL_CANONICAL_PERMISSIONS);
      return;
    }

    // Step 1: Try database RPC get_user_permissions
    try {
      const { data, error } = await supabase.rpc('get_user_permissions', { p_user_id: userId });
      if (!error && Array.isArray(data)) {
        // Enforce exact permissions from database (even if empty array [])
        setPermissions(data.map(p => p.permission_code || p.code || p).filter(Boolean));
        return;
      }
    } catch (e) {
      console.warn('RPC get_user_permissions call error, attempting direct table query:', e);
    }

    // Step 2: Resilient direct query on role_permissions joined with permissions
    try {
      const roleId = profileData?.role_id || profileData?.roles?.id;
      let query = supabase.from('role_permissions').select('permissions(code)');
      
      if (roleId) {
        query = query.eq('role_id', roleId);
      } else {
        const searchCode = (profileData?.role || 'staff').toUpperCase().trim();
        let targetCodes = [searchCode];
        if (['STAFF', 'OPERATOR', 'REQUESTER'].includes(searchCode)) {
          targetCodes = ['STAFF', 'OPERATOR', 'REQUESTER'];
        } else if (['SUPERVISOR', 'APPROVER', 'MANAGER'].includes(searchCode)) {
          targetCodes = ['SUPERVISOR', 'APPROVER', 'MANAGER'];
        } else if (['ADMIN', 'ADMINISTRATOR'].includes(searchCode)) {
          targetCodes = ['ADMIN', 'ADMINISTRATOR'];
        }

        const { data: rData } = await supabase
          .from('roles')
          .select('id')
          .in('code', targetCodes)
          .limit(1)
          .maybeSingle();

        if (rData?.id) {
          query = query.eq('role_id', rData.id);
        }
      }

      const { data: rpData, error: rpErr } = await query;
      if (!rpErr && Array.isArray(rpData)) {
        const extractedCodes = rpData
          .map(r => r.permissions?.code)
          .filter(Boolean);
        setPermissions(extractedCodes);
        return;
      }
    } catch (directErr) {
      console.warn('Direct role_permissions table query failed:', directErr);
    }

    // Step 3: Minimal fallback permissions ONLY if database is completely offline/unreachable
    const roleStr = (profileData?.role || 'staff').toLowerCase();
    if (roleStr === 'supervisor') {
      setPermissions([
        'dashboard.view', 'projects.view', 'items.view', 'items.adjust_stock', 'stock_in.view',
        'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete',
        'checkouts.view', 'checkouts.create', 'checkouts.return', 'checkouts.extend',
        'history.view', 'reports.view', 'reports.export'
      ]);
    } else {
      setPermissions([
        'dashboard.view', 'projects.view', 'items.view', 'stock_in.view',
        'withdrawals.view', 'withdrawals.create', 'withdrawals.complete',
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

  // Strict Permission authorization helper
  const can = (permCode) => {
    if (!permCode) return true; // Public / unrestricted route for all logged-in active users
    if (!profile || profile.status === 'inactive') return false;
    if (isUserEmailAdmin || isAdmin) return true; // Admin bypass
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
