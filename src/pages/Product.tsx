import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Heart, Minus, Plus, ArrowRight, Star, Truck, ShieldCheck, Check } from 'lucide-react';
import { api, money, date } from '../lib/api';
import { useApp } from '../lib/store';
import type { Product as ProductType, Review } from '../lib/types';
import { ProductImage, Loading, ErrorState } from '../components/UI';
import { ProductCard } from '../components/ProductCard';
export function Product() {
  const { slug } = useParams(),
    { user, addToCart, toggleWishlist, notify } = useApp();
  const [data, setData] = useState<{ product: ProductType; reviews: Review[] } | null>(null),
    [related, setRelated] = useState<ProductType[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [image, setImage] = useState(0),
    [quantity, setQuantity] = useState(1),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false),
    [rating, setRating] = useState('5'),
    [body, setBody] = useState(''),
    [reviewBusy, setReviewBusy] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const r = await api<{ product: ProductType; reviews: Review[] }>('/products/' + slug);
      setData(r);
      setImage(0);
      setQuantity(1);
      const more = await api<{ products: ProductType[] }>(
        '/products?category=' + r.product.categorySlug + '&limit=5',
      );
      setRelated(more.products.filter((p) => p.id !== r.product.id).slice(0, 4));
      if (user) {
        const wishlist = await api<{ products: ProductType[] }>('/wishlist');
        setSaved(wishlist.products.some((p) => p.id === r.product.id));
      } else setSaved(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, [slug, user?.id]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!data) return;
    setReviewBusy(true);
    try {
      await api('/products/' + data.product.id + '/reviews', {
        method: 'POST',
        body: JSON.stringify({ rating: Number(rating), body }),
      });
      setBody('');
      notify('Thank you. Your review has been saved.');
      const r = await api<{ product: ProductType; reviews: Review[] }>('/products/' + slug);
      setData(r);
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setReviewBusy(false);
    }
  }
  if (loading)
    return (
      <div className="page-shell">
        <Loading />
      </div>
    );
  if (error || !data)
    return (
      <div className="page-shell">
        <ErrorState message={error || 'This piece could not be found.'} retry={load} />
        <Link to="/shop" className="text-link">
          Back to the collection
        </Link>
      </div>
    );
  const p = data.product;
  return (
    <div className="page-shell product-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/shop">Shop</Link>
        <span>/</span>
        <Link to={'/shop?category=' + p.categorySlug}>{p.category}</Link>
        <span>/</span>
        <span>{p.name}</span>
      </nav>
      <div className="product-detail">
        <div className="product-gallery">
          <div className="product-main-image">
            <ProductImage src={p.images[image]} alt={p.name + ' — view ' + (image + 1)} />
            <span className="product-label">{p.stock ? 'Considered design' : 'Sold out'}</span>
          </div>
          {p.images.length > 1 && (
            <div className="product-thumbnails">
              {p.images.map((src, i) => (
                <button
                  key={i}
                  onClick={() => setImage(i)}
                  aria-label={'View image ' + (i + 1)}
                  aria-pressed={i === image}
                  className={i === image ? 'active' : ''}
                >
                  <ProductImage src={src} alt={p.name + ' thumbnail ' + (i + 1)} />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="product-information">
          <span className="eyebrow">{p.category} / THE EVERYDAY COLLECTION</span>
          <h1>{p.name}</h1>
          {p.reviewCount > 0 && (
            <a href="#reviews" className="product-stars">
              <Star size={15} fill="currentColor" />
              {p.rating.toFixed(1)}{' '}
              <span>
                · {p.reviewCount} {p.reviewCount === 1 ? 'review' : 'reviews'}
              </span>
            </a>
          )}
          <p className="product-detail-price">
            {money(p.price)} <small>USD</small>
          </p>
          <p className="product-description">{p.description}</p>
          <p className="seller-credit">
            Curated by <strong>{p.sellerName}</strong>
          </p>
          <div className={'stock-note ' + (!p.stock ? 'out-of-stock' : '')}>
            <i />
            {p.stock > 0
              ? p.stock < 5
                ? 'Only ' + p.stock + ' left — make it yours.'
                : 'In stock and ready for your home.'
              : 'Currently out of stock.'}
          </div>
          <div className="product-purchase">
            <div className="quantity">
              <button
                disabled={quantity <= 1}
                onClick={() => setQuantity((q) => q - 1)}
                aria-label="Decrease quantity"
              >
                <Minus size={16} />
              </button>
              <span aria-live="polite">{quantity}</span>
              <button
                disabled={quantity >= p.stock}
                onClick={() => setQuantity((q) => q + 1)}
                aria-label="Increase quantity"
              >
                <Plus size={16} />
              </button>
            </div>
            <button
              className="button"
              disabled={busy || !p.stock}
              onClick={async () => {
                setBusy(true);
                try {
                  await addToCart(p.id, quantity);
                } catch {
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? 'Adding…' : p.stock ? 'Add to shopping bag' : 'Out of stock'}
              <ArrowRight size={17} />
            </button>
            <button
              className={'icon-button product-save ' + (saved ? 'is-saved' : '')}
              aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
              aria-pressed={saved}
              onClick={async () => {
                try {
                  await toggleWishlist(p.id, saved);
                  if (user) setSaved(!saved);
                } catch (e) {
                  notify((e as Error).message, 'error');
                }
              }}
            >
              <Heart size={21} fill={saved ? 'currentColor' : 'none'} />
            </button>
          </div>
          <div className="product-perks">
            <span>
              <Truck size={18} />
              Free standard shipping on orders $150+
            </span>
            <span>
              <ShieldCheck size={18} />
              Local demo checkout — no real charges
            </span>
          </div>
          <div className="product-accordions">
            <details open>
              <summary>The thoughtful details</summary>
              <p>
                {p.description} Browse the gallery to discover the form and finish. Product
                illustrations are original development placeholders.
              </p>
            </details>
            <details>
              <summary>Delivery & care</summary>
              <p>
                Demo delivery: standard shipping is $8, free on orders of $150 or more. Express is
                $18. Illustrative tax is 8% of the product subtotal. Keep surfaces dry and clean
                gently with a soft cloth.
              </p>
            </details>
            <details>
              <summary>About this marketplace</summary>
              <p>
                This locally hosted marketplace uses sample furnishings and demo payments. No real
                payment or physical shipment takes place. Each seller manages their own products and
                order fulfillment.
              </p>
            </details>
          </div>
        </div>
      </div>
      <section id="reviews" className="reviews-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">From their homes to yours</span>
            <h2>A few honest words.</h2>
          </div>
          <span>
            {p.reviewCount} {p.reviewCount === 1 ? 'review' : 'reviews'}
          </span>
        </div>
        <div className="reviews-layout">
          <div>
            {data.reviews.length ? (
              data.reviews.map((r) => (
                <article className="review" key={r.id}>
                  <div className="review-header">
                    <span className="review-avatar">{r.userName.slice(0, 1)}</span>
                    <div>
                      <strong>{r.userName}</strong>
                      <small>{date(r.createdAt)}</small>
                    </div>
                    <div className="review-stars" aria-label={r.rating + ' out of 5 stars'}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star key={i} size={13} fill={i < r.rating ? 'currentColor' : 'none'} />
                      ))}
                    </div>
                  </div>
                  <p>{r.body}</p>
                  {r.verified && (
                    <span className="verified-note">
                      <Check size={13} />
                      Verified purchase
                    </span>
                  )}
                </article>
              ))
            ) : (
              <div className="panel">
                <h3>A fresh start.</h3>
                <p className="muted">
                  No reviews yet. Reviews come from customers who have purchased this piece.
                </p>
              </div>
            )}
          </div>
          <div className="panel review-form">
            <h3>Lived with it? Tell us.</h3>
            <p className="muted">
              Share your experience after purchasing this piece. One review per customer and
              product.
            </p>
            {user ? (
              <form className="stack" onSubmit={submit}>
                <label className="field">
                  Your rating
                  <select value={rating} onChange={(e) => setRating(e.target.value)}>
                    {[5, 4, 3, 2, 1].map((n) => (
                      <option value={n} key={n}>
                        {n} {n === 1 ? 'star' : 'stars'}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Your experience
                  <textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    required
                    minLength={10}
                    maxLength={2000}
                    placeholder="How does it feel in your home?"
                  />
                </label>
                <button disabled={reviewBusy} className="button">
                  {reviewBusy ? 'Saving…' : 'Share your review'}
                </button>
              </form>
            ) : (
              <Link to="/sign-in" className="text-link">
                Sign in to write a review <ArrowRight size={16} />
              </Link>
            )}
          </div>
        </div>
      </section>
      {related.length > 0 && (
        <section className="related-section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Better together</span>
              <h2>A few kindred pieces.</h2>
            </div>
            <Link className="text-link" to={'/shop?category=' + p.categorySlug}>
              Explore more <ArrowRight size={16} />
            </Link>
          </div>
          <div className="product-grid">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
