import React, { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { auth, db } from '../lib/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';

import { useStore } from '../store/useStore';

const ProtectedRoute = () => {
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);
    const { setUser } = useStore();

    useEffect(() => {
        const unsubscribe = auth.onAuthStateChanged(async (user) => {
            if (user) {
                try {
                    // Check user status in Firestore
                    const userDoc = await getDoc(doc(db, 'users', user.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();

                        // If pending, user shouldn't access protected routes
                        // But we verify this AFTER setting session to avoid duplicate redirects
                        // Or we can handle it here by NOT setting session if pending?
                        // Better: set session but handle redirect logic below
                        // Auto-approve hardcoded admin email
                        if (user.email === 'watchara.m@forth.co.th' && (userData.status === 'pending' || userData.role !== 'admin')) {
                            userData.status = 'active';
                            userData.role = 'admin';
                            // Attempt to update Firestore permanently
                            try {
                                await updateDoc(doc(db, 'users', user.uid), {
                                    status: 'active',
                                    role: 'admin'
                                });
                            } catch (e) {
                                console.warn("Auto-approve update failed, but allowing access", e);
                            }
                        }

                        if (userData.status === 'pending') {
                            // We will handle redirect in rendering logic
                            user.status = 'pending';
                        }
                        setUser({ ...user, ...userData });
                    } else {
                        // User in Auth but not in DB? 
                        // Auto-create document to make them visible to Admin
                        const isAdminAccount = user.email === 'watchara.m@forth.co.th';
                        const newUserData = {
                            uid: user.uid,
                            email: user.email,
                            full_name: user.displayName || '',
                            role: isAdminAccount ? 'admin' : 'viewer',
                            status: isAdminAccount ? 'active' : 'pending',
                            created_at: serverTimestamp(),
                            last_sign_in: serverTimestamp()
                        };
                        
                        try {
                            await setDoc(doc(db, 'users', user.uid), newUserData);
                            // Set status on user object for immediate redirect handling
                            user.status = newUserData.status;
                            setUser({ ...user, ...newUserData });
                        } catch (e) {
                            console.error("Auto-create user doc failed:", e);
                            user.status = 'pending';
                            setUser({ ...user, status: 'pending' });
                        }
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                    // Fallback to basic auth user
                    // Fallback to basic auth user but deny access if error
                    user.status = 'pending'; // Fail safe
                    setUser(user);
                }
            } else {
                setUser(null);
            }
            setSession(user);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [setUser]);

    if (loading) {
        return <div className="flex items-center justify-center h-screen">Loading...</div>;
    }

    if (!session) {
        return <Navigate to="/login" replace />;
    }

    // Check for pending status
    if (session && (session.status === 'pending' || (useStore.getState().user?.status === 'pending'))) {
        return <Navigate to="/pending" replace />;
    }

    return <Outlet />;
};

export default ProtectedRoute;
