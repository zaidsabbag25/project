import { useEffect, useRef, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { X, ArrowRight, LoaderCircle } from 'lucide-react';
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" size={24} />
      <span>Making room for good things…</span>
    </div>
  );
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <h2>Something needs a little attention.</h2>
      <p>{message}</p>
      {retry && (
        <button className="button" onClick={retry}>
          Try again
        </button>
      )}
    </div>
  );
}
export function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="empty-state">
      <span className="eyebrow">A little room for something new</span>
      <h2>{title}</h2>
      <p>{description}</p>
      <Link className="button" to="/shop">
        Explore the collection <ArrowRight size={16} />
      </Link>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  className = '',
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const previous = useRef<HTMLElement | null>(document.activeElement as HTMLElement);
  useEffect(() => {
    const el = ref.current;
    el?.focus();
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
      if (event.key === 'Tab' && el) {
        const controls = Array.from(
          el.querySelectorAll<HTMLElement>(
            'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]',
          ),
        ).filter((c) => c.offsetParent !== null);
        const first = controls[0],
          last = controls[controls.length - 1];
        if (!first) {
          event.preventDefault();
          return;
        }
        if (!el.contains(document.activeElement)) {
          event.preventDefault();
          first.focus();
          return;
        }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === el)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('keydown', key);
      document.body.style.overflow = oldOverflow;
      if (previous.current?.isConnected) previous.current.focus();
    };
  }, []);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={'modal ' + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label={'Close ' + title}>
            <X />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
export function ProductImage({
  src,
  alt,
  className = '',
}: {
  src?: string;
  alt: string;
  className?: string;
}) {
  return (
    <img
      src={src || '/images/vase.svg'}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        if (!e.currentTarget.src.endsWith('/images/vase.svg'))
          e.currentTarget.src = '/images/vase.svg';
      }}
    />
  );
}
