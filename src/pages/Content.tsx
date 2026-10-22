import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, Mail, MapPin, MessageCircle } from 'lucide-react';
import { api } from '../lib/api';
import { TrustBar } from '../components/Layout';
const articles = [
  {
    slug: 'a-room-to-unwind',
    title: 'A room to unwind. A place to be you.',
    tag: 'SLOW LIVING',
    image: 'hero',
    intro:
      'A good living room asks very little of you. Put the kettle on, take your shoes off, and let the day settle.',
    sections: [
      [
        'Start with how you live.',
        'Before choosing a sofa or a side table, think about the moments you want to make space for. Reading on a quiet Sunday. Having friends over. Stretching out after a long day. A room works best when it follows your life.',
      ],
      [
        'Leave a little breathing room.',
        'A few well-chosen pieces can do more than a room full of things. Give your favorite chair some space. Let the light reach the floor. An empty corner can be a welcome pause.',
      ],
      [
        'Make it personal.',
        'A book you have read twice, a bowl from a trip, a blanket with a familiar feel. The pieces that mean something to you are the ones that make a space feel like home.',
      ],
    ],
  },
  {
    slug: 'objects-with-intention',
    title: 'The small things that make a home.',
    tag: 'EVERYDAY OBJECTS',
    image: 'vase',
    intro:
      'The best everyday objects quietly make our routines a little more enjoyable. Here is how to choose them with intention.',
    sections: [
      [
        'Let usefulness lead.',
        'A generous bowl, a sturdy tray, a vase that looks just as good empty. Begin with things you will actually use, then look for a form that makes you smile.',
      ],
      [
        'Mix your textures.',
        'Smooth ceramic beside woven fibers. Warm timber next to a soft textile. A few different textures bring depth to a simple palette without asking for more color.',
      ],
      [
        'Keep what you love close.',
        'Good objects are made to be lived with. Put your favorite cup where you can reach it. Use the nice bowl on a Tuesday. Everyday is an occasion.',
      ],
    ],
  },
  {
    slug: 'a-better-bedtime',
    title: 'Simple rituals for a better bedtime.',
    tag: 'ROOM NOTES',
    image: 'bed',
    intro:
      'Your bedroom is a place to finish the day gently. A few thoughtful changes can make it feel more restful.',
    sections: [
      [
        'Choose a softer light.',
        'A bedside lamp with a warm glow helps a room feel calmer. Move away from bright overhead light as evening arrives and give your eyes a little rest.',
      ],
      [
        'Give the bedside a purpose.',
        'A place for a book, a glass of water, and perhaps a favorite object. Keep the surface useful and clear enough that you do not have to think about it.',
      ],
      [
        'Welcome a slower morning.',
        'Let a favorite rug meet your feet. Leave a little space by the window. A good bedroom feels just as kind at the beginning of the day as at the end.',
      ],
    ],
  },
];
export function BlogPage() {
  return (
    <div className="page-shell journal-page">
      <div className="page-heading">
        <span className="eyebrow">The 3legant journal</span>
        <h1>The art of feeling at home.</h1>
        <p>Room notes, everyday rituals, and ideas for considered living.</p>
      </div>
      <div className="journal-grid">
        {articles.map((a) => (
          <article className="journal-card" key={a.slug}>
            <Link to={'/blog/' + a.slug}>
              <div>
                <img src={'/images/' + a.image + '.svg'} alt="" />
              </div>
              <span className="eyebrow">{a.tag}</span>
              <h2>{a.title}</h2>
              <p>{a.intro}</p>
              <span className="text-link">
                Read the story <ArrowUpRight size={17} />
              </span>
            </Link>
          </article>
        ))}
      </div>
    </div>
  );
}
export function ArticlePage() {
  const { slug } = useParams();
  const a = articles.find((article) => article.slug === slug);
  if (!a) return <NotFound />;
  return (
    <article className="page-shell article-page">
      <nav className="breadcrumb" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>/</span>
        <Link to="/blog">Journal</Link>
        <span>/</span>
        <span>{a.tag}</span>
      </nav>
      <div className="article-heading">
        <span className="eyebrow">{a.tag} / 4 MIN READ</span>
        <h1>{a.title}</h1>
        <p>Notes from the 3legant studio · Original sample editorial</p>
      </div>
      <img
        className="article-hero"
        src={'/images/' + a.image + '.svg'}
        alt="A considered home interior illustration"
      />
      <div className="article-body">
        <p className="article-intro">{a.intro}</p>
        {a.sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
        <Link to="/shop" className="button">
          Find pieces for your everyday <ArrowRight size={17} />
        </Link>
      </div>
      <section className="related-articles">
        <div className="section-heading">
          <h2>A little more inspiration.</h2>
          <Link to="/blog" className="text-link">
            All stories <ArrowRight size={16} />
          </Link>
        </div>
        <div className="journal-grid">
          {articles
            .filter((item) => item.slug !== a.slug)
            .map((item) => (
              <Link to={'/blog/' + item.slug} className="journal-card" key={item.slug}>
                <div>
                  <img src={'/images/' + item.image + '.svg'} alt="" loading="lazy" />
                </div>
                <span className="eyebrow">{item.tag}</span>
                <h3>{item.title}</h3>
                <span className="text-link">
                  Read the story <ArrowUpRight size={16} />
                </span>
              </Link>
            ))}
        </div>
      </section>
    </article>
  );
}
export function ContactPage() {
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [error, setError] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fields = Object.fromEntries(new FormData(form));
    setBusy(true);
    setMessage('');
    try {
      const r = await api<{ message: string }>('/contact', {
        method: 'POST',
        body: JSON.stringify(fields),
      });
      setMessage(r.message);
      setError(false);
      form.reset();
    } catch (e) {
      setMessage((e as Error).message);
      setError(true);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="page-shell contact-page">
        <div className="contact-intro">
          <div>
            <span className="eyebrow">Hello, we’re 3legant.</span>
            <h1>
              We believe a good home
              <br />
              makes room for <em>you.</em>
            </h1>
          </div>
          <p>
            Not more things. The right things. We bring together considered furniture and everyday
            objects from independent sellers, so you can build a space that feels like your own.
          </p>
        </div>
        <div className="contact-story">
          <img
            src="/images/hero.svg"
            alt="Our idea of home: warm textures, considered furniture, and room to breathe"
          />
          <div>
            <span className="eyebrow">Less, but better.</span>
            <h2>
              A little intention.
              <br />A lot of living.
            </h2>
            <p>
              We’re drawn to simple forms, useful details, and pieces with personality. Our
              marketplace connects you to sellers who share that point of view.
            </p>
            <p className="muted">
              This is a working local demonstration with sample products and original placeholder
              illustrations. Orders and messages are stored locally; no real payments, emails, or
              physical deliveries take place.
            </p>
            <Link to="/shop" className="text-link">
              Meet the collection <ArrowUpRight size={17} />
            </Link>
          </div>
        </div>
        <div className="contact-layout">
          <div>
            <span className="eyebrow">Let’s talk</span>
            <h2>
              A question?
              <br />
              We’re all ears.
            </h2>
            <p>
              Tell us what’s on your mind. Your message will appear in the administrator’s contact
              inbox.
            </p>
            <div className="contact-info">
              <div>
                <MessageCircle size={20} />
                <span>
                  <strong>A real place for your message</strong>
                  <small>Stored in the local marketplace inbox</small>
                </span>
              </div>
              <div>
                <MapPin size={20} />
                <span>
                  <strong>Made for your local workspace</strong>
                  <small>No physical showroom or shipping service</small>
                </span>
              </div>
              <div>
                <Mail size={20} />
                <span>
                  <strong>Need account access?</strong>
                  <small>
                    <Link to="/forgot-password">Use the local password recovery flow</Link>
                  </small>
                </span>
              </div>
            </div>
          </div>
          <form className="panel stack" onSubmit={submit}>
            <div className="form-grid">
              <label className="field">
                Your name
                <input name="name" required maxLength={100} autoComplete="name" />
              </label>
              <label className="field">
                Email address
                <input name="email" type="email" required maxLength={254} autoComplete="email" />
              </label>
            </div>
            <label className="field">
              Subject
              <input name="subject" required maxLength={200} />
            </label>
            <label className="field">
              Your message
              <textarea
                name="message"
                required
                minLength={10}
                maxLength={5000}
                placeholder="How can we help?"
                rows={5}
              />
            </label>
            {message && (
              <p
                className={error ? 'error-message' : 'success-message'}
                role={error ? 'alert' : 'status'}
              >
                {message}
              </p>
            )}
            <button className="button" disabled={busy}>
              {busy ? 'Sending…' : 'Send your message'}
              <ArrowRight size={17} />
            </button>
            <small className="muted">
              We use your details only to handle this inquiry.{' '}
              <Link to="/privacy">Privacy policy</Link>
            </small>
          </form>
        </div>
      </section>
      <TrustBar />
    </>
  );
}
export function PolicyPage({ type }: { type: 'privacy' | 'terms' }) {
  return (
    <div className="page-shell policy-page">
      <span className="eyebrow">The details, clearly.</span>
      <h1>{type === 'privacy' ? 'Privacy, by design.' : 'A few simple terms.'}</h1>
      {type === 'privacy' ? (
        <>
          <h2>About this local demonstration</h2>
          <p>
            3legant stores your account, addresses, carts, orders, reviews, subscriptions, and
            contact messages in its local SQLite database. This is a development application with
            sample furnishings and a demo checkout.
          </p>
          <h2>Account and session data</h2>
          <p>
            Passwords are hashed. An HttpOnly cookie keeps your session connected to the server; it
            is also used to persist guest shopping bags. The application does not require
            third-party analytics or externally hosted images or fonts.
          </p>
          <h2>Your choices</h2>
          <p>
            You can edit your profile and addresses in your account, remove saved pieces, and sign
            out. Contact the local administrator through the contact form for data-management
            requests. Password-recovery messages are written to the development email outbox; no
            external email delivery is configured.
          </p>
        </>
      ) : (
        <>
          <h2>Development use</h2>
          <p>
            This marketplace is for local evaluation. All catalog items, seller identities, and
            editorial content are sample material. Original product illustrations are placeholders
            and do not describe goods available for real purchase.
          </p>
          <h2>Orders and pricing</h2>
          <p>
            All prices are in USD. Standard demo shipping costs $8, with free standard shipping for
            product subtotals of $150 or more. Express shipping costs $18. Illustrative tax is 8% of
            the product subtotal. The server calculates the final amount and validates inventory.
          </p>
          <h2>No real payments or deliveries</h2>
          <p>
            Demo checkout creates a persistent order and updates local inventory, without charging
            money or placing a physical shipment. No real card information is requested. Production
            commerce, taxes, consumer policies, and external payment services require separate
            configuration and review.
          </p>
          <h2>Marketplace participation</h2>
          <p>
            Buyers may review products they have purchased. Sellers manage their own products and
            fulfillment. Administrators may archive products, manage users, and moderate reviews. Do
            not enter sensitive real-world information into sample development accounts.
          </p>
        </>
      )}
      <Link to="/contact" className="text-link">
        Have a question? Get in touch <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function NotFound() {
  return (
    <div className="page-shell not-found">
      <span className="eyebrow">404 / A little off the beaten path</span>
      <h1>
        Nothing here.
        <br />
        Plenty to discover.
      </h1>
      <p>That page may have moved. Let’s find something that feels like home.</p>
      <Link className="button" to="/shop">
        Back to the collection <ArrowRight size={18} />
      </Link>
    </div>
  );
}
