'use client';

import { useMemo, useState } from 'react';
import { categoryCreateInputSchema, categoryUpdateInputSchema, type CategoryParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import { CategoryFormDrawer, type CategoryFormValues } from './category-form-drawer';
import { CATEGORY_ICON_META } from './category-icons';

/**
 * The `/admin/categories` manager — checkpoint 1B.2, redesigned in the
 * Category CMS checkpoint into the professional table + drawer UI (§2/§3).
 *
 * After every successful create/edit/enable-disable/reorder mutation, this
 * re-fetches `GET /api/map/categories` and replaces state with that
 * response — Firestore is the authoritative source, not whatever was just
 * optimistically typed into a form. A full browser reload re-runs the
 * server component instead, which sources the same `loadTenantCategories()`
 * helper — both paths agree.
 *
 * Search/status-filter (§13) are pure client-side derivations over the
 * already-loaded `categories` state — no new endpoint, no server round
 * trip; the full, unfiltered list is what reordering (§14) operates on, so
 * "what does 'up' mean" stays unambiguous only when no filter is active
 * (reordering controls are disabled otherwise, rather than guessing).
 */

type StatusFilter = 'ALL' | 'ENABLED' | 'DISABLED';

interface CategoriesManagerProps {
  readonly initialCategories: readonly CategoryParsed[];
  readonly canEdit: boolean;
}

type DrawerState = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly category: CategoryParsed } | undefined;

async function parseSafeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

function emptyFormValues(): CategoryFormValues {
  return { name: '', icon: 'OTHER', order: '', enabled: true };
}

function categoryToFormValues(category: CategoryParsed): CategoryFormValues {
  return { name: category.name, icon: category.icon, order: String(category.order), enabled: category.enabled };
}

