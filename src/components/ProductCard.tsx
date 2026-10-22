import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Heart, Plus, Star } from 'lucide-react';
import { useApp } from '../lib/store';
import { money } from '../lib/api';
import type { Product } from '../lib/types';
import { ProductImage } from './UI';
export function ProductCard({
  product,
  saved = false,
  onWishlistChange,
}: {
  product: Product;
  saved?: boolean;
  onWishlistChange?: () => void;
}) {
  const { addToCart, toggleWishlist, user, notify, wishlistIds } = useApp();
  const [busy, setBusy] = useState(false),
    [wishBusy, setWishBusy] = useState(false);
  const liked = saved || wishlistIds.includes(product.id);
  async function wish() {
    setWishBusy(true);
    try {
      await toggleWishlist(product.id, liked);
      if (user) {
        onWishlistChange?.();
      }
    } catch (e) {
      notify((e as Error).message, 'error');
    } finally {
      setWishBusy(false);
    }
  }
  return (
    <article className="product-card">
      <div className="product-visual">
        <Link to={'/product/' + product.slug} aria-label={'View ' + product.name}>
          <ProductImage src={product.images[0]} alt={product.name} />
        </Link>
        <span className="product-label">
          {product.stock === 0
            ? 'Sold out'
            : product.stock < 5
              ? 'Only ' + product.stock + ' left'
              : product.category}
        </span>
        <button
          className={'icon-button wishlist-button ' + (liked ? 'is-saved' : '')}
          onClick={wish}
          disabled={wishBusy}
          aria-label={
            (liked ? 'Remove ' : 'Save ') + product.name + (liked ? ' from' : ' to') + ' wishlist'
          }
          aria-pressed={liked}
        >
          <Heart size={17} fill={liked ? 'currentColor' : 'none'} />
        </button>
        <button
          className="quick-add"
          disabled={busy || product.stock === 0}
          onClick={async () => {
            setBusy(true);
            try {
              await addToCart(product.id);
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          <Plus size={16} />
          {busy ? 'Adding…' : product.stock ? 'Add to bag' : 'Out of stock'}
        </button>
      </div>
      <div className="product-meta">
        <div>
          <span className="product-category">{product.category}</span>
          <h3>
            <Link to={'/product/' + product.slug}>{product.name}</Link>
          </h3>
        </div>
        <strong>{money(product.price)}</strong>
      </div>
      {product.reviewCount > 0 && (
        <div className="product-rating">
          <Star size={12} fill="currentColor" />
          {product.rating.toFixed(1)} <span>({product.reviewCount})</span>
        </div>
      )}
    </article>
  );
}
