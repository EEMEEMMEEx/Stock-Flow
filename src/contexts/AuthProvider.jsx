import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { AuthContext } from './AuthContext';

// Helper: Run promise with timeout
const withTimeout = (promise, ms = 4000) => {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('REQUEST_TIMEOUT')), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

// Safe Baseline Role Fallback Permissions (Prevents lockout when API/Network glitched)
const getSafeBaselinePermissions = (roleStr, emailStr = '') => {
  const normalizedRole = (roleStr || 'staff').toLowerCase().trim();
  const isSuperOrAdmin = normalizedRole === 'super' || normalizedRole === 'admin' || (emailStr || '').toLowerCase() === 'admin@stockflow.com';

  if (isSuperOrAdmin) {
    return [
      'dashboard.view', 'items.view', 'items.create', 'items.update', 'items.delete', 'items.adjust_stock', 'items.transfer',
      'stock_in.view', 'stock_in.create', 'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete',
      'checkouts.view', 'checkouts.create', 'checkouts.extend', 'checkouts.return', 'history.view', 'reports.view', 'reports.export',
      'projects.view', 'projects.create', 'projects.update', 'projects.delete', 'users.view', 'users.create', 'users.update', 'users.deactivate', 'users.reset_password',
      'roles.view', 'roles.create', 'roles.update', 'roles.delete', 'roles.manage_permissions', 'settings.view', 'settings.update'
    ];
  }
  if (['supervisor', 'approver', 'manager'].includes(normalizedRole)) {
    return [
      'dashboard.view', 'items.view', 'stock_in.view', 'withdrawals.view', 'withdrawals.create', 'withdrawals.approve', 'withdrawals.reject', 'withdrawals.complete',
      'checkouts.view', 'checkouts.create', 'checkouts.extend', 'checkouts.return', 'history.view', 'reports.view', 'reports.export', 'projects.view'
    ];
  }
  return [
    'dashboard.view', 'items.view', 'stock_in.view', 'withdrawals.view', 'withdrawals.create',
    'checkouts.view', 'history.view', 'projects.view'
  ];
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState([]);
  const [assignedProjectIds, setAssignedProjectIds] = useState([]);
  const [allProjectsAccess, setAllProjectsAccess] = useState(true);
  const [loading, setLoading] = useState(true);

  // Caching & Concurrency Control Refs (Step 4 & Request Storm Prevention)
  const permissionsCacheRef = useRef(new Map());
  const inFlightFetchRef = useRef(false);
  const hasLoggedProfileErrorRef = useRef(false);
  const hasLoggedPermFailureRef = useRef(false);
  const realtimeDebounceTimerRef = useRef(null);

  // Step 2 & 3: Query live permissions via get_my_permissions / role_permissions with exponential backoff
  const queryLivePermissionsWithBackoff = useCallback(async (userId, userProfile) => {
    const roleId = userProfile?.role_id || userProfile?.roles?.id;
    const roleCode = (userProfile?.roles?.code || userProfile?.role || 'staff').toUpperCase().trim();
    const detectedRole = (userProfile?.role || roleCode).toLowerCase();
    const maxAttempts = 3;
    const backoffDelays = [500, 1000, 2000];

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        let rpcData = null;
        let rpcErr = null;

        // 1a. Try get_my_permissions RPC (alias for get_user_permissions(auth.uid()))
        try {
          const resMy = await withTimeout(supabase.rpc('get_my_permissions'), 3500);
          if (!resMy.error && Array.isArray(resMy.data) && resMy.data.length > 0) {
            rpcData = resMy.data;
          } else if (resMy.error) {
            rpcErr = resMy.error;
          }
        } catch {
          // RPC timeout or network error, proceed to fallback
        }

        // 1b. If get_my_permissions didn't return data, try get_user_permissions(userId)
        if ((!rpcData || rpcData.length === 0) && userId) {
          try {
            const resUser = await withTimeout(supabase.rpc('get_user_permissions', { p_user_id: userId }), 3500);
            if (!resUser.error && Array.isArray(resUser.data) && resUser.data.length > 0) {
              rpcData = resUser.data;
              rpcErr = null;
            }
          } catch {
            // RPC timeout, proceed to direct role_permissions table lookup
          }
        }

        // Extract permission codes from RPC result
        if (Array.isArray(rpcData) && rpcData.length > 0) {
          const codes = rpcData
            .map(r => (typeof r === 'string' ? r : r?.permission_code || r?.code))
            .filter(Boolean);
          if (codes.length > 0) {
            return codes;
          }
        }

        // 1c. Direct lookup from role_permissions using role_id
        if (roleId) {
          const rpRes = await withTimeout(
            supabase
              .from('role_permissions')
              .select('permissions!inner(code)')
              .eq('role_id', roleId),
            3500
          );

          if (!rpRes.error && Array.isArray(rpRes.data) && rpRes.data.length > 0) {
            const codes = rpRes.data.map(r => r.permissions?.code).filter(Boolean);
            if (codes.length > 0) {
              return codes;
            }
          }
        }
      } catch (err) {
        // Log failure once on unexpected exceptions
        if (attempt === maxAttempts && !hasLoggedPermFailureRef.current) {
          console.warn('[AuthContext] Live permissions attempt failed:', err?.message || err);
        }
      }

      // Exponential backoff before next attempt
      if (attempt < maxAttempts) {
        await new Promise(res => setTimeout(res, backoffDelays[attempt - 1]));
      }
    }

    // Step 3: Endpoint unreachable or timed out after max attempts
    // Log failure ONCE and apply safe baseline permissions
    if (!hasLoggedPermFailureRef.current) {
      console.warn(`[AuthContext] Live permissions endpoint unreachable after ${maxAttempts} attempts. Applying safe baseline permissions for role: ${detectedRole}`);
      hasLoggedPermFailureRef.current = true;
    }

    return getSafeBaselinePermissions(detectedRole, user?.email);
  }, [user]);

  // Step 1: Fetch user's profile and role (Single Request) + Session Cache (Step 4)
  const fetchProfile = useCallback(async (userObj, forceRefresh = false) => {
    if (!userObj) return;

    // Concurrency Lock: Prevent simultaneous fetch requests from creating request storms
    if (inFlightFetchRef.current) return;
    inFlightFetchRef.current = true;

    try {
      const userId = userObj.id;

      // Single Request: Fetch profile and joined role record in ONE roundtrip
      let { data, error } = await supabase
        .from('profiles')
        .select('*, roles(*)')
        .eq('id', userId)
        .maybeSingle();

      // Log failure once if error occurs (prevents "Error selecting profile" console loops)
      if (error && error.code !== 'PGRST116') {
        if (!hasLoggedProfileErrorRef.current) {
          console.warn('[AuthContext] Profile fetch notice:', error.message || error);
          hasLoggedProfileErrorRef.current = true;
        }
      }

      // Auto-create profile ONLY if missing from DB (default to staff)
      if (!data && !error) {
        const defaultName = userObj.email ? userObj.email.split('@')[0] : 'User';
        const { data: created } = await supabase
          .from('profiles')
          .upsert([{ id: userId, full_name: defaultName, role: 'staff', status: 'active' }])
          .select('*, roles(*)')
          .maybeSingle();
        if (created) data = created;
      }

      // Inactive / Suspended check: Revoke access and sign out
      if (data && (data.status === 'inactive' || data.status === 'suspended')) {
        setProfile(data);
        setPermissions([]);
        setLoading(false);
        try {
          await supabase.auth.signOut();
        } catch {
          // ignore signout errors
        }
        return;
      }

      // Step D: Fetch Project Assignments for user (secondary single query)
      try {
        const { data: assignments } = await withTimeout(
          supabase
            .from('user_project_assignments')
            .select('project_id')
            .eq('user_id', userId),
          3000
        );

        if (assignments && assignments.length > 0) {
          const pIds = assignments.map(a => a.project_id);
          setAssignedProjectIds(pIds);
          const isRoleAdmin = (data?.role || '').toLowerCase() === 'admin';
          const isSuper = (data?.role || '').toLowerCase() === 'super' || (userObj.email || '').toLowerCase() === 'admin@stockflow.com';
          if (data?.all_projects !== undefined) {
            setAllProjectsAccess(data.all_projects);
          } else {
            setAllProjectsAccess(isSuper || isRoleAdmin || pIds.length === 0);
          }
        } else {
          setAssignedProjectIds([]);
          setAllProjectsAccess(true);
        }
      } catch {
        setAssignedProjectIds([]);
        setAllProjectsAccess(true);
      }

      // Step 4: Session Caching for permissions (refetch only on role change or forceRefresh)
      const roleKey = (data?.roles?.code || data?.role || 'STAFF').toUpperCase().trim();
      const cacheKey = `${userId}:${roleKey}`;

      let resolvedPermissions = null;
      if (!forceRefresh && permissionsCacheRef.current.has(cacheKey)) {
        // Use cached permissions for the session (No repeated identical GET requests!)
        resolvedPermissions = permissionsCacheRef.current.get(cacheKey);
      } else {
        // Query live permissions or apply baseline
        resolvedPermissions = await queryLivePermissionsWithBackoff(userId, data);
        if (resolvedPermissions && resolvedPermissions.length > 0) {
          permissionsCacheRef.current.set(cacheKey, resolvedPermissions);
        }
      }

      // Step 5: Proceed only after permissions are resolved
      setPermissions(resolvedPermissions || getSafeBaselinePermissions(data?.role, userObj.email));
      setProfile(data);
    } catch (e) {
      if (!hasLoggedProfileErrorRef.current) {
        console.warn('[AuthContext] General auth error:', e?.message || e);
        hasLoggedProfileErrorRef.current = true;
      }
    } finally {
      inFlightFetchRef.current = false;
      setLoading(false);
    }
  }, [queryLivePermissionsWithBackoff]);

  useEffect(() => {
    // Initial Session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) fetchProfile(session.user);
      else setLoading(false);
    });

    // Listen for Auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        // On explicit sign-in, clear cache to ensure fresh permissions
        if (event === 'SIGNED_IN') {
          permissionsCacheRef.current.clear();
          hasLoggedProfileErrorRef.current = false;
          hasLoggedPermFailureRef.current = false;
        }
        fetchProfile(session.user);
      } else {
        permissionsCacheRef.current.clear();
        setProfile(null);
        setPermissions([]);
        setAssignedProjectIds([]);
        setAllProjectsAccess(true);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Real-time RBAC updates with 1000ms debounce to prevent request storms
  useEffect(() => {
    if (!user) return;

    const debouncedRefresh = () => {
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      realtimeDebounceTimerRef.current = setTimeout(() => {
        permissionsCacheRef.current.clear();
        fetchProfile(user, true);
      }, 1000);
    };

    const channel = supabase
      .channel(`realtime_auth_rbac_${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roles' }, debouncedRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${user.id}` }, debouncedRefresh)
      .subscribe();

    return () => {
      if (realtimeDebounceTimerRef.current) {
        clearTimeout(realtimeDebounceTimerRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [user, fetchProfile]);

  const signIn = (email, password) => supabase.auth.signInWithPassword({ email, password });
  const signOut = () => {
    permissionsCacheRef.current.clear();
    return supabase.auth.signOut();
  };

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
      refreshProfile: () => {
        permissionsCacheRef.current.clear();
        return fetchProfile(user, true);
      }
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};
