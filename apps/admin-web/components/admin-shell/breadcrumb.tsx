import Link from 'next/link';

/**
 * A small, reusable breadcrumb trail — checkpoint 1A.10 §3. The last item
 * (no `href`) is the current page and renders as plain text, not a link.
 */
export interface BreadcrumbItem {
  readonly label: string;
  readonly href?: string;
}

export function Breadcrumb({ items }: { readonly items: readonly BreadcrumbItem[] }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      {items.map((item, index) => (
        <span key={item.label} style={{ display: 'contents' }}>
          {index > 0 ? <span aria-hidden="true">/</span> : null}
          {item.href ? <Link href={item.href}>{item.label}</Link> : <span>{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}
