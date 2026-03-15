import { create } from 'zustand';

export const useStore = create((set) => ({
    // UI State
    isSidebarOpen: true,
    toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
    isDarkMode: false, // Default to light, can check system pref later
    toggleDarkMode: () => set((state) => {
        const newMode = !state.isDarkMode;
        if (newMode) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        return { isDarkMode: newMode };
    }),

    // User State
    user: null,
    setUser: (user) => set({ user }),

    // Cart State
    cart: [],
    addToCart: (product) => set((state) => {
        const existing = state.cart.find((item) => item.id === product.id);
        if (existing) {
            return {
                cart: state.cart.map((item) =>
                    item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item
                ),
            };
        }
        return { cart: [...state.cart, { ...product, cartQuantity: 1 }] };
    }),
    removeFromCart: (productId) => set((state) => ({
        cart: state.cart.filter((item) => item.id !== productId),
    })),
    updateCartQuantity: (productId, quantity) => set((state) => ({
        cart: state.cart.map((item) =>
            item.id === productId ? { ...item, cartQuantity: quantity } : item
        ),
    })),
    clearCart: () => set({ cart: [] }),
}));
