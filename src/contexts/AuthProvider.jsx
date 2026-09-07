import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './AuthContext';

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [assignedProjectIds, setAssignedProjectIds] = useState([]);
  const [allProjectsAccess, setAllProjectsAccess] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userObj) => {
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

      // Step B: Auto-create profile ONLY if genuinely missing from DB (default to staff)
      if (!data) {
        const defaultName = userObj.email ? userObj.email.split('@')[0] : 'User';
        const { data: created, error: createError } = await supabase
          .from('profiles')
          .upsert([{ id: userId, full_name: defaultName, role: 'staff', status: 'active' }])
          .select('*')
          .maybeSingle();
          
        if (!createError) data = created;
      }

      // Check if user account is inactive or suspended (immediately revoke and sign out)
      if (data && (data.status === 'inactive' || data.status === 'suspended')) {
        setProfile(data);
        setPermissions([]);
        setLoading(false);
        try {
          await supabase.auth.signOut();
        } catch (signOutErr) {
          console.warn('[AuthContext] Forced sign-out error:', signOutErr);
        }
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
          
          if (!roleData && data.role) {
            const searchCode = data.role.toUpperCase().trim();
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
          }

          if (roleData) {
            data.roles = roleData;
            if (data.role_id !== roleData.id) {
              await supabase
                .from('profiles')
                .update({ role_id: roleData.id })
                .eq('id', userId);
              data.role_id = roleData.id;
            }
          }
        } catch (roleSyncErr) {
          console.warn('Role metadata resolution error:', roleSyncErr);
        }
      }

      // Step D: Fetch Project Assignments for user
      try {
        const { data: assignments, error: assignError } = await supabase
          .from('user_project_assignments')
          .select('project_id')
          .eq('user_id', userId);

        if (!assignError && assignments) {
          const pIds = assignments.map(a => a.project_id);
          setAssignedProjectIds(pIds);
          
          // Determine if user has global access
          const isRoleAdmin = (data?.role || '').toLowerCase() === 'admin';
          const isSuper = (data?.role || '').toLowerCase() === 'super' || (userObj.email || '').toLowerCase() === 'admin@stockflow.com';
          const hasSpecificAssignments = pIds.length > 0;
          
          if (data?.all_projects !== undefined) {
            setAllProjectsAccess(data.all_projects);
          } else {
            setAllProjectsAccess(isSuper || isRoleAdmin || !hasSpecificAssignments);
          }
        } else {
          setAssignedProjectIds([]);
          setAllProjectsAccess(true);
        }
      } catch (assignCatch) {
        console.warn('Project assignments query error:', assignCatch);
        setAssignedProjectIds([]);
        setAllProjectsAccess(true);
      }

      setProfile(data);
      if (data) {
        await fetchUserPermissions(userId, data);
      }
    } catch (e) {
      console.error('Error fetching profile:', e);
    } finally {
      setLoading(false);
    }
  }, []);

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
  }, [fetchProfile]);

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
  }, [user, fetchProfile]);

  // Query Database Live Role Permissions (Fail-Closed)
  const fetchUserPermissions = async (userId, userProfile) => {
    try {
      // Step 1: Query authorized permissions via database RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('get_my_permissions');
      if (!rpcErr && Array.isArray(rpcData) && rpcData.length > 0) {
        setPermissions(rpcData);
        return;
      }
    } catch (rpcCatch) {
      console.warn('RPC get_my_permissions not available:', rpcCatch);
    }

    try {
      // Step 2: Direct lookup from role_permissions using role_id
      let query = supabase
        .from('role_permissions')
        .select('permission_id, permissions!inner(code)');

      if (userProfile?.role_id) {
        query = query.eq('role_id', userProfile.role_id);
      } else {
        const searchCode = (userProfile?.role || 'staff').toUpperCase().trim();
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

    // Step 3: Fail-Closed Authorization
    console.warn('[AuthContext] Permissions could not be verified from database. Defaulting to Fail-Closed (empty permissions).');
    setPermissions([]);
  };

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => supabase.auth.signOut();

  const isUserEmailAdmin = (user?.email || '').toLowerCase() === 'admin@stockflow.com';
  const roleCode = profile?.roles?.code || (profile?.role ? profile.role.toUpperCase() : 'STAFF');
  const isSuperAdmin = isUserEmailAdmin || roleCode === 'SUPER';
  const isAdmin = isSuperAdmin || roleCode === 'ADMIN' || (profile?.role || '').toLowerCase() === 'admin';
  const isActive = profile?.status === 'active';

  // Strict Permission authorization helper (Fail-Closed)
  const can = (permCode) => {
    if (!profile || profile.status !== 'active') return false;
    if (!permCode) return true; // Public / unrestricted route for all logged-in active users
    if (isSuperAdmin) return true; // Super Admin master bypass ONLY
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
      isSuperAdmin,
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
