import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, setCsrfToken } from './api';
import type { Cart, User, Product } from './types';
const emptyCart: Cart = { items: [], subtotal: 0, shipping: 0, tax: 0, total: 0 };
type Toast = { id: number; message: string; type: string };
interface AppState {
  user: User | null;
  ready: boolean;
  cart: Cart;
  csrfToken: string;
  refreshSession: () => Promise<void>;
  refreshCart: () => Promise<void>;
  addToCart: (id: number, quantity?: number) => Promise<void>;
  notify: (message: string, type?: string) => void;
  toggleWishlist: (id: number, saved?: boolean) => Promise<void>;
  openCart: boolean;
  setOpenCart: (open: boolean) => void;
  error: string;
  wishlistIds: number[];
  refreshWishlist: () => Promise<void>;
}
const Context = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null),
    [ready, setReady] = useState(false),
    [cart, setCart] = useState<Cart>(emptyCart),
    [csrfToken, setToken] = useState(''),
    [openCart, setOpenCart] = useState(false),
    [toasts, setToasts] = useState<Toast[]>([]),
    [error, setError] = useState(''),
    [wishlistIds, setWishlistIds] = useState<number[]>([]);
  const notify = (message: string, type = 'success') => {
    const id = Date.now() + Math.random();
    setToasts((old) => [...old, { id, message, type }]);
    setTimeout(() => setToasts((old) => old.filter((t) => t.id !== id)), 5000);
  };
  async function refreshSession() {
    const data = await api<{ user: User | null; csrfToken: string }>('/auth/session');
    setUser(data.user);
    setCsrfToken(data.csrfToken);
    setToken(data.csrfToken);
    if (data.user) {
      const result = await api<{ products: Product[] }>('/wishlist');
      setWishlistIds(result.products.map((p) => p.id));
    } else setWishlistIds([]);
    setError('');
    setReady(true);
  }
  async function refreshCart() {
    setCart(await api<Cart>('/cart'));
  }
  async function refreshWishlist() {
    if (!user) {
      setWishlistIds([]);
      return;
    }
    const result = await api<{ products: Product[] }>('/wishlist');
    setWishlistIds(result.products.map((p) => p.id));
  }
  useEffect(() => {
    (async () => {
      try {
        await refreshSession();
        await refreshCart();
      } catch (e) {
        setError((e as Error).message);
        setReady(true);
      }
    })();
  }, []);
  async function addToCart(productId: number, quantity = 1) {
    try {
      setCart(
        await api<Cart>('/cart', { method: 'POST', body: JSON.stringify({ productId, quantity }) }),
      );
      notify('Added to your shopping bag.');
    } catch (e) {
      notify((e as Error).message, 'error');
      throw e;
    }
  }
  async function toggleWishlist(id: number, saved = wishlistIds.includes(id)) {
    if (!user) {
      notify('Sign in to save your favorites.', 'error');
      return;
    }
    await api('/wishlist/' + id, { method: saved ? 'DELETE' : 'POST' });
    setWishlistIds((old) =>
      saved ? old.filter((value) => value !== id) : [...new Set([...old, id])],
    );
    notify(saved ? 'Removed from wishlist.' : 'Saved to wishlist.');
  }
  return (
    <Context.Provider
      value={{
        user,
        ready,
        cart,
        csrfToken,
        refreshSession,
        refreshCart,
        addToCart,
        notify,
        toggleWishlist,
        openCart,
        setOpenCart,
        error,
        wishlistIds,
        refreshWishlist,
      }}
    >
      {ready ? (
        children
      ) : (
        <div className="loading-state" role="status">
          Preparing your space…
        </div>
      )}
      <div className="toast-region" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={'toast ' + t.type}
            role={t.type === 'error' ? 'alert' : 'status'}
          >
            {t.message}
            <button
              onClick={() => setToasts((old) => old.filter((item) => item.id !== t.id))}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </Context.Provider>
  );
}
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error('AppProvider is required');
  return value;
}
