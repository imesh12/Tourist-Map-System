'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublishedCategory, PublishedPoi } from 'shared-types';
import { searchPois } from '@/lib/public-map/public-poi-search';

/**
 * Checkpoint 1B.10 §9 — the released SEARCH feature's UI. Local, snapshot-
 * only search (`searchPois`, ./lib/public-map/public-poi-search.ts) — this
 * component never fetches anything itself; it only filters the `pois`/
 * `categories` arrays its parent (`TouristMap`) already holds from the one
 * server-fetched snapshot (1B.9's own "never re-fetch" architecture,
 * unchanged by this checkpoint).
 *
 * Accessibility (§9/§15): a real `role="dialog"` overlay, a labeled
 * `<input type="search">` (autofocused on open so a keyboard user can start
 * typing immediately), each result a real `<button>` (keyboard-selectable,
 * not a `<div onClick>`), and `Escape` closes the overlay from anywhere
 * inside it — the one interaction §9 calls out explicitly ("Escape closes on
 * desktop").
 */
export interface PublicSearchProps {
  readonly pois: readonly PublishedPoi[];
  readonly categories: readonly PublishedCategory[];
  readonly onSelect: (poi: PublishedPoi) => void;
  readonly onClose: () => void;
}

export function PublicSearch({ pois, categories, onSelect, onClose }: PublicSearchProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const results = useMemo(() => searchPois(pois, categories, query), [pois, categories, query]);
  const categoryNameById = useMemo(() => new Map(categories.map((category) => [category.categoryId, category.name] as const)), [categories]);
  const trimmedQuery = query.trim();

  return (
    <div
      data-testid="public-search-overlay"
      className="public-search-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Search places"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          onClose();
        }
      }}
    >
      <div className="public-search-header">
        <label htmlFor="public-search-input" className="public-search-label">
          Search places
        </label>
        <button type="button" data-testid="public-search-close" className="public-search-close" aria-label="Close search" onClick={onClose}>
          ×
        </button>
      </div>
      <input
        ref={inputRef}
        id="public-search-input"
        type="search"
        data-testid="public-search-input"
        className="public-search-input"
        placeholder="Search places…"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {trimmedQuery === '' ? (
        <p className="public-search-hint">Start typing to find a place.</p>
      ) : results.length === 0 ? (
        <p data-testid="public-search-no-results" className="public-search-hint">
          No places found.
        </p>
      ) : (
        <ul data-testid="public-search-results" className="public-search-results">
          {results.map((poi) => (
            <li key={poi.poiId}>
              <button
                type="button"
                data-testid={`public-search-result-${poi.poiId}`}
                className="public-search-result"
                onClick={() => onSelect(poi)}
              >
                <span className="public-search-result-name">{poi.name}</span>
                <span className="public-search-result-category">{categoryNameById.get(poi.categoryId) ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