export function CategoriesManager({ initialCategories, canEdit }: CategoriesManagerProps) {
  const [categories, setCategories] = useState<readonly CategoryParsed[]>(initialCategories);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [isRefetching, setIsRefetching] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const isFiltered = searchQuery.trim() !== '' || statusFilter !== 'ALL';

  const [drawer, setDrawer] = useState<DrawerState>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);

  const [busyCategoryId, setBusyCategoryId] = useState<string | undefined>(undefined);

  const visibleCategories = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return categories.filter((category) => {
      if (statusFilter === 'ENABLED' && !category.enabled) return false;
      if (statusFilter === 'DISABLED' && category.enabled) return false;
      if (query && !category.name.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [categories, searchQuery, statusFilter]);

  async function refetchCategories(): Promise<void> {
    setIsRefetching(true);
    try {
      const response = await fetch('/api/map/categories');
      if (!response.ok) {
        setListError(await parseSafeErrorMessage(response, 'Could not load categories.'));
        return;
      }
      const body = (await response.json()) as { categories: CategoryParsed[] };
      setCategories(body.categories);
      setListError(undefined);
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsRefetching(false);
    }
  }

  function openCreateDrawer(): void {
    setFormError(undefined);
    setFieldErrors([]);
    setDrawer({ mode: 'create' });
  }

  function openEditDrawer(category: CategoryParsed): void {
    setFormError(undefined);
    setFieldErrors([]);
    setDrawer({ mode: 'edit', category });
  }

  function closeDrawer(): void {
    setDrawer(undefined);
  }

  async function handleCreateSubmit(values: CategoryFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const payload = {
      name: values.name,
      icon: values.icon,
      enabled: values.enabled,
      ...(values.order.trim() ? { order: Number(values.order.trim()) } : {}),
    };
    const parsed = categoryCreateInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch('/api/map/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError(await parseSafeErrorMessage(response, 'Could not create the category. Please try again.'));
        return;
      }
      closeDrawer();
      await refetchCategories();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEditSubmit(category: CategoryParsed, values: CategoryFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const payload = {
      name: values.name,
      icon: values.icon,
      enabled: values.enabled,
      order: Number(values.order.trim() || '0'),
    };
    const parsed = categoryUpdateInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/map/categories/${category.categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError(await parseSafeErrorMessage(response, 'Could not save the category. Please try again.'));
        return;
      }
      closeDrawer();
      await refetchCategories();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function patchCategoryRaw(categoryId: string, patch: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch(`/api/map/categories/${categoryId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function handleToggleEnabled(category: CategoryParsed): Promise<void> {
    setBusyCategoryId(category.categoryId);
    const ok = await patchCategoryRaw(category.categoryId, { enabled: !category.enabled });
    if (!ok) {
      setListError('Could not save the category. Please try again.');
    }
    await refetchCategories();
    setBusyCategoryId(undefined);
  }

  async function handleMove(category: CategoryParsed, direction: 'up' | 'down'): Promise<void> {
    const index = categories.findIndex((entry) => entry.categoryId === category.categoryId);
    const neighborIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || neighborIndex < 0 || neighborIndex >= categories.length) {
      return;
    }
    const neighbor = categories[neighborIndex]!;

    setBusyCategoryId(category.categoryId);
    const [ok1, ok2] = await Promise.all([
      patchCategoryRaw(category.categoryId, { order: neighbor.order }),
      patchCategoryRaw(neighbor.categoryId, { order: category.order }),
    ]);
    if (!ok1 || !ok2) {
      setListError('Could not reorder categories. Please try again.');
    }
    await refetchCategories();
    setBusyCategoryId(undefined);
  }

  return (
    <>
      <Breadcrumb items={[{ label: 'Dashboard', href: '/admin' }, { label: 'Categories' }]} />

      <div className="page-header">
        <div>
          <h1 className="page-title">Categories</h1>
          <p className="page-description">Organize the content categories available on this tourist map.</p>
        </div>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={openCreateDrawer}>
              + New category
            </button>
          </div>
        ) : null}
      </div>

      {!canEdit ? (
        <div className="alert alert-danger" role="alert">
          Only a Client Admin can create or edit categories. You can view current values below.
        </div>
      ) : null}

      {listError ? (
        <div className="alert alert-danger" role="alert">
          {listError}
        </div>
      ) : null}

      <div className="card">
        <div className="table-toolbar">
          <input
            type="text"
            className="input"
            placeholder="Search categories..."
            aria-label="Search categories"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="select"
            aria-label="Filter"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="ALL">All</option>
            <option value="ENABLED">Enabled</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>

        {categories.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No categories yet</div>
            <p>Create your first category to start organizing content on this map.</p>
          </div>
        ) : visibleCategories.length === 0 ? (
          <div className="empty-state">
            <p>No categories match your search or filter.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Category</th>
                <th>Icon</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleCategories.map((category) => {
                const index = categories.findIndex((entry) => entry.categoryId === category.categoryId);
                const isBusy = busyCategoryId === category.categoryId || isRefetching;
                const iconMeta = CATEGORY_ICON_META[category.icon];

                return (
                  <tr key={category.categoryId}>
                    <td>
                      <div className="order-controls">
                        <span>{category.order}</span>
                        {canEdit ? (
                          <span className="order-controls-arrows">
                            <button
                              type="button"
                              className="order-arrow-btn"
                              aria-label={`Move ${category.name} up`}
                              disabled={isFiltered || isBusy || index <= 0}
                              onClick={() => handleMove(category, 'up')}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="order-arrow-btn"
                              aria-label={`Move ${category.name} down`}
                              disabled={isFiltered || isBusy || index >= categories.length - 1}
                              onClick={() => handleMove(category, 'down')}
                            >
                              ▼
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{category.name}</td>
                    <td>
                      <span className="icon-cell">
                        <span aria-hidden="true">{iconMeta.emoji}</span>
                        {iconMeta.label}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${category.enabled ? 'badge-success' : 'badge-neutral'}`}>
                        {category.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={() => openEditDrawer(category)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => handleToggleEnabled(category)}>
                            {category.enabled ? 'Disable' : 'Enable'}
                          </button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {drawer ? (
        <CategoryFormDrawer
          key={drawer.mode === 'edit' ? drawer.category.categoryId : 'create'}
          mode={drawer.mode}
          initialValues={drawer.mode === 'edit' ? categoryToFormValues(drawer.category) : emptyFormValues()}
          isSaving={isSaving}
          formError={formError}
          fieldErrors={fieldErrors}
          onCancel={closeDrawer}
          onSubmit={(values) => (drawer.mode === 'create' ? handleCreateSubmit(values) : handleEditSubmit(drawer.category, values))}
        />
      ) : null}
    </>
  );
}
