import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { api, money, date } from '../lib/api';
import { useApp } from '../lib/store';
import type { User, Product, Category, Order, Review } from '../lib/types';

type Contact = {
  id: number;
  name: string;
  email: string;
  subject: string;
  message: string;
  resolved: boolean;
  createdAt: string;
};
type Subscriber = { id: number; email: string; createdAt: string };
type DashboardData = {
  stats: { users?: number; products: number; orders: number; revenue: number };
  products: Product[];
  orders: Order[];
  categories: Category[];
  users?: User[];
  reviews?: Review[];
  contacts?: Contact[];
  subscribers?: Subscriber[];
};
type ProductDraft = {
  name: string;
  description: string;
  price: string;
  stock: string;
  categoryId: string;
  images: string;
};
const blankProduct: ProductDraft = {
  name: '',
  description: '',
  price: '',
  stock: '10',
  categoryId: '',
  images: '/images/chair.svg',
};
const err = (error: unknown) =>
  error instanceof Error ? error.message : 'The action could not be completed.';

export function DashboardPage() {
  const { user, ready } = useApp();
  const location = useLocation();
  const admin = location.pathname.startsWith('/admin');
  if (!ready)
    return (
      <div className="page-shell">
        <p role="status">Loading your workspace…</p>
      </div>
    );
  if (!user)
    return <Navigate to={'/sign-in?next=' + encodeURIComponent(location.pathname)} replace />;
  if ((admin && user.role !== 'admin') || (!admin && !['seller', 'admin'].includes(user.role)))
    return (
      <section className="page-shell empty-state">
        <h1>Access restricted</h1>
        <p>Your account does not have access to this workspace.</p>
        <Link className="button" to="/account">
          Go to your account
        </Link>
      </section>
    );
  return <Workspace key={admin ? 'admin' : 'seller'} admin={admin} currentUser={user} />;
}

