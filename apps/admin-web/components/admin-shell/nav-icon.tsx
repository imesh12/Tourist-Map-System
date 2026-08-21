export type NavIconName =
  | 'dashboard'
  | 'organization'
  | 'map'
  | 'menu'
  | 'preview'
  | 'pin'
  | 'tag'
  | 'media'
  | 'page'
  | 'announcement'
  | 'analytics'
  | 'users'
  | 'settings';

/**
 * A small, hand-authored icon set — checkpoint 1A.10 §10 ("before
 * introducing a new component/icon library, inspect existing
 * dependencies... prefer existing project capabilities"). admin-web has no
 * icon library at all; simple inline SVGs (basic geometric primitives, no
 * external asset requests) keep the sidebar visually legible without a new
 * dependency.
 */
export function NavIcon({ name, className }: { name: NavIconName; className?: string }) {
  const props = {
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };

  switch (name) {
    case 'dashboard':
      return (
        <svg {...props}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
        </svg>
      );
    case 'organization':
      return (
        <svg {...props}>
          <rect x="4" y="3" width="16" height="18" rx="1.5" />
          <path d="M9 21v-4h6v4" />
          <path d="M8 7h1M12 7h1M16 7h1M8 11h1M12 11h1M16 11h1" />
        </svg>
      );
    case 'map':
      return (
        <svg {...props}>
          <path d="M9 4 4 6v14l5-2 6 2 5-2V4l-5 2-6-2Z" />
          <path d="M9 4v14M15 6v14" />
        </svg>
      );
    case 'menu':
      return (
        <svg {...props}>
          <path d="M4 6h16M4 12h16M4 18h10" />
        </svg>
      );
    case 'preview':
      return (
        <svg {...props}>
          <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      );
    case 'pin':
      return (
        <svg {...props}>
          <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
          <circle cx="12" cy="9.5" r="2.3" />
        </svg>
      );
    case 'tag':
      return (
        <svg {...props}>
          <path d="M3 12.5 12.5 3H20a1 1 0 0 1 1 1v7.5L11.5 21 3 12.5Z" />
          <circle cx="15.5" cy="7.5" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'media':
      return (
        <svg {...props}>
          <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
          <circle cx="9" cy="10" r="1.8" />
          <path d="m4.5 17.5 5-5 3.5 3.5 3-3 4.5 4.5" />
        </svg>
      );
    case 'page':
      return (
        <svg {...props}>
          <path d="M6 3h9l4 4v14H6Z" />
          <path d="M15 3v4h4M9 12h6M9 16h6" />
        </svg>
      );
    case 'announcement':
      return (
        <svg {...props}>
          <path d="M3 10v4h3l5 4V6L6 10Z" />
          <path d="M16 9.5a3 3 0 0 1 0 5M19 7.5a6 6 0 0 1 0 9" />
        </svg>
      );
    case 'analytics':
      return (
        <svg {...props}>
          <path d="M4 20V10M11 20V4M18 20v-7" />
        </svg>
      );
    case 'users':
      return (
        <svg {...props}>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 4.5a3 3 0 0 1 0 6M21 20c0-2.8-2-5.1-4.7-5.8" />
        </svg>
      );
    case 'settings':
      return (
        <svg {...props}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9c.2.7.7 1.2 1.5 1.4h.1a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
        </svg>
      );
    default:
      return null;
  }
}
