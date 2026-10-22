import { useEffect, useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  ShoppingBag,
  UserRound,
  Heart,
  Search,
  Menu,
  Minus,
  Plus,
  Trash2,
  Truck,
  Leaf,
  ShieldCheck,
  ArrowUpRight,
} from 'lucide-react';
import { useApp } from '../lib/store';
import { api, money } from '../lib/api';
import { Modal, ProductImage } from './UI';
export function Newsletter() {
  const [email, setEmail] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api<{ message: string }>('/newsletter', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setMessage(r.message);
      setError(false);
      setEmail('');
    } catch (e) {
      setMessage((e as Error).message);
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="newsletter">
      <div>
        <span className="eyebrow">A considered inbox</span>
        <h2>Good things, occasionally.</h2>
        <p>New collections, thoughtful ideas, and a little inspiration for home.</p>
      </div>
      <form onSubmit={submit}>
        <label className="sr-only" htmlFor="newsletter-email">
          Email address
        </label>
        <div className="newsletter-field">
          <input
            id="newsletter-email"
            type="email"
            placeholder="Your email address"
            value={email}
            required
            maxLength={254}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button aria-label="Subscribe to newsletter" disabled={busy}>
            {busy ? '…' : <ArrowRight size={22} />}
          </button>
        </div>
        {message && (
          <p className={error ? 'error-message' : 'success-message'} role="status">
            {message}
          </p>
        )}
        <small>
          By subscribing, you agree to our <Link to="/privacy">privacy policy</Link>.
        </small>
      </form>
    </section>
  );
}
export function TrustBar() {
  return (
    <div className="trust-bar">
      <div>
        <Truck />
        <span>
          <strong>A little less to worry about</strong>
          <small>Free standard shipping on orders $150+</small>
        </span>
      </div>
      <div>
        <Leaf />
        <span>
          <strong>Made for everyday living</strong>
          <small>Thoughtful pieces, considered details</small>
        </span>
      </div>
      <div>
        <ShieldCheck />
        <span>
          <strong>Shop with confidence</strong>
          <small>Clear pricing and secure account access</small>
        </span>
      </div>
    </div>
  );
}
function CartDrawer() {
  const { cart, setOpenCart, refreshCart, notify } = useApp();
  const [busy, setBusy] = useState<number | null>(null);
  async function change(id: number, quantity: number) {
    setBusy(id);
    try {
      await api('/cart/' + id, {
        method: quantity ? 'PATCH' : 'DELETE',
        body: quantity ? JSON.stringify({ quantity }) : undefined,
      });
      await refreshCart();
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setBusy(null);
    }
  }
  return (
    <Modal title="Your shopping bag" className="cart-drawer" onClose={() => setOpenCart(false)}>
      {cart.items.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag size={38} />
          <h3>Your bag has a little room.</h3>
          <p>Find something that feels like home.</p>
          <Link to="/shop" onClick={() => setOpenCart(false)} className="button">
            Explore the collection
          </Link>
        </div>
      ) : (
        <>
          <div className="drawer-items">
            {cart.items.map(({ product, quantity }) => (
              <div className="drawer-item" key={product.id}>
                <ProductImage src={product.images[0]} alt={product.name} />
                <div>
                  <Link to={'/product/' + product.slug} onClick={() => setOpenCart(false)}>
                    <strong>{product.name}</strong>
                  </Link>
                  <p>{money(product.price)}</p>
                  <div className="quantity">
                    <button
                      disabled={busy === product.id}
                      aria-label={'Decrease ' + product.name + ' quantity'}
                      onClick={() => change(product.id, quantity - 1)}
                    >
                      <Minus size={13} />
                    </button>
                    <span>{quantity}</span>
                    <button
                      disabled={busy === product.id || quantity >= product.stock}
                      aria-label={'Increase ' + product.name + ' quantity'}
                      onClick={() => change(product.id, quantity + 1)}
                    >
                      <Plus size={13} />
                    </button>
                  </div>
                </div>
                <button
                  className="icon-button"
                  disabled={busy === product.id}
                  aria-label={'Remove ' + product.name}
                  onClick={() => change(product.id, 0)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
          <div className="drawer-summary">
            <div>
              <span>Subtotal</span>
              <strong>{money(cart.subtotal)}</strong>
            </div>
            <p className="muted">Shipping and demo tax calculated at checkout.</p>
            <Link to="/checkout" onClick={() => setOpenCart(false)} className="button">
              Continue to checkout <ArrowRight size={17} />
            </Link>
            <Link to="/cart" onClick={() => setOpenCart(false)} className="text-link">
              View shopping bag
            </Link>
          </div>
        </>
      )}
    </Modal>
  );
}
export function Layout() {
  const { user, cart, openCart, setOpenCart, error } = useApp();
  const [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState('');
  const location = useLocation(),
    navigate = useNavigate();
  useEffect(() => {
    setMobile(false);
    setSearch(false);
    window.scrollTo(0, 0);
  }, [location.pathname]);
  const nav = (
    <>
      <NavLink to="/" end>
        Home
      </NavLink>
      <NavLink to="/shop">Shop</NavLink>
      <NavLink to="/blog">Journal</NavLink>
      <NavLink to="/contact">Our story</NavLink>
    </>
  );
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="announcement">
        <span>Local demo marketplace · No real charges</span>
        <Link to="/shop">
          Discover the collection <ArrowRight size={13} />
        </Link>
      </div>
      <header className="site-header">
        <div className="header-inner">
          <button
            className="icon-button mobile-toggle"
            aria-label="Open navigation"
            onClick={() => setMobile(true)}
          >
            <Menu />
          </button>
          <Link to="/" className="wordmark" aria-label="3legant home">
            3legant<span>.</span>
          </Link>
          <nav className="desktop-nav" aria-label="Main navigation">
            {nav}
          </nav>
          <div className="header-actions">
            <button
              className="icon-button"
              aria-label="Search products"
              onClick={() => setSearch(true)}
            >
              <Search size={21} />
            </button>
            <Link
              className="icon-button account-icon"
              to={user ? '/account' : '/sign-in'}
              aria-label={user ? 'My account' : 'Sign in'}
            >
              <UserRound size={21} />
            </Link>
            <Link className="icon-button wishlist-icon" to="/wishlist" aria-label="Wishlist">
              <Heart size={21} />
            </Link>
            <button
              className="icon-button bag-button"
              aria-label={
                'Shopping bag, ' + cart.items.reduce((n, i) => n + i.quantity, 0) + ' items'
              }
              onClick={() => setOpenCart(true)}
            >
              <ShoppingBag size={21} />
              <span>{cart.items.reduce((n, i) => n + i.quantity, 0)}</span>
            </button>
          </div>
        </div>
      </header>
      {error && (
        <div className="connection-error" role="alert">
          We couldn't connect to the shop: {error}. Please refresh when the server is available.
        </div>
      )}
      <main id="main-content">
        <Outlet />
      </main>
      <Newsletter />
      <footer className="site-footer">
        <div className="footer-top">
          <div>
            <Link className="wordmark" to="/">
              3legant<span>.</span>
            </Link>
            <p>
              Less, but better.
              <br />
              Objects for the way you live.
            </p>
          </div>
          <div>
            <h3>Make yourself at home</h3>
            <Link to="/shop">Shop all pieces</Link>
            <Link to="/blog">The journal</Link>
            <Link to="/contact">Our story & contact</Link>
          </div>
          <div>
            <h3>Your corner</h3>
            <Link to="/account">My account</Link>
            <Link to="/orders">My orders</Link>
            <Link to="/wishlist">Saved pieces</Link>
            {user?.role === 'seller' && <Link to="/seller">Seller studio</Link>}
            {user?.role === 'admin' && <Link to="/admin">Administration</Link>}
          </div>
          <div>
            <h3>Have a question?</h3>
            <p>
              We’re happy to help you
              <br />
              find your next favorite.
            </p>
            <Link className="footer-contact" to="/contact">
              Let’s talk <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} 3legant. A local demo marketplace.</span>
          <div>
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <span>USD $</span>
          </div>
        </div>
      </footer>
      {openCart && <CartDrawer />}
      {mobile && (
        <Modal
          title="Make yourself at home"
          onClose={() => setMobile(false)}
          className="mobile-menu"
        >
          <nav aria-label="Mobile navigation">
            {nav}
            <Link to={user ? '/account' : '/sign-in'}>My account</Link>
            <Link to="/wishlist">Saved pieces</Link>
          </nav>
        </Modal>
      )}
      {search && (
        <Modal title="Find your next favorite" onClose={() => setSearch(false)}>
          <form
            className="search-modal-form"
            onSubmit={(e) => {
              e.preventDefault();
              navigate('/shop?q=' + encodeURIComponent(query));
              setSearch(false);
            }}
          >
            <label className="field">
              Search the collection
              <input
                autoFocus
                type="search"
                placeholder="Try a chair, lamp, or vase…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <button className="button">
              Search products <Search size={17} />
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