function Workspace({ admin, currentUser }: { admin: boolean; currentUser: User }) {
  const { notify } = useApp();
  const [data, setData] = useState<DashboardData | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('products'),
    [query, setQuery] = useState('');
  const [productId, setProductId] = useState<number | null>(null),
    [editorOpen, setEditorOpen] = useState(false),
    [draft, setDraft] = useState<ProductDraft>({ ...blankProduct });
  const [categoryId, setCategoryId] = useState<number | null>(null),
    [categoryName, setCategoryName] = useState(''),
    [uploading, setUploading] = useState(false);
  const prefix = admin ? '/admin' : '/seller';
  async function load() {
    setError('');
    try {
      setData(await api<DashboardData>(prefix + '/dashboard'));
    } catch (e) {
      setError(err(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [admin]);
  async function mutate(path: string, method: string, body: unknown, message: string) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      notify(message);
      await load();
      return true;
    } catch (e) {
      setError(err(e));
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function uploadImage(file: File | undefined, input: HTMLInputElement) {
    if (!file) return;
    setError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setError('Choose a PNG, JPEG, or WebP image.');
      input.value = '';
      return;
    }
    if (file.size === 0 || file.size > 3 * 1024 * 1024) {
      setError('Choose a nonempty image no larger than 3 MB.');
      input.value = '';
      return;
    }
    if (draft.images.split(/\n/).filter((line) => line.trim()).length >= 8) {
      setError('A product can have up to 8 images. Remove an image before uploading another.');
      input.value = '';
      return;
    }
    setUploading(true);
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('The selected file could not be read.'));
        reader.onload = () => {
          const result = String(reader.result);
          const comma = result.indexOf(',');
          if (comma < 0) reject(new Error('The selected file could not be read.'));
          else resolve(result.slice(comma + 1));
        };
        reader.readAsDataURL(file);
      });
      const result = await api<{ path?: string; image?: string }>('/seller/images', {
        method: 'POST',
        body: JSON.stringify({ data, filename: file.name }),
      });
      const uploadedPath = result.path || result.image;
      if (!uploadedPath) throw new Error('The server did not return an uploaded image path.');
      setDraft((current) => ({
        ...current,
        images: [
          ...current.images
            .split(/\n/)
            .map((line) => line.trim())
            .filter(Boolean),
          uploadedPath,
        ].join('\n'),
      }));
      notify('Image uploaded. Save the product to apply it.');
    } catch (error) {
      setError(err(error));
    } finally {
      setUploading(false);
      input.value = '';
    }
  }
  function editProduct(product: Product) {
    setProductId(product.id);
    setDraft({
      name: product.name,
      description: product.description,
      price: (product.price / 100).toFixed(2),
      stock: String(product.stock),
      categoryId: String(product.categoryId),
      images: product.images.join('\n'),
    });
    setEditorOpen(true);
    setError('');
  }
  async function saveProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const price = Math.round(Number(draft.price) * 100),
      stock = Number(draft.stock),
      images = draft.images
        .split(/\n/)
        .map((value) => value.trim())
        .filter(Boolean);
    if (
      !Number.isSafeInteger(price) ||
      price < 1 ||
      !Number.isSafeInteger(stock) ||
      stock < 0 ||
      stock > 100000 ||
      !images.length ||
      images.length > 8
    ) {
      setError('Enter a positive price, a whole stock quantity from 0 to 100,000, and 1–8 images.');
      return;
    }
    const body = {
      name: draft.name.trim(),
      description: draft.description.trim(),
      price,
      stock,
      categoryId: Number(draft.categoryId),
      images,
    };
    const ok = await mutate(
      prefix + '/products' + (productId ? '/' + productId : ''),
      productId ? 'PATCH' : 'POST',
      body,
      productId ? 'Product updated.' : 'Product created.',
    );
    if (ok) {
      setEditorOpen(false);
      setProductId(null);
      setDraft({ ...blankProduct });
    }
  }
  async function saveCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate(
      '/admin/categories' + (categoryId ? '/' + categoryId : ''),
      categoryId ? 'PATCH' : 'POST',
      { name: categoryName.trim() },
      categoryId ? 'Category updated.' : 'Category created.',
    );
    if (ok) {
      setCategoryId(null);
      setCategoryName('');
    }
  }
  function changeTab(value: string) {
    setTab(value);
    setQuery('');
    setError('');
    setEditorOpen(false);
  }
  const tabs = admin
    ? ['products', 'orders', 'users', 'categories', 'reviews', 'messages', 'subscribers']
    : ['products', 'orders'];
  const matches = (text: string) => text.toLowerCase().includes(query.toLowerCase());
  return (
    <section className="page-shell stack">
      <div className="page-heading">
        <div>
          <p className="eyebrow">
            {admin ? 'Marketplace management' : 'Your business, thoughtfully organized'}
          </p>
          <h1>{admin ? 'Admin workspace' : 'Seller studio'}</h1>
          <p className="muted">
            {admin
              ? 'Manage your marketplace with a clear view of real activity.'
              : 'Products, inventory, and orders — all in one place.'}
          </p>
        </div>
        <div className="inline-actions">
          <Link className="button button-secondary" to="/account">
            My account
          </Link>
          <button
            className="button button-ghost"
            disabled={busy || loading}
            onClick={() => void load()}
          >
            Refresh data
          </button>
        </div>
      </div>
      <p className="notice">
        Development marketplace · Demo payments only. Sales totals reflect demo orders, not actual
        revenue.
      </p>
      {error && (
        <div role="alert" className="error-message">
          {error}
          {!data && (
            <button
              className="button button-secondary"
              onClick={() => {
                setLoading(true);
                void load();
              }}
            >
              Try again
            </button>
          )}
        </div>
      )}
      {loading ? (
        <p role="status">Loading workspace…</p>
      ) : (
        data && (
          <>
            <div className="stats-grid">
              {admin && <Stat label="Registered users" value={String(data.stats.users ?? 0)} />}
              <Stat label="Catalog products" value={String(data.stats.products)} />
              <Stat label="Orders" value={String(data.stats.orders)} />
              <Stat label="Demo sales" value={money(data.stats.revenue)} />
            </div>
            <nav className="dashboard-tabs" aria-label="Workspace sections">
              {tabs.map((value) => (
                <button
                  key={value}
                  className={'button ' + (tab === value ? '' : 'button-secondary')}
                  aria-current={tab === value ? 'page' : undefined}
                  onClick={() => changeTab(value)}
                >
                  {value[0].toUpperCase() + value.slice(1)}
                  {value === 'messages' && data.contacts?.some((item) => !item.resolved)
                    ? ' · ' + data.contacts.filter((item) => !item.resolved).length
                    : ''}
                </button>
              ))}
            </nav>
            <label className="field">
              <span>Search {tab}</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={'Find in ' + tab + '…'}
              />
            </label>
            {tab === 'products' && (
              <>
                <div className="page-heading">
                  <h2>Product inventory</h2>
                  {!admin && (
                    <button
                      className="button"
                      onClick={() => {
                        setProductId(null);
                        setDraft({
                          ...blankProduct,
                          categoryId: String(data.categories[0]?.id ?? ''),
                        });
                        setEditorOpen(true);
                      }}
                    >
                      Add product
                    </button>
                  )}
                </div>
                {editorOpen && (
                  <form
                    className="panel stack"
                    onSubmit={saveProduct}
                    aria-label={productId ? 'Edit product' : 'New product'}
                  >
                    <h3>{productId ? 'Edit product' : 'New product'}</h3>
                    <div className="form-grid">
                      <label className="field">
                        <span>Product name</span>
                        <input
                          value={draft.name}
                          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                          required
                          minLength={3}
                          maxLength={120}
                        />
                      </label>
                      <label className="field">
                        <span>Category</span>
                        <select
                          value={draft.categoryId}
                          onChange={(event) =>
                            setDraft({ ...draft, categoryId: event.target.value })
                          }
                          required
                        >
                          <option value="">Choose category</option>
                          {data.categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Price (USD)</span>
                        <input
                          type="number"
                          min="0.01"
                          max="1000000"
                          step="0.01"
                          value={draft.price}
                          onChange={(event) => setDraft({ ...draft, price: event.target.value })}
                          required
                        />
                      </label>
                      <label className="field">
                        <span>Stock quantity</span>
                        <input
                          type="number"
                          min="0"
                          max="100000"
                          step="1"
                          value={draft.stock}
                          onChange={(event) => setDraft({ ...draft, stock: event.target.value })}
                          required
                        />
                      </label>
                    </div>
                    <label className="field">
                      <span>Description</span>
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setDraft({ ...draft, description: event.target.value })
                        }
                        required
                        minLength={20}
                        maxLength={5000}
                        rows={4}
                      />
                    </label>
                    <label className="field">
                      <span>Local image paths (one per line)</span>
                      <textarea
                        value={draft.images}
                        onChange={(event) => setDraft({ ...draft, images: event.target.value })}
                        required
                        rows={3}
                      />
                      <small className="muted">
                        Use local /images/ paths only. Existing illustrations include
                        /images/chair.svg, /images/sofa.svg, /images/table.svg, /images/lamp.svg,
                        /images/bed.svg, /images/vase.svg, /images/rug.svg, /images/shelf.svg, and
                        /images/basket.svg. Uploaded image paths are added automatically. Up to 8
                        images per product.
                      </small>
                    </label>
                    <label className="field">
                      <span>Upload product image</span>
                      <input
                        type="file"
                        aria-label="Upload product image"
                        aria-describedby="product-image-upload-help"
                        accept="image/png,image/jpeg,image/webp"
                        disabled={uploading || busy}
                        onChange={(event) =>
                          void uploadImage(event.currentTarget.files?.[0], event.currentTarget)
                        }
                      />
                      <small id="product-image-upload-help" className="muted">
                        PNG, JPEG, or WebP. Maximum 3 MB per image. Only upload images you have
                        permission to use.
                      </small>
                    </label>
                    {uploading && <p role="status">Uploading image…</p>}
                    <div className="inline-actions" aria-label="Product image previews">
                      {draft.images
                        .split(/\n/)
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map(
                          (image, index) =>
                            /^\/images\/(?:uploads\/)?[a-zA-Z0-9_.-]+\.(svg|png|jpe?g|webp)$/.test(
                              image,
                            ) && (
                              <div
                                key={image + '-' + index}
                                className="stack"
                                style={{ maxWidth: 130 }}
                              >
                                <img
                                  src={image}
                                  alt={'Product image preview ' + (index + 1)}
                                  width="120"
                                  height="100"
                                  style={{
                                    objectFit: 'contain',
                                    background: '#f4f1ec',
                                    borderRadius: 8,
                                  }}
                                  onError={(event) => {
                                    event.currentTarget.onerror = null;
                                    event.currentTarget.src = '/images/chair.svg';
                                  }}
                                />
                                <button
                                  type="button"
                                  className="button button-ghost"
                                  disabled={busy || uploading}
                                  onClick={() =>
                                    setDraft((current) => ({
                                      ...current,
                                      images: current.images
                                        .split(/\n/)
                                        .map((line) => line.trim())
                                        .filter(Boolean)
                                        .filter((_, i) => i !== index)
                                        .join('\n'),
                                    }))
                                  }
                                >
                                  Remove image {index + 1}
                                </button>
                              </div>
                            ),
                        )}
                    </div>
                    <div className="inline-actions">
                      <button className="button" disabled={busy || uploading}>
                        {busy ? 'Saving…' : uploading ? 'Uploading…' : 'Save product'}
                      </button>
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={busy || uploading}
                        onClick={() => setEditorOpen(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
                <div className="panel table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th>Category</th>
                        {admin && <th>Seller</th>}
                        <th>Price</th>
                        <th>Stock</th>
                        <th>Status</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.products
                        .filter((product) =>
                          matches(product.name + ' ' + product.category + ' ' + product.sellerName),
                        )
                        .map((product) => (
                          <tr key={product.id}>
                            <td>
                              <div className="inline-actions">
                                <img
                                  src={product.images[0] || '/images/chair.svg'}
                                  alt=""
                                  width="48"
                                  height="48"
                                  style={{ objectFit: 'contain', borderRadius: 6 }}
                                  onError={(event) => {
                                    event.currentTarget.onerror = null;
                                    event.currentTarget.src = '/images/chair.svg';
                                  }}
                                />
                                <div>
                                  {product.archived ? (
                                    <strong>{product.name}</strong>
                                  ) : (
                                    <Link to={'/product/' + product.slug}>
                                      <strong>{product.name}</strong>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            </td>
                            <td>{product.category}</td>
                            {admin && <td>{product.sellerName}</td>}
                            <td>{money(product.price)}</td>
                            <td>{product.stock}</td>
                            <td>
                              <span className="badge">
                                {product.archived
                                  ? 'Archived'
                                  : product.stock
                                    ? 'Active'
                                    : 'Out of stock'}
                              </span>
                            </td>
                            <td>
                              <div className="inline-actions">
                                <button
                                  className="button button-ghost"
                                  disabled={busy}
                                  onClick={() => editProduct(product)}
                                >
                                  Edit <span className="sr-only">{product.name}</span>
                                </button>
                                <button
                                  className="button button-secondary"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        (product.archived ? 'Restore ' : 'Archive ') +
                                          product.name +
                                          '? ' +
                                          (!product.archived
                                            ? 'Existing orders are preserved.'
                                            : ''),
                                      )
                                    )
                                      void mutate(
                                        prefix + '/products/' + product.id,
                                        'PATCH',
                                        { archived: !product.archived },
                                        product.archived
                                          ? 'Product restored.'
                                          : 'Product archived.',
                                      );
                                  }}
                                >
                                  {product.archived ? 'Restore' : 'Archive'}
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.products.filter((product) =>
                    matches(product.name + ' ' + product.category + ' ' + product.sellerName),
                  ).length && (
                    <Empty text="No matching products. Add a product or adjust your search." />
                  )}
                </div>
              </>
            )}
            {tab === 'orders' && (
              <div className="stack">
                <h2>{admin ? 'Marketplace orders' : 'Your fulfillment queue'}</h2>
                {data.orders
                  .filter((order) =>
                    matches(
                      String(order.id) +
                        ' ' +
                        (order.buyerName ?? '') +
                        ' ' +
                        order.items.map((item) => item.name).join(' '),
                    ),
                  )
                  .map((order) => (
                    <OrderPanel
                      key={order.id}
                      order={order}
                      admin={admin}
                      busy={busy}
                      advance={(status) => {
                        if (
                          window.confirm(
                            'Mark applicable items in order #' + order.id + ' as ' + status + '?',
                          )
                        )
                          void mutate(
                            prefix + '/orders/' + order.id,
                            'PATCH',
                            { status },
                            'Fulfillment updated.',
                          );
                      }}
                    />
                  ))}
                {!data.orders.filter((order) =>
                  matches(
                    String(order.id) +
                      ' ' +
                      (order.buyerName ?? '') +
                      ' ' +
                      order.items.map((item) => item.name).join(' '),
                  ),
                ).length && <Empty text="No orders match. New purchases will appear here." />}
              </div>
            )}
            {tab === 'users' && admin && (
              <div className="panel table-wrap">
                <h2>Marketplace users</h2>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users
                      ?.filter((user) => matches(user.name + ' ' + user.email + ' ' + user.role))
                      .map((user) => (
                        <tr key={user.id}>
                          <td>
                            {user.name}
                            {user.id === currentUser.id ? ' (you)' : ''}
                          </td>
                          <td>{user.email}</td>
                          <td>
                            <label className="sr-only" htmlFor={'role-' + user.id}>
                              Role for {user.email}
                            </label>
                            <select
                              id={'role-' + user.id}
                              value={user.role}
                              disabled={busy || user.id === currentUser.id}
                              onChange={(event) => {
                                const role = event.target.value;
                                if (window.confirm('Change ' + user.email + ' to ' + role + '?'))
                                  void mutate(
                                    '/admin/users/' + user.id,
                                    'PATCH',
                                    { role },
                                    'User role updated.',
                                  );
                              }}
                            >
                              {['buyer', 'seller', 'admin'].map((role) => (
                                <option key={role}>{role}</option>
                              ))}
                            </select>
                          </td>
                          <td>
                            <span className="badge">{user.active ? 'Active' : 'Disabled'}</span>
                          </td>
                          <td>
                            <button
                              className="button button-secondary"
                              disabled={busy || user.id === currentUser.id}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    (user.active ? 'Disable ' : 'Enable ') + user.email + '?',
                                  )
                                )
                                  void mutate(
                                    '/admin/users/' + user.id,
                                    'PATCH',
                                    { active: !user.active },
                                    'User access updated.',
                                  );
                              }}
                            >
                              {user.active ? 'Disable' : 'Enable'}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.users?.filter((user) =>
                  matches(user.name + ' ' + user.email + ' ' + user.role),
                ).length && <Empty text="No users match your search." />}
                <p className="muted">
                  Your own administrator role and access cannot be changed here. Historical orders
                  are preserved when access changes.
                </p>
              </div>
            )}
            {tab === 'categories' && admin && (
              <div className="stack">
                <form className="panel stack" onSubmit={saveCategory}>
                  <h2>{categoryId ? 'Edit category' : 'Add category'}</h2>
                  <label className="field">
                    <span>Category name</span>
                    <input
                      value={categoryName}
                      onChange={(event) => setCategoryName(event.target.value)}
                      required
                      minLength={2}
                      maxLength={60}
                    />
                  </label>
                  <div className="inline-actions">
                    <button className="button" disabled={busy}>
                      {categoryId ? 'Save category' : 'Add category'}
                    </button>
                    {categoryId && (
                      <button
                        type="button"
                        className="button button-secondary"
                        onClick={() => {
                          setCategoryId(null);
                          setCategoryName('');
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
                <div className="panel table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Category</th>
                        <th>Products</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.categories
                        .filter((category) => matches(category.name))
                        .map((category) => (
                          <tr key={category.id}>
                            <td>{category.name}</td>
                            <td>
                              {
                                data.products.filter(
                                  (product) => product.categoryId === category.id,
                                ).length
                              }
                            </td>
                            <td>
                              <div className="inline-actions">
                                <button
                                  className="button button-ghost"
                                  disabled={busy}
                                  onClick={() => {
                                    setCategoryId(category.id);
                                    setCategoryName(category.name);
                                  }}
                                >
                                  Edit <span className="sr-only">{category.name}</span>
                                </button>
                                <button
                                  className="button button-secondary"
                                  disabled={busy}
                                  onClick={() => {
                                    if (
                                      window.confirm(
                                        'Delete ' +
                                          category.name +
                                          '? Only categories without products can be deleted.',
                                      )
                                    )
                                      void mutate(
                                        '/admin/categories/' + category.id,
                                        'DELETE',
                                        undefined,
                                        'Category deleted.',
                                      );
                                  }}
                                >
                                  Delete <span className="sr-only">{category.name}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.categories.filter((category) => matches(category.name)).length && (
                    <Empty text="No matching categories." />
                  )}
                </div>
              </div>
            )}
            {tab === 'reviews' && admin && (
              <div className="stack">
                <h2>Review moderation</h2>
                {data.reviews
                  ?.filter((review) => matches(review.body + ' ' + review.userName))
                  .map((review) => (
                    <article className="panel stack" key={review.id}>
                      <div className="page-heading">
                        <div>
                          <strong>{review.userName}</strong>
                          <p className="muted">
                            {date(review.createdAt)} · {review.rating}/5 ·{' '}
                            {review.verified ? 'Verified purchase' : 'Unverified review'}
                          </p>
                        </div>
                        <span className="badge">{review.approved ? 'Published' : 'Hidden'}</span>
                      </div>
                      <p>{review.body}</p>
                      <button
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            '/admin/reviews/' + review.id,
                            'PATCH',
                            { approved: !review.approved },
                            review.approved ? 'Review hidden.' : 'Review published.',
                          )
                        }
                      >
                        {review.approved ? 'Hide review' : 'Publish review'}
                      </button>
                    </article>
                  ))}
                {!data.reviews?.filter((review) => matches(review.body + ' ' + review.userName))
                  .length && <Empty text="No reviews to show." />}
              </div>
            )}
            {tab === 'messages' && admin && (
              <div className="stack">
                <h2>Contact submissions</h2>
                {data.contacts
                  ?.filter((contact) =>
                    matches(
                      contact.subject +
                        ' ' +
                        contact.name +
                        ' ' +
                        contact.email +
                        ' ' +
                        contact.message,
                    ),
                  )
                  .map((contact) => (
                    <article className="panel stack" key={contact.id}>
                      <div className="page-heading">
                        <h3>{contact.subject}</h3>
                        <span className="badge">{contact.resolved ? 'Resolved' : 'Open'}</span>
                      </div>
                      <p className="muted">
                        {contact.name} · <a href={'mailto:' + contact.email}>{contact.email}</a> ·{' '}
                        {date(contact.createdAt)}
                      </p>
                      <p style={{ whiteSpace: 'pre-wrap' }}>{contact.message}</p>
                      <button
                        className="button button-secondary"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            '/admin/contacts/' + contact.id,
                            'PATCH',
                            { resolved: !contact.resolved },
                            'Message status updated.',
                          )
                        }
                      >
                        {contact.resolved ? 'Reopen message' : 'Mark resolved'}
                      </button>
                    </article>
                  ))}
                {!data.contacts?.filter((contact) =>
                  matches(
                    contact.subject +
                      ' ' +
                      contact.name +
                      ' ' +
                      contact.email +
                      ' ' +
                      contact.message,
                  ),
                ).length && <Empty text="No contact messages match." />}
              </div>
            )}
            {tab === 'subscribers' && admin && (
              <div className="panel table-wrap">
                <h2>Newsletter subscribers</h2>
                <p className="muted">
                  Subscriptions are stored locally. No external email campaigns are sent.
                </p>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Email address</th>
                      <th>Subscribed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.subscribers
                      ?.filter((subscriber) => matches(subscriber.email))
                      .map((subscriber) => (
                        <tr key={subscriber.id}>
                          <td>{subscriber.email}</td>
                          <td>{date(subscriber.createdAt)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {!data.subscribers?.filter((subscriber) => matches(subscriber.email)).length && (
                  <Empty text="No matching subscribers." />
                )}
              </div>
            )}
          </>
        )
      )}
    </section>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card panel">
      <p className="muted">{label}</p>
      <strong>{value}</strong>
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return (
    <div className="empty-state">
      <p>{text}</p>
    </div>
  );
}
function OrderPanel({
  order,
  admin,
  busy,
  advance,
}: {
  order: Order;
  admin: boolean;
  busy: boolean;
  advance: (status: string) => void;
}) {
  const next = order.items.some((item) => item.status === 'processing')
    ? 'shipped'
    : order.items.some((item) => item.status === 'shipped')
      ? 'delivered'
      : null;
  return (
    <article className="panel stack">
      <div className="page-heading">
        <div>
          <h3>Order #{order.id}</h3>
          <p className="muted">
            {date(order.createdAt)} · {order.buyerName || 'Customer'} · Demo payment
          </p>
        </div>
        <span className="badge">{order.status.replaceAll('_', ' ')}</span>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Quantity</th>
              <th>Line total</th>
              <th>Fulfillment</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{item.quantity}</td>
                <td>{money(item.price * item.quantity)}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="page-heading">
        <p>
          <strong>
            {admin ? 'Order total' : 'Your items total'}:{' '}
            {money(
              admin
                ? order.total
                : order.items.reduce((sum, item) => sum + item.price * item.quantity, 0),
            )}
          </strong>
        </p>
        <div className="inline-actions">
          {admin && (
            <Link className="button button-secondary" to={'/orders/' + order.id}>
              Order details
            </Link>
          )}
          {next && (
            <button className="button" disabled={busy} onClick={() => advance(next)}>
              Mark {next}
            </button>
          )}
        </div>
      </div>
      <details>
        <summary>Shipping address</summary>
        <address style={{ fontStyle: 'normal', marginTop: 12 }}>
          {order.address.name}
          <br />
          {order.address.line1}
          <br />
          {order.address.line2 && (
            <>
              {order.address.line2}
              <br />
            </>
          )}
          {order.address.city}, {order.address.postalCode}
          <br />
          {order.address.country}
        </address>
      </details>
    </article>
  );
}
