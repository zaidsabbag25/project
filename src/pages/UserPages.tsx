import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  Link,
  Navigate,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ArrowRight, Check, LockKeyhole, Package, ShoppingBag, Trash2, Truck } from 'lucide-react';
import { api, date, money } from '../lib/api';
import { useApp } from '../lib/store';
import type { Address, Order, Product, User } from '../lib/types';
import { ProductCard } from '../components/ProductCard';

type AuthMode = 'login' | 'register' | 'forgot' | 'reset';
const blankAddress: Address = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  postalCode: '',
  country: 'United States',
};
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : 'Something went wrong. Please try again.';

function Loading() {
  return (
    <div className="empty-state" role="status">
      Loading your space…
    </div>
  );
}
function ErrorNotice({ message }: { message: string }) {
  return message ? (
    <div className="error-message" role="alert">
      {message}
    </div>
  ) : null;
}
function LoginPrompt({ next = '/account' }: { next?: string }) {
  return (
    <section className="page-shell empty-state">
      <LockKeyhole size={38} />
      <h1>Make yourself at home.</h1>
      <p>Sign in to manage your account and continue shopping.</p>
      <Link className="button" to={'/sign-in?next=' + encodeURIComponent(next)}>
        Sign in <ArrowRight size={16} />
      </Link>
    </section>
  );
}
function AccountNav() {
  const { user, refreshSession, refreshCart, notify, setOpenCart } = useApp();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  async function signOut() {
    setSigningOut(true);
    try {
      await api('/auth/logout', { method: 'POST' });
      await refreshSession();
      await refreshCart();
      setOpenCart(false);
      notify('You have been signed out.');
      navigate('/', { replace: true });
    } catch (e) {
      notify(messageOf(e), 'error');
    } finally {
      setSigningOut(false);
    }
  }
  return (
    <nav className="account-nav" aria-label="Your account">
      <p className="eyebrow">YOUR SPACE</p>
      <h2>{user?.name}</h2>
      <Link to="/account">Account details</Link>
      <Link to="/orders">My orders</Link>
      <Link to="/wishlist">My wishlist</Link>
      {user?.role === 'seller' && <Link to="/seller">Seller studio</Link>}
      {user?.role === 'admin' && <Link to="/admin">Administration</Link>}
      <button type="button" className="button-ghost" disabled={signingOut} onClick={signOut}>
        {signingOut ? 'Signing out…' : 'Sign out'}
      </button>
    </nav>
  );
}
function AccountShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">A LITTLE MORE PERSONAL</p>
        <h1>{title}</h1>
      </div>
      <div className="account-layout">
        <AccountNav />
        <div className="stack">{children}</div>
      </div>
    </section>
  );
}

