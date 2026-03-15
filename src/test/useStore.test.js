import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../store/useStore';

describe('useStore', () => {
    beforeEach(() => {
        // Reset store before each test
        useStore.setState({
            isSidebarOpen: true,
            isDarkMode: false,
            user: null,
            cart: [],
        });
    });

    describe('UI State', () => {
        it('toggles sidebar', () => {
            const { toggleSidebar, isSidebarOpen } = useStore.getState();
            expect(isSidebarOpen).toBe(true);

            toggleSidebar();
            expect(useStore.getState().isSidebarOpen).toBe(false);

            toggleSidebar();
            expect(useStore.getState().isSidebarOpen).toBe(true);
        });

        it('toggles dark mode', () => {
            const { toggleDarkMode, isDarkMode } = useStore.getState();
            expect(isDarkMode).toBe(false);

            toggleDarkMode();
            expect(useStore.getState().isDarkMode).toBe(true);
        });
    });

    describe('User State', () => {
        it('sets user', () => {
            const { setUser } = useStore.getState();
            const testUser = { id: '123', email: 'test@example.com' };

            setUser(testUser);
            expect(useStore.getState().user).toEqual(testUser);
        });

        it('clears user', () => {
            const { setUser } = useStore.getState();
            setUser({ id: '123' });

            setUser(null);
            expect(useStore.getState().user).toBeNull();
        });
    });

    describe('Cart State', () => {
        const mockProduct = {
            id: 'prod-1',
            name: 'Test Product',
            price: 100,
            stock: 10,
        };

        it('adds product to cart', () => {
            const { addToCart } = useStore.getState();

            addToCart(mockProduct);

            const cart = useStore.getState().cart;
            expect(cart).toHaveLength(1);
            expect(cart[0]).toMatchObject({
                ...mockProduct,
                cartQuantity: 1,
            });
        });

        it('increments quantity when adding existing product', () => {
            const { addToCart } = useStore.getState();

            addToCart(mockProduct);
            addToCart(mockProduct);

            const cart = useStore.getState().cart;
            expect(cart).toHaveLength(1);
            expect(cart[0].cartQuantity).toBe(2);
        });

        it('removes product from cart', () => {
            const { addToCart, removeFromCart } = useStore.getState();

            addToCart(mockProduct);
            removeFromCart(mockProduct.id);

            expect(useStore.getState().cart).toHaveLength(0);
        });

        it('updates cart quantity', () => {
            const { addToCart, updateCartQuantity } = useStore.getState();

            addToCart(mockProduct);
            updateCartQuantity(mockProduct.id, 5);

            expect(useStore.getState().cart[0].cartQuantity).toBe(5);
        });

        it('clears cart', () => {
            const { addToCart, clearCart } = useStore.getState();

            addToCart(mockProduct);
            addToCart({ ...mockProduct, id: 'prod-2' });

            clearCart();

            expect(useStore.getState().cart).toHaveLength(0);
        });
    });
});
