import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, MoveDown } from 'lucide-react';
import { api } from '../lib/api';
import type { Product } from '../lib/types';
import { ProductCard } from '../components/ProductCard';
import { ErrorState, Loading } from '../components/UI';
import { TrustBar } from '../components/Layout';
export function Home() {
  const [products, setProducts] = useState<Product[]>([]),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    api<{ products: Product[] }>('/products?limit=4&sort=newest')
      .then((r) => setProducts(r.products))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  return (
    <>
      <section className="home-hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <i /> Considered living, everyday
          </span>
          <h1>
            A little less.
            <br />A little <em>better.</em>
          </h1>
          <p>
            Thoughtful furniture and everyday objects.
            <br className="desktop-break" /> For a home that feels unmistakably you.
          </p>
          <Link className="button" to="/shop">
            Find your next favorite <ArrowRight size={18} />
          </Link>
          <div className="hero-caption">
            <span>01 / THE EVERYDAY COLLECTION</span>
            <a href="#collections" aria-label="Explore collections below">
              <MoveDown size={20} />
            </a>
          </div>
        </div>
        <div className="hero-art">
          <img
            src="/images/hero.svg"
            alt="A warm, sunlit living room with a sculptural chair, side table, and considered objects"
          />
          <div className="hero-art-note">
            <span>Room to slow down.</span>
            <small>Simple forms. Lasting comfort.</small>
          </div>
          <span className="hero-stamp">
            GOOD DESIGN.
            <br />
            EVERY DAY.
          </span>
        </div>
      </section>
      <TrustBar />
      <section id="collections" className="section-wrap collections-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Find your feeling</span>
            <h2>Every room has a story.</h2>
          </div>
          <Link className="text-link" to="/shop">
            Explore all pieces <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="collections-grid">
          {[
            {
              name: 'Living Room',
              slug: 'living-room',
              image: 'sofa',
              copy: 'Make room for living.',
            },
            { name: 'Bedroom', slug: 'bedroom', image: 'bed', copy: 'Your everyday retreat.' },
            { name: 'Kitchen', slug: 'kitchen', image: 'vase', copy: 'Gather around good things.' },
          ].map((c, i) => (
            <Link
              className={'collection-card collection-' + i}
              to={'/shop?category=' + c.slug}
              key={c.slug}
            >
              <div className="collection-copy">
                <span className="eyebrow">0{i + 1} / COLLECTION</span>
                <h3>{c.name}</h3>
                <p>{c.copy}</p>
              </div>
              <img
                src={'/images/' + c.image + '.svg'}
                alt={c.name + ' furnishings'}
                loading="lazy"
              />
              <span className="circle-arrow">
                <ArrowUpRight size={21} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="section-wrap arrivals-section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Fresh perspectives</span>
            <h2>Meet your new favorites.</h2>
          </div>
          <Link className="text-link" to="/shop?sort=newest">
            Shop the collection <ArrowUpRight size={17} />
          </Link>
        </div>
        {loading ? (
          <Loading />
        ) : error ? (
          <ErrorState message={error} />
        ) : (
          <div className="product-grid">
            {products.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>
      <section className="story-banner">
        <div className="story-art">
          <img
            src="/images/chair.svg"
            alt="A carefully considered occasional chair"
            loading="lazy"
          />
        </div>
        <div className="story-copy">
          <span className="eyebrow">Our point of view</span>
          <h2>
            Good design makes
            <br />
            room for life.
          </h2>
          <p>
            We believe the best spaces aren’t perfect. They’re personal. Filled with pieces you
            love, built around the way you actually live.
          </p>
          <Link className="text-link" to="/contact">
            A little about us <ArrowUpRight size={18} />
          </Link>
        </div>
      </section>
      <section className="section-wrap journal-preview">
        <div className="section-heading">
          <div>
            <span className="eyebrow">The art of feeling at home</span>
            <h2>A little inspiration.</h2>
          </div>
          <Link className="text-link" to="/blog">
            Read the journal <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="journal-grid">
          {[
            {
              slug: 'a-room-to-unwind',
              image: 'hero',
              tag: 'SLOW LIVING',
              title: 'A room to unwind. A place to be you.',
            },
            {
              slug: 'objects-with-intention',
              image: 'vase',
              tag: 'EVERYDAY OBJECTS',
              title: 'The small things that make a home.',
            },
            {
              slug: 'a-better-bedtime',
              image: 'bed',
              tag: 'ROOM NOTES',
              title: 'Simple rituals for a better bedtime.',
            },
          ].map((a) => (
            <Link to={'/blog/' + a.slug} className="journal-card" key={a.slug}>
              <div>
                <img src={'/images/' + a.image + '.svg'} alt="" loading="lazy" />
              </div>
              <span className="eyebrow">{a.tag}</span>
              <h3>{a.title}</h3>
              <span className="text-link">
                Read the story <ArrowUpRight size={16} />
              </span>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