export function AuthPage({ mode: givenMode }: { mode?: AuthMode }) {
  const location = useLocation(),
    navigate = useNavigate(),
    [params] = useSearchParams();
  const inferred: AuthMode = location.pathname.includes('forgot')
    ? 'forgot'
    : location.pathname.includes('reset')
      ? 'reset'
      : location.pathname.includes('sign-up') || location.pathname.includes('register')
        ? 'register'
        : 'login';
  const mode = givenMode || inferred;
  const { user, ready, refreshSession, refreshCart, notify } = useApp();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  useEffect(() => {
    setError('');
    setSuccess('');
  }, [mode]);
  const rawNext = params.get('next') || '/account',
    next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/account';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    const values = new FormData(event.currentTarget);
    try {
      if (mode === 'forgot') {
        const result = await api<{ message: string }>('/auth/forgot-password', {
          method: 'POST',
          body: JSON.stringify({ email: values.get('email') }),
        });
        setSuccess(result.message);
      } else if (mode === 'reset') {
        await api('/auth/reset-password', {
          method: 'POST',
          body: JSON.stringify({
            token: params.get('token') || values.get('token'),
            password: values.get('password'),
          }),
        });
        await refreshSession();
        await refreshCart();
        setSuccess('Your password has been updated. You can now sign in.');
      } else {
        const payload =
          mode === 'register'
            ? {
                name: values.get('name'),
                email: values.get('email'),
                password: values.get('password'),
                role: values.get('role'),
              }
            : { email: values.get('email'), password: values.get('password') };
        await api<{ user: User }>('/auth/' + (mode === 'register' ? 'register' : 'login'), {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        await refreshSession();
        await refreshCart();
        notify(
          mode === 'register' ? 'Welcome to 3legant. Your account is ready.' : 'Welcome back.',
        );
        navigate(next, { replace: true });
      }
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  if (ready && user && (mode === 'login' || mode === 'register'))
    return <Navigate to={next} replace />;
  const title =
    mode === 'register'
      ? 'A place for you.'
      : mode === 'forgot'
        ? 'Let’s get you back.'
        : mode === 'reset'
          ? 'A fresh start.'
          : 'Welcome home.';
  return (
    <section className="page-shell auth-layout">
      <div className="auth-art">
        <img src="/images/hero.svg" alt="A thoughtfully arranged living space" />
        <div>
          <p className="eyebrow">GOOD DESIGN, EVERY DAY</p>
          <h2>
            Beautiful things.
            <br />
            Better living.
          </h2>
        </div>
      </div>
      <div className="auth-form panel">
        <Link to="/" className="brand">
          3legant<span>.</span>
        </Link>
        <p className="eyebrow">
          {mode === 'register' ? 'JOIN OUR COMMUNITY' : 'YOUR PERSONAL SPACE'}
        </p>
        <h1>{title}</h1>
        <p className="muted">
          {mode === 'login' ? (
            <>
              New around here? <Link to="/sign-up">Create an account</Link>
            </>
          ) : mode === 'register' ? (
            <>
              Already part of the family? <Link to="/sign-in">Sign in</Link>
            </>
          ) : (
            'We’ll help you securely reset your password.'
          )}
        </p>
        <ErrorNotice message={error} />
        {success && (
          <div className="notice" role="status">
            {success} {mode === 'reset' && <Link to="/sign-in">Sign in</Link>}
          </div>
        )}
        <form onSubmit={submit} className="stack">
          {mode === 'register' && (
            <label className="field">
              Your name
              <input
                name="name"
                autoComplete="name"
                required
                minLength={2}
                maxLength={100}
                placeholder="Alex Morgan"
              />
            </label>
          )}
          {mode !== 'reset' && (
            <label className="field">
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
          )}
          {mode !== 'forgot' && (
            <label className="field">
              {mode === 'reset' ? 'New password' : 'Password'}
              <input
                name="password"
                type="password"
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={mode === 'login' ? 1 : 10}
                maxLength={128}
                placeholder={mode === 'login' ? 'Your password' : 'At least 10 characters'}
              />
            </label>
          )}
          {mode === 'reset' && !params.get('token') && (
            <label className="field">
              Reset token
              <input
                name="token"
                required
                autoComplete="off"
                placeholder="Token from your recovery message"
              />
            </label>
          )}
          {mode === 'register' && (
            <>
              <label className="field">
                How would you like to use 3legant?
                <select name="role" defaultValue="buyer">
                  <option value="buyer">I’m here to shop</option>
                  <option value="seller">I’d like to sell my products</option>
                </select>
              </label>
              <p className="muted">
                This is a local demonstration marketplace. No real payments are collected.
              </p>
            </>
          )}
          {mode === 'login' && (
            <Link className="text-link" to="/forgot-password">
              Forgot your password?
            </Link>
          )}
          <button className="button" type="submit" disabled={busy || !ready}>
            {busy
              ? 'Please wait…'
              : mode === 'register'
                ? 'Create account'
                : mode === 'forgot'
                  ? 'Send recovery instructions'
                  : mode === 'reset'
                    ? 'Reset password'
                    : 'Sign in'}
            <ArrowRight size={17} />
          </button>
        </form>
        {(mode === 'forgot' || mode === 'reset') && (
          <p>
            <Link to="/sign-in">Back to sign in</Link>
          </p>
        )}
        {mode === 'forgot' && (
          <p className="muted">
            Development delivery uses a local email outbox. See the README for how to read recovery
            messages.
          </p>
        )}
      </div>
    </section>
  );
}

function AddressFields({
  value,
  onChange,
}: {
  value: Address;
  onChange: (address: Address) => void;
}) {
  const field = (key: keyof Address, label: string, required = true) => (
    <label className="field" key={key}>
      {label}
      <input
        name={key}
        value={String(value[key] || '')}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        required={required}
        maxLength={key === 'postalCode' ? 20 : 120}
        autoComplete={
          key === 'name'
            ? 'shipping name'
            : key === 'line1'
              ? 'shipping address-line1'
              : key === 'line2'
                ? 'shipping address-line2'
                : key === 'city'
                  ? 'shipping address-level2'
                  : key === 'postalCode'
                    ? 'shipping postal-code'
                    : 'shipping country-name'
        }
      />
    </label>
  );
  return (
    <div className="form-grid">
      {field('name', 'Full name')}
      {field('line1', 'Street address')}
      {field('line2', 'Apartment, suite, etc. (optional)', false)}
      {field('city', 'City')}
      {field('postalCode', 'Postal code')}
      {field('country', 'Country')}
    </div>
  );
}

export function AccountPage() {
  const { user, ready, refreshSession, notify } = useApp();
  const [addresses, setAddresses] = useState<Address[]>([]),
    [address, setAddress] = useState<Address>({ ...blankAddress }),
    [editing, setEditing] = useState<number | null>(null),
    [name, setName] = useState(''),
    [email, setEmail] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const loadAddresses = async () => {
    const result = await api<{ addresses: Address[] }>('/addresses');
    setAddresses(result.addresses);
  };
  useEffect(() => {
    if (user) {
      setName(user.name);
      setEmail(user.email);
      loadAddresses().catch((e) => setError(messageOf(e)));
    }
  }, [user?.id]);
  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    setBusy('profile');
    setError('');
    try {
      await api('/account', { method: 'PATCH', body: JSON.stringify({ name, email }) });
      await refreshSession();
      notify('Account details updated.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy('');
    }
  }
  async function savePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget,
      values = new FormData(form);
    setBusy('password');
    setError('');
    try {
      await api('/account/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: values.get('currentPassword'),
          password: values.get('password'),
        }),
      });
      await refreshSession();
      notify('Your password has been changed.');
      form.reset();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy('');
    }
  }
  async function saveAddress(event: FormEvent) {
    event.preventDefault();
    setBusy('address');
    setError('');
    try {
      await api('/addresses' + (editing ? '/' + editing : ''), {
        method: editing ? 'PATCH' : 'POST',
        body: JSON.stringify(address),
      });
      await loadAddresses();
      setAddress({ ...blankAddress });
      setEditing(null);
      notify('Address saved.');
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy('');
    }
  }
  async function deleteAddress(id: number) {
    if (
      !window.confirm(
        'Remove this saved address? Existing orders will keep their delivery information.',
      )
    )
      return;
    setError('');
    try {
      await api('/addresses/' + id, { method: 'DELETE' });
      await loadAddresses();
      notify('Address removed.');
    } catch (e) {
      setError(messageOf(e));
    }
  }
  if (!ready) return <Loading />;
  if (!user) return <LoginPrompt />;
  return (
    <AccountShell title="My account">
      <ErrorNotice message={error} />
      <section className="panel">
        <h2>Account details</h2>
        <form onSubmit={saveProfile} className="stack">
          <div className="form-grid">
            <label className="field">
              Full name
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
              />
            </label>
            <label className="field">
              Email address
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                maxLength={254}
                autoComplete="email"
              />
            </label>
          </div>
          <div>
            <button className="button" disabled={busy === 'profile'}>
              {busy === 'profile' ? 'Saving…' : 'Save details'}
            </button>
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Delivery addresses</h2>
        {addresses.length === 0 ? (
          <p className="muted">Add an address for a smoother checkout.</p>
        ) : (
          <div className="address-grid">
            {addresses.map((a) => (
              <article className="address-card" key={a.id}>
                <strong>{a.name}</strong>
                <p>
                  {a.line1}
                  {a.line2 && (
                    <>
                      <br />
                      {a.line2}
                    </>
                  )}
                  <br />
                  {a.city}, {a.postalCode}
                  <br />
                  {a.country}
                </p>
                <div className="inline-actions">
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => {
                      setEditing(a.id!);
                      setAddress({ ...a });
                    }}
                  >
                    Edit address
                  </button>
                  <button
                    type="button"
                    className="button-ghost"
                    onClick={() => deleteAddress(a.id!)}
                  >
                    Remove
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
        <h3>{editing ? 'Edit address' : 'Add a new address'}</h3>
        <form className="stack" onSubmit={saveAddress}>
          <AddressFields value={address} onChange={setAddress} />
          <div className="inline-actions">
            <button className="button" disabled={busy === 'address'}>
              {busy === 'address' ? 'Saving…' : editing ? 'Update address' : 'Save address'}
            </button>
            {editing && (
              <button
                type="button"
                className="button-secondary"
                onClick={() => {
                  setEditing(null);
                  setAddress({ ...blankAddress });
                }}
              >
                Cancel editing
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="panel">
        <h2>Keep your account secure</h2>
        <form onSubmit={savePassword} className="stack">
          <div className="form-grid">
            <label className="field">
              Current password
              <input
                type="password"
                name="currentPassword"
                required
                autoComplete="current-password"
                maxLength={128}
              />
            </label>
            <label className="field">
              New password
              <input
                type="password"
                name="password"
                required
                minLength={10}
                maxLength={128}
                autoComplete="new-password"
                placeholder="At least 10 characters"
              />
            </label>
          </div>
          <div>
            <button className="button-secondary" disabled={busy === 'password'}>
              Change password
            </button>
          </div>
        </form>
      </section>
    </AccountShell>
  );
}

export function CartPage() {
  const { cart, ready, refreshCart, notify } = useApp();
  const [busy, setBusy] = useState<number | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (ready) refreshCart().catch((e) => setError(messageOf(e)));
  }, [ready]);
  async function update(productId: number, quantity: number) {
    setBusy(productId);
    setError('');
    try {
      await api('/cart/' + productId, {
        method: quantity === 0 ? 'DELETE' : 'PATCH',
        ...(quantity > 0 ? { body: JSON.stringify({ quantity }) } : {}),
      });
      await refreshCart();
      if (!quantity) notify('Item removed from your bag.');
    } catch (e) {
      setError(messageOf(e));
      await refreshCart().catch(() => {});
    } finally {
      setBusy(null);
    }
  }
  if (!ready) return <Loading />;
  return (
    <section className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">A FEW GOOD FINDS</p>
        <h1>Your shopping bag.</h1>
        <p className="muted">Thoughtful pieces, one step closer to home.</p>
      </div>
      <ErrorNotice message={error} />
      {cart.items.length === 0 ? (
        <div className="empty-state">
          <ShoppingBag size={45} />
          <h2>Your bag has room for something lovely.</h2>
          <p>Explore our collection and find your next favorite.</p>
          <Link className="button" to="/shop">
            Discover the collection <ArrowRight size={17} />
          </Link>
        </div>
      ) : (
        <div className="checkout-layout">
          <div className="panel cart-list">
            {cart.items.map(({ product, quantity }) => (
              <article className="cart-row" key={product.id}>
                <Link to={'/product/' + product.slug}>
                  <img
                    src={product.images[0] || '/images/chair.svg'}
                    alt={product.name}
                    onError={(e) => {
                      e.currentTarget.onerror = null;
                      e.currentTarget.src = '/images/chair.svg';
                    }}
                  />
                </Link>
                <div>
                  <Link className="cart-product-name" to={'/product/' + product.slug}>
                    {product.name}
                  </Link>
                  <p className="muted">
                    {product.category} · {money(product.price)} each
                  </p>
                  <div className="inline-actions">
                    <div className="quantity-control">
                      <button
                        type="button"
                        disabled={busy === product.id || quantity <= 1}
                        aria-label={'Decrease ' + product.name + ' quantity'}
                        onClick={() => update(product.id, quantity - 1)}
                      >
                        −
                      </button>
                      <span aria-label={'Quantity ' + quantity}>{quantity}</span>
                      <button
                        type="button"
                        disabled={busy === product.id || quantity >= product.stock}
                        aria-label={'Increase ' + product.name + ' quantity'}
                        onClick={() => update(product.id, quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                    <button
                      type="button"
                      className="button-ghost"
                      disabled={busy === product.id}
                      onClick={() => update(product.id, 0)}
                      aria-label={'Remove ' + product.name}
                    >
                      <Trash2 size={16} /> Remove
                    </button>
                  </div>
                  {quantity > product.stock && (
                    <p className="error-message">
                      Only {product.stock} available. Update your bag before checkout.
                    </p>
                  )}
                </div>
                <strong>{money(product.price * quantity)}</strong>
              </article>
            ))}
            <Link to="/shop" className="text-link">
              Continue shopping <ArrowRight size={16} />
            </Link>
          </div>
          <OrderSummary
            subtotal={cart.subtotal}
            shipping={cart.shipping}
            tax={cart.tax}
            total={cart.total}
          >
            <Link className="button" to="/checkout">
              Continue to checkout <ArrowRight size={17} />
            </Link>
            <p className="muted">Demo checkout. No real payment collected.</p>
          </OrderSummary>
        </div>
      )}
    </section>
  );
}
function OrderSummary({
  subtotal,
  shipping,
  tax,
  total,
  children,
}: {
  subtotal: number;
  shipping: number;
  tax: number;
  total: number;
  children?: ReactNode;
}) {
  return (
    <aside className="panel order-summary">
      <p className="eyebrow">THE DETAILS</p>
      <h2>Order summary</h2>
      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{money(subtotal)}</dd>
        </div>
        <div>
          <dt>Shipping</dt>
          <dd>{shipping === 0 ? 'Free' : money(shipping)}</dd>
        </div>
        <div>
          <dt>Demo tax (8%)</dt>
          <dd>{money(tax)}</dd>
        </div>
        <div className="summary-total">
          <dt>Total</dt>
          <dd>{money(total)}</dd>
        </div>
      </dl>
      {children}
      <div className="summary-benefit">
        <Truck size={18} />
        <span>Standard shipping free from $150</span>
      </div>
      <div className="summary-benefit">
        <LockKeyhole size={18} />
        <span>Secure, server-validated checkout</span>
      </div>
    </aside>
  );
}

export function CheckoutPage() {
  const { user, ready, cart, refreshCart, notify } = useApp();
  const navigate = useNavigate();
  const [addresses, setAddresses] = useState<Address[]>([]),
    [selected, setSelected] = useState('new'),
    [address, setAddress] = useState<Address>({ ...blankAddress }),
    [shipping, setShipping] = useState<'standard' | 'express'>('standard'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    if (user) {
      api<{ addresses: Address[] }>('/addresses')
        .then((data) => {
          setAddresses(data.addresses);
          if (data.addresses.length) setSelected(String(data.addresses[0].id));
          else setAddress((a) => ({ ...a, name: user.name }));
        })
        .catch((e) => setError(messageOf(e)));
      refreshCart().catch((e) => setError(messageOf(e)));
    }
  }, [user?.id]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload = {
        shippingMethod: shipping,
        idempotencyKey: key,
        ...(selected === 'new' ? { address } : { addressId: Number(selected) }),
      };
      const { order } = await api<{ order: Order }>('/orders', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      await refreshCart();
      notify('Your demo order is confirmed.');
      navigate('/orders/' + order.id + '?confirmed=1', { replace: true });
    } catch (e) {
      setError(messageOf(e));
      await refreshCart().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  if (!ready) return <Loading />;
  if (!user) return <LoginPrompt next="/checkout" />;
  if (!cart.items.length && !busy)
    return (
      <section className="page-shell empty-state">
        <ShoppingBag size={40} />
        <h1>Your bag is empty.</h1>
        <p>Add something to your bag before checking out.</p>
        <Link className="button" to="/shop">
          Explore the collection
        </Link>
      </section>
    );
  const delivery = shipping === 'express' ? 1800 : cart.subtotal >= 15000 ? 0 : 800,
    tax = Math.round(cart.subtotal * 0.08),
    total = cart.subtotal + delivery + tax;
  return (
    <section className="page-shell">
      <div className="page-heading">
        <p className="eyebrow">ALMOST HOME</p>
        <h1>A thoughtful checkout.</h1>
        <p className="muted">Review the details, then make it yours.</p>
      </div>
      <div className="notice">
        <strong>Demo checkout.</strong> No real payments are processed. Please use example delivery
        information.
      </div>
      <ErrorNotice message={error} />
      <form className="checkout-layout" onSubmit={submit}>
        <div className="stack">
          <section className="panel">
            <h2>1. Delivery address</h2>
            {addresses.length > 0 && (
              <label className="field">
                Choose an address
                <select value={selected} onChange={(e) => setSelected(e.target.value)}>
                  {addresses.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} — {a.line1}, {a.city}
                    </option>
                  ))}
                  <option value="new">Use a different address</option>
                </select>
              </label>
            )}
            {selected === 'new' ? (
              <AddressFields value={address} onChange={setAddress} />
            ) : (
              <div className="address-card">
                {(() => {
                  const a = addresses.find((a) => String(a.id) === selected);
                  return a ? (
                    <>
                      <strong>{a.name}</strong>
                      <p>
                        {a.line1}
                        {a.line2 && (
                          <>
                            <br />
                            {a.line2}
                          </>
                        )}
                        <br />
                        {a.city}, {a.postalCode}
                        <br />
                        {a.country}
                      </p>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>2. Shipping method</h2>
            <label className="radio-card">
              <input
                type="radio"
                name="shipping"
                checked={shipping === 'standard'}
                onChange={() => setShipping('standard')}
              />
              <span>
                <strong>Standard delivery</strong>
                <small>5–7 business days · Free on orders $150+</small>
              </span>
              <strong>{cart.subtotal >= 15000 ? 'Free' : '$8.00'}</strong>
            </label>
            <label className="radio-card">
              <input
                type="radio"
                name="shipping"
                checked={shipping === 'express'}
                onChange={() => setShipping('express')}
              />
              <span>
                <strong>Express delivery</strong>
                <small>2–3 business days</small>
              </span>
              <strong>$18.00</strong>
            </label>
            <p className="muted">Delivery times are illustrative for this demonstration.</p>
          </section>
          <section className="panel">
            <h2>3. Payment</h2>
            <div className="notice">
              <LockKeyhole size={19} /> <strong>Demo payment — $0 charged</strong>
            </div>
            <p>
              We will create a persistent demo order and update inventory. No card details are
              requested or stored.
            </p>
            <p className="muted">
              Tax uses a flat 8% illustrative rule. This is not a production tax calculation.
            </p>
          </section>
        </div>
        <OrderSummary subtotal={cart.subtotal} shipping={delivery} tax={tax} total={total}>
          <div className="checkout-items">
            {cart.items.map(({ product, quantity }) => (
              <div key={product.id}>
                <span>
                  {product.name} × {quantity}
                </span>
                <strong>{money(product.price * quantity)}</strong>
              </div>
            ))}
          </div>
          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Placing your order…' : 'Place demo order'}
            <ArrowRight size={17} />
          </button>
          <Link className="text-link" to="/cart">
            Back to shopping bag
          </Link>
        </OrderSummary>
      </form>
    </section>
  );
}

export function OrdersPage() {
  const { user, ready } = useApp();
  const [orders, setOrders] = useState<Order[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  useEffect(() => {
    if (user)
      api<{ orders: Order[] }>('/orders')
        .then((data) => setOrders(data.orders))
        .catch((e) => setError(messageOf(e)))
        .finally(() => setLoading(false));
  }, [user?.id]);
  if (!ready) return <Loading />;
  if (!user) return <LoginPrompt next="/orders" />;
  return (
    <AccountShell title="My orders">
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : orders.length === 0 ? (
        <div className="panel empty-state">
          <Package size={40} />
          <h2>Your story starts here.</h2>
          <p>Your orders will appear here after checkout.</p>
          <Link className="button" to="/shop">
            Find something you love
          </Link>
        </div>
      ) : (
        orders.map((order) => (
          <article className="panel order-card" key={order.id}>
            <div className="inline-actions order-card-heading">
              <div>
                <p className="eyebrow">ORDER #{order.id}</p>
                <h2>{date(order.createdAt)}</h2>
              </div>
              <span className="badge">{order.status}</span>
            </div>
            <div className="order-thumbnails">
              {order.items.slice(0, 4).map((item) => (
                <img key={item.id} src={item.image || '/images/chair.svg'} alt={item.name} />
              ))}
            </div>
            <p className="muted">
              {order.items.map((item) => item.name + ' × ' + item.quantity).join(' · ')}
            </p>
            <div className="inline-actions order-card-heading">
              <p>
                {order.items.reduce((n, item) => n + item.quantity, 0)} pieces ·{' '}
                <strong>{money(order.total)}</strong>
              </p>
              <Link className="button-secondary" to={'/orders/' + order.id}>
                View order <ArrowRight size={16} />
              </Link>
            </div>
            <p className="muted">Demo payment · No real charge</p>
          </article>
        ))
      )}
    </AccountShell>
  );
}

export function OrderPage() {
  const { id } = useParams(),
    [params] = useSearchParams();
  const { user, ready } = useApp();
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    if (user) {
      setLoading(true);
      api<{ order: Order }>('/orders/' + id)
        .then((data) => setOrder(data.order))
        .catch((e) => setError(messageOf(e)))
        .finally(() => setLoading(false));
    }
  }, [user?.id, id]);
  if (!ready) return <Loading />;
  if (!user) return <LoginPrompt next={'/orders/' + id} />;
  return (
    <section className="page-shell">
      <Link className="text-link" to="/orders">
        ← All orders
      </Link>
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : order ? (
        <>
          <div className="page-heading">
            {params.get('confirmed') && (
              <span className="confirmation-mark">
                <Check size={30} />
              </span>
            )}
            <p className="eyebrow">
              {params.get('confirmed') ? 'THANK YOU FOR SHOPPING THOUGHTFULLY' : 'YOUR ORDER'}
            </p>
            <h1>
              {params.get('confirmed') ? 'A little joy is on its way.' : 'Order #' + order.id}
            </h1>
            <p className="muted">
              Order #{order.id} · {date(order.createdAt)} ·{' '}
              <span className="badge">{order.status}</span>
            </p>
          </div>
          <div className="checkout-layout">
            <div className="stack">
              <section className="panel">
                <h2>Your pieces</h2>
                {order.items.map((item) => (
                  <article className="cart-row" key={item.id}>
                    <img src={item.image || '/images/chair.svg'} alt={item.name} />
                    <div>
                      <strong>{item.name}</strong>
                      <p className="muted">
                        Quantity {item.quantity} · {money(item.price)} each
                      </p>
                      <span className="badge">{item.status}</span>
                    </div>
                    <strong>{money(item.price * item.quantity)}</strong>
                  </article>
                ))}
              </section>
              <section className="panel">
                <h2>Delivery details</h2>
                <strong>{order.address.name}</strong>
                <p>
                  {order.address.line1}
                  {order.address.line2 && (
                    <>
                      <br />
                      {order.address.line2}
                    </>
                  )}
                  <br />
                  {order.address.city}, {order.address.postalCode}
                  <br />
                  {order.address.country}
                </p>
                <p>{order.shippingMethod === 'express' ? 'Express' : 'Standard'} delivery</p>
                <p className="muted">Demo order. No physical goods will be shipped.</p>
              </section>
            </div>
            <OrderSummary
              subtotal={order.subtotal}
              shipping={order.shipping}
              tax={order.tax}
              total={order.total}
            >
              <div className="notice">Demo payment confirmed. No real money was charged.</div>
              <Link className="button" to="/shop">
                Keep exploring <ArrowRight size={17} />
              </Link>
            </OrderSummary>
          </div>
        </>
      ) : (
        <div className="empty-state">
          <h1>We couldn’t find this order.</h1>
          <Link className="button-secondary" to="/orders">
            View your orders
          </Link>
        </div>
      )}
    </section>
  );
}

export function WishlistPage() {
  const { user, ready } = useApp();
  const [products, setProducts] = useState<Product[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState('');
  async function load() {
    try {
      const result = await api<{ products: Product[] }>('/wishlist');
      setProducts(result.products);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (user) load();
  }, [user?.id]);
  if (!ready) return <Loading />;
  if (!user) return <LoginPrompt next="/wishlist" />;
  return (
    <AccountShell title="Saved for a little later.">
      <ErrorNotice message={error} />
      {loading ? (
        <Loading />
      ) : products.length === 0 ? (
        <div className="panel empty-state">
          <h2>A collection of your favorites.</h2>
          <p>Save pieces as you explore. They’ll be waiting right here.</p>
          <Link className="button" to="/shop">
            Browse the collection
          </Link>
        </div>
      ) : (
        <div className="product-grid">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} saved onWishlistChange={load} />
          ))}
        </div>
      )}
    </AccountShell>
  );
}
