import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { SlidersHorizontal, Search, ArrowLeft, ArrowRight, X } from 'lucide-react';
import { api } from '../lib/api';
import type { Product, Category } from '../lib/types';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, Loading } from '../components/UI';
export function Catalog() {
  const [params, setParams] = useSearchParams();
  const key = params.toString();
  const [data, setData] = useState<{
      products: Product[];
      total: number;
      page: number;
      pages: number;
    } | null>(null),
    [categories, setCategories] = useState<Category[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [filters, setFilters] = useState(false),
    [query, setQuery] = useState(params.get('q') || ''),
    [min, setMin] = useState(
      params.get('minPrice') ? String(Number(params.get('minPrice')) / 100) : '',
    ),
    [max, setMax] = useState(
      params.get('maxPrice') ? String(Number(params.get('maxPrice')) / 100) : '',
    );
  useEffect(() => {
    api<{ categories: Category[] }>('/categories')
      .then((r) => setCategories(r.categories))
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    api<typeof data>('/products?' + key)
      .then((r) => {
        if (active) setData(r);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    setQuery(params.get('q') || '');
    setMin(params.get('minPrice') ? String(Number(params.get('minPrice')) / 100) : '');
    setMax(params.get('maxPrice') ? String(Number(params.get('maxPrice')) / 100) : '');
    return () => {
      active = false;
    };
  }, [key]);
  function update(values: Record<string, string>) {
    setError('');
    const next = new URLSearchParams(params);
    next.delete('page');
    Object.entries(values).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    setParams(next);
  }
  const current = categories.find((c) => c.slug === params.get('category'));
  return (
    <>
      <section className="catalog-banner">
        <span className="eyebrow">Objects with intention</span>
        <h1>{current?.name || 'Good things for your home.'}</h1>
        <p>Simple forms. Thoughtful details. Pieces you’ll love living with.</p>
      </section>
      <section className="section-wrap catalog-section">
        <div className="catalog-topline">
          <div className="category-tabs" aria-label="Product categories">
            <button
              className={!params.get('category') ? 'active' : ''}
              onClick={() => update({ category: '' })}
            >
              All pieces
            </button>
            {categories.map((c) => (
              <button
                key={c.id}
                className={params.get('category') === c.slug ? 'active' : ''}
                onClick={() => update({ category: c.slug })}
              >
                {c.name}
              </button>
            ))}
          </div>
          <button
            className={'filter-toggle ' + (filters ? 'active' : '')}
            aria-expanded={filters}
            onClick={() => setFilters(!filters)}
          >
            <SlidersHorizontal size={16} />
            Filters
          </button>
        </div>
        <div className="catalog-controls">
          <form
            className="catalog-search"
            onSubmit={(e) => {
              e.preventDefault();
              update({ q: query });
            }}
          >
            <label htmlFor="catalog-search" className="sr-only">
              Search products
            </label>
            <Search size={18} />
            <input
              id="catalog-search"
              type="search"
              placeholder="Find something you love…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button type="submit">Search</button>
          </form>
          <label className="sort-label">
            Sort by
            <select
              value={params.get('sort') || 'newest'}
              onChange={(e) => update({ sort: e.target.value })}
            >
              <option value="newest">Latest arrivals</option>
              <option value="price-asc">Price: low to high</option>
              <option value="price-desc">Price: high to low</option>
              <option value="name">Name: A to Z</option>
            </select>
          </label>
        </div>
        {filters && (
          <form
            className="filter-panel"
            onSubmit={(e) => {
              e.preventDefault();
              if (min && max && Number(min) > Number(max)) {
                setError('Minimum price must not exceed maximum price.');
                return;
              }
              update({
                minPrice: min ? String(Math.round(Number(min) * 100)) : '',
                maxPrice: max ? String(Math.round(Number(max) * 100)) : '',
              });
            }}
          >
            <span className="eyebrow">Price range · USD</span>
            <label>
              From
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="$0"
                value={min}
                onChange={(e) => setMin(e.target.value)}
              />
            </label>
            <label>
              To
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Any price"
                value={max}
                onChange={(e) => setMax(e.target.value)}
              />
            </label>
            <button className="button button-small">Apply price</button>
            <button
              type="button"
              className="button-ghost"
              onClick={() => {
                setMin('');
                setMax('');
                update({ minPrice: '', maxPrice: '' });
              }}
            >
              Clear price
            </button>
          </form>
        )}
        <div className="catalog-result-bar">
          <span>
            {loading ? 'Finding your favorites…' : `${data?.total || 0} considered pieces`}
          </span>
          {(params.has('q') ||
            params.has('category') ||
            params.has('minPrice') ||
            params.has('maxPrice')) && (
            <button onClick={() => setParams({})} className="clear-filters">
              Clear all filters <X size={13} />
            </button>
          )}
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : data?.products.length ? (
          <>
            <div className="product-grid">
              {data.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
            {data.pages > 1 && (
              <nav className="pagination" aria-label="Product pages">
                <button
                  disabled={data.page <= 1}
                  onClick={() => {
                    const p = new URLSearchParams(params);
                    p.set('page', String(data.page - 1));
                    setParams(p);
                    window.scrollTo({ top: 220, behavior: 'smooth' });
                  }}
                  aria-label="Previous page"
                >
                  <ArrowLeft size={17} />
                </button>
                {Array.from({ length: data.pages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === data.pages || Math.abs(n - data.page) < 3)
                  .map((n) => (
                    <button
                      key={n}
                      aria-current={n === data.page ? 'page' : undefined}
                      className={n === data.page ? 'active' : ''}
                      onClick={() => {
                        const p = new URLSearchParams(params);
                        p.set('page', String(n));
                        setParams(p);
                        window.scrollTo({ top: 220, behavior: 'smooth' });
                      }}
                    >
                      {n}
                    </button>
                  ))}
                <button
                  disabled={data.page >= data.pages}
                  onClick={() => {
                    const p = new URLSearchParams(params);
                    p.set('page', String(data.page + 1));
                    setParams(p);
                    window.scrollTo({ top: 220, behavior: 'smooth' });
                  }}
                  aria-label="Next page"
                >
                  <ArrowRight size={17} />
                </button>
              </nav>
            )}
          </>
        ) : (
          <div className="empty-state">
            <h2>No pieces found, yet.</h2>
            <p>Try a different search or give your filters a little more room.</p>
            <button className="button" onClick={() => setParams({})}>
              Explore all pieces
            </button>
          </div>
        )}
        <div className="catalog-note">
          Looking for a little direction?{' '}
          <Link to="/blog">
            Find inspiration in the journal <ArrowRight size={14} />
          </Link>
        </div>
      </section>
    </>
  );
}
