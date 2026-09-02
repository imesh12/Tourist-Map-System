'use client';

import { useMemo, useState } from 'react';
import { getPublicFeatureRegistryEntry, listReleasedFeatures, type PublicContentLanguage } from 'shared-types';
import { menuItemCreateInputSchema, menuItemUpdateInputSchema, type CategoryParsed, type MenuItemParsed, type PageParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import { DEFAULT_PAGE_MENU_ICON } from '@/lib/tenant/menu-projection';
import { CATEGORY_ICON_META } from '../categories/category-icons';
import { DeleteMenuItemDialog } from './delete-menu-item-dialog';
import { MenuItemFormDrawer, type MenuItemFormValues } from './menu-item-form-drawer';

/**
 * The `/admin/menu` manager — checkpoint 1B.5, same shape
 * `categories-manager.tsx`/`pois-manager.tsx` established: after every
 * successful add/edit/reorder/enable-disable/delete mutation, this
 * re-fetches `GET /api/map/menu-items` and replaces state with that
 * response — Firestore is the authoritative source, not whatever was just
 * optimistically typed into a form. A full browser reload re-runs the
 * server component instead, which sources the same `loadTenantMenuItems()`
 * helper — both paths agree.
 *
 * Reordering (§14) is the exact same "swap two `order` values via two
 * PATCH calls" pattern `categories-manager.tsx`'s `handleMove` already
 * established, disabled while a search/filter narrows the list for the
 * same "what does 'up' mean" reason that file documents.
 */

const ALL_RELEASED_FEATURES = listReleasedFeatures();

interface MenuBuilderManagerProps {
  readonly mapId: string;
  readonly mapName: string;
  readonly initialMenuItems: readonly MenuItemParsed[];
  readonly categories: readonly CategoryParsed[];
  readonly pages: readonly PageParsed[];
  readonly canEdit: boolean;
  /** checkpoint 1B.17B §9 — see `CategoriesManagerProps`'s identical doc comment. */
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
}

type DrawerState = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly menuItem: MenuItemParsed } | undefined;

async function parseSafeErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const body = (await response.json()) as { message?: unknown };
    return typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback;
  } catch {
    return fallback;
  }
}

function emptyFormValues(defaultCategoryId: string, defaultFeatureKey: string, defaultPageId: string): MenuItemFormValues {
  return {
    type: 'CATEGORY',
    categoryId: defaultCategoryId,
    featureKey: defaultFeatureKey,
    pageId: defaultPageId,
    label: '',
    icon: '',
    status: 'ENABLED',
    translations: {},
  };
}

function menuItemToFormValues(menuItem: MenuItemParsed): MenuItemFormValues {
  return {
    type: menuItem.type,
    categoryId: menuItem.type === 'CATEGORY' ? menuItem.categoryId : '',
    featureKey: menuItem.type === 'FEATURE' ? menuItem.featureKey : '',
    pageId: menuItem.type === 'PAGE' ? menuItem.pageId : '',
    label: menuItem.label,
    // checkpoint 1B.11 — a PAGE item's icon override shares CATEGORY's
    // identical optional-icon-override shape (see `MenuItemPage` in
    // shared-types), so it belongs on this same branch.
    icon: menuItem.type === 'CATEGORY' || menuItem.type === 'PAGE' ? (menuItem.icon ?? '') : '',
    status: menuItem.status,
    translations: menuItem.translations ?? {},
  };
}

export function MenuBuilderManager({ mapId, mapName, initialMenuItems, categories, pages, canEdit, enabledLanguages, defaultLanguage }: MenuBuilderManagerProps) {
  const [menuItems, setMenuItems] = useState<readonly MenuItemParsed[]>(initialMenuItems);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [isRefetching, setIsRefetching] = useState(false);

  const [drawer, setDrawer] = useState<DrawerState>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);

  const [busyMenuItemId, setBusyMenuItemId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<MenuItemParsed | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);

  const categoryById = useMemo(() => {
    const map = new Map<string, CategoryParsed>();
    for (const category of categories) {
      map.set(category.categoryId, category);
    }
    return map;
  }, [categories]);

  const pageById = useMemo(() => {
    const map = new Map<string, PageParsed>();
    for (const page of pages) {
      map.set(page.pageId, page);
    }
    return map;
  }, [pages]);

  const usedCategoryIds = useMemo(
    () => new Set(menuItems.filter((item) => item.type === 'CATEGORY').map((item) => item.categoryId)),
    [menuItems],
  );
  const usedFeatureKeys = useMemo(
    () => new Set(menuItems.filter((item) => item.type === 'FEATURE').map((item) => item.featureKey)),
    [menuItems],
  );
  const usedPageIds = useMemo(() => new Set(menuItems.filter((item) => item.type === 'PAGE').map((item) => item.pageId)), [menuItems]);

  // §11: only enabled categories are ever offered for a NEW menu link.
  // §12: a category (or feature, or page) already in the menu is never
  // offered again — the server enforces uniqueness authoritatively
  // regardless, this is UX convenience only, mirroring `eligibleCategories`
  // in `pois-manager.tsx`.
  const selectableCategories = useMemo(
    () => categories.filter((category) => category.enabled && !usedCategoryIds.has(category.categoryId)),
    [categories, usedCategoryIds],
  );
  const selectableFeatures = useMemo(
    () => ALL_RELEASED_FEATURES.filter((feature) => !usedFeatureKeys.has(feature.key)),
    [usedFeatureKeys],
  );
  // checkpoint 1B.11 — same "enabled and not already linked" eligibility
  // rule as `selectableCategories` above, applied to Pages.
  const selectablePages = useMemo(
    () => pages.filter((page) => page.status === 'ENABLED' && !usedPageIds.has(page.pageId)),
    [pages, usedPageIds],
  );

  async function refetchMenuItems(): Promise<void> {
    setIsRefetching(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/menu-items`);
      if (!response.ok) {
        setListError(await parseSafeErrorMessage(response, 'Could not load the menu.'));
        return;
      }
      const body = (await response.json()) as { menuItems: MenuItemParsed[] };
      setMenuItems(body.menuItems);
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

  function openEditDrawer(menuItem: MenuItemParsed): void {
    setFormError(undefined);
    setFieldErrors([]);
    setDrawer({ mode: 'edit', menuItem });
  }

  function closeDrawer(): void {
    setDrawer(undefined);
  }

  async function handleCreateSubmit(values: MenuItemFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    // checkpoint 1B.17B — omitted entirely on every branch when nothing was
    // translated, same "nothing to send yet" convention every other create
    // payload in this checkpoint already establishes.
    const translationsField = Object.keys(values.translations).length > 0 ? { translations: values.translations } : {};
    const payload =
      values.type === 'CATEGORY'
        ? {
            type: 'CATEGORY' as const,
            categoryId: values.categoryId,
            label: values.label,
            ...(values.icon ? { icon: values.icon } : {}),
            status: values.status,
            ...translationsField,
          }
        : values.type === 'PAGE'
          ? {
              type: 'PAGE' as const,
              pageId: values.pageId,
              label: values.label,
              ...(values.icon ? { icon: values.icon } : {}),
              status: values.status,
              ...translationsField,
            }
          : { type: 'FEATURE' as const, featureKey: values.featureKey, label: values.label, status: values.status, ...translationsField };

    const parsed = menuItemCreateInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/menu-items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError(await parseSafeErrorMessage(response, 'Could not add the menu item. Please try again.'));
        return;
      }
      closeDrawer();
      await refetchMenuItems();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEditSubmit(menuItem: MenuItemParsed, values: MenuItemFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const payload = {
      label: values.label,
      status: values.status,
      // `icon` is only ever meaningful for a CATEGORY or PAGE item —
      // `menuItemUpdateInputSchema` has no type-awareness of its own, but the
      // route rejects `icon` on a FEATURE item's target, so this form never
      // sends it for one.
      ...(menuItem.type === 'CATEGORY' || menuItem.type === 'PAGE' ? { icon: values.icon ? values.icon : null } : {}),
      // checkpoint 1B.17B — ALWAYS sent on edit, even as `{}` (full-replace/
      // clear semantics — see `PATCH /api/maps/{mapId}/menu-items/{menuItemId}`'s
      // own doc comment).
      translations: values.translations,
    };
    const parsed = menuItemUpdateInputSchema.safeParse(payload);
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/menu-items/${menuItem.menuItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError(await parseSafeErrorMessage(response, 'Could not save the menu item. Please try again.'));
        return;
      }
      closeDrawer();
      await refetchMenuItems();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function patchMenuItemRaw(menuItemId: string, patch: Record<string, unknown>): Promise<boolean> {
    try {
      const response = await fetch(`/api/maps/${mapId}/menu-items/${menuItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async function handleToggleEnabled(menuItem: MenuItemParsed): Promise<void> {
    setBusyMenuItemId(menuItem.menuItemId);
    const ok = await patchMenuItemRaw(menuItem.menuItemId, { status: menuItem.status === 'ENABLED' ? 'DISABLED' : 'ENABLED' });
    if (!ok) {
      setListError('Could not save the menu item. Please try again.');
    }
    await refetchMenuItems();
    setBusyMenuItemId(undefined);
  }

  async function handleMove(menuItem: MenuItemParsed, direction: 'up' | 'down'): Promise<void> {
    const index = menuItems.findIndex((entry) => entry.menuItemId === menuItem.menuItemId);
    const neighborIndex = direction === 'up' ? index - 1 : index + 1;
    if (index === -1 || neighborIndex < 0 || neighborIndex >= menuItems.length) {
      return;
    }
    const neighbor = menuItems[neighborIndex]!;

    setBusyMenuItemId(menuItem.menuItemId);
    // Repair Round 4 (checkpoint 1B.6): a single call to the atomic
    // `POST .../menu-items/reorder` endpoint, replacing two independent
    // parallel `PATCH` requests — a `Promise.all` of two separate HTTP
    // requests is not atomic as a *pair*: either one can complete while the
    // other is cancelled or lost (a client-side navigation started before
    // both resolve, a dropped connection, a partial network failure),
    // leaving the two items sharing an order value or the swap only
    // half-applied. The server commits both `order` updates in one
    // Firestore `WriteBatch` — see that route's own doc comment.
    let ok = false;
    try {
      const response = await fetch(`/api/maps/${mapId}/menu-items/reorder`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            { menuItemId: menuItem.menuItemId, order: neighbor.order },
            { menuItemId: neighbor.menuItemId, order: menuItem.order },
          ],
        }),
      });
      ok = response.ok;
    } catch {
      ok = false;
    }
    if (!ok) {
      setListError('Could not reorder the menu. Please try again.');
    }
    await refetchMenuItems();
    setBusyMenuItemId(undefined);
  }

  function requestDelete(menuItem: MenuItemParsed): void {
    setDeleteTarget(menuItem);
  }

  function cancelDelete(): void {
    if (isDeleting) return;
    setDeleteTarget(undefined);
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/menu-items/${deleteTarget.menuItemId}`, { method: 'DELETE' });
      if (!response.ok) {
        setListError(await parseSafeErrorMessage(response, 'Could not remove the menu item. Please try again.'));
      }
      setDeleteTarget(undefined);
      await refetchMenuItems();
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <>
      <Breadcrumb
        items={[
          { label: 'Dashboard', href: '/admin' },
          { label: 'Maps', href: '/admin/maps' },
          { label: mapName, href: `/admin/maps/${mapId}` },
          { label: 'Menu Builder' },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Menu Builder</h1>
          <p className="page-description">Choose and organize the navigation shown on your public tourist map.</p>
        </div>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={openCreateDrawer}>
              + Add menu item
            </button>
          </div>
        ) : null}
      </div>

      {!canEdit ? (
        <div className="alert alert-danger" role="alert">
          Only a Client Admin can add or edit menu items. You can view current values below.
        </div>
      ) : null}

      {listError ? (
        <div className="alert alert-danger" role="alert">
          {listError}
        </div>
      ) : null}

      <div className="card">
        {menuItems.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No menu items yet</div>
            <p>Add your first menu item to start building your public map’s navigation.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Label</th>
                <th>Type</th>
                <th>Source</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {menuItems.map((menuItem) => {
                const index = menuItems.findIndex((entry) => entry.menuItemId === menuItem.menuItemId);
                const isBusy = busyMenuItemId === menuItem.menuItemId || isRefetching;
                const category = menuItem.type === 'CATEGORY' ? categoryById.get(menuItem.categoryId) : undefined;
                const feature = menuItem.type === 'FEATURE' ? getPublicFeatureRegistryEntry(menuItem.featureKey) : undefined;
                const page = menuItem.type === 'PAGE' ? pageById.get(menuItem.pageId) : undefined;

                return (
                  <tr key={menuItem.menuItemId}>
                    <td>
                      <div className="order-controls">
                        <span>{menuItem.order}</span>
                        {canEdit ? (
                          <span className="order-controls-arrows">
                            <button
                              type="button"
                              className="order-arrow-btn"
                              aria-label={`Move ${menuItem.label} up`}
                              disabled={isBusy || index <= 0}
                              onClick={() => handleMove(menuItem, 'up')}
                            >
                              ▲
                            </button>
                            <button
                              type="button"
                              className="order-arrow-btn"
                              aria-label={`Move ${menuItem.label} down`}
                              disabled={isBusy || index >= menuItems.length - 1}
                              onClick={() => handleMove(menuItem, 'down')}
                            >
                              ▼
                            </button>
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td>{menuItem.label}</td>
                    <td>{menuItem.type === 'CATEGORY' ? 'Category' : menuItem.type === 'PAGE' ? 'Page' : 'Feature'}</td>
                    <td>
                      {menuItem.type === 'CATEGORY' ? (
                        category ? (
                          <span className="icon-cell">
                            <span aria-hidden="true">{CATEGORY_ICON_META[category.icon].emoji}</span>
                            {category.name}
                            {!category.enabled ? <span className="badge badge-neutral">Category disabled</span> : null}
                          </span>
                        ) : (
                          <span className="field-hint">Unknown category</span>
                        )
                      ) : menuItem.type === 'PAGE' ? (
                        page ? (
                          <span className="icon-cell">
                            <span aria-hidden="true">{CATEGORY_ICON_META[menuItem.icon ?? DEFAULT_PAGE_MENU_ICON].emoji}</span>
                            {page.title}
                            {page.status !== 'ENABLED' ? <span className="badge badge-neutral">Page disabled</span> : null}
                          </span>
                        ) : (
                          <span className="field-hint">Unknown page</span>
                        )
                      ) : feature ? (
                        feature.label
                      ) : (
                        <span className="field-hint">{menuItem.featureKey}</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${menuItem.status === 'ENABLED' ? 'badge-success' : 'badge-neutral'}`}>
                        {menuItem.status === 'ENABLED' ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={() => openEditDrawer(menuItem)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => handleToggleEnabled(menuItem)}>
                            {menuItem.status === 'ENABLED' ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`Delete ${menuItem.label}`}
                            disabled={isBusy}
                            onClick={() => requestDelete(menuItem)}
                          >
                            •••
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
        <MenuItemFormDrawer
          key={drawer.mode === 'edit' ? drawer.menuItem.menuItemId : 'create'}
          mode={drawer.mode}
          initialValues={
            drawer.mode === 'edit'
              ? menuItemToFormValues(drawer.menuItem)
              : emptyFormValues(selectableCategories[0]?.categoryId ?? '', selectableFeatures[0]?.key ?? '', selectablePages[0]?.pageId ?? '')
          }
          categories={categories}
          pages={pages}
          selectableCategories={selectableCategories}
          selectableFeatures={selectableFeatures}
          selectablePages={selectablePages}
          enabledLanguages={enabledLanguages}
          defaultLanguage={defaultLanguage}
          isSaving={isSaving}
          formError={formError}
          fieldErrors={fieldErrors}
          onCancel={closeDrawer}
          onSubmit={(values) => (drawer.mode === 'create' ? handleCreateSubmit(values) : handleEditSubmit(drawer.menuItem, values))}
        />
      ) : null}

      {deleteTarget ? (
        <DeleteMenuItemDialog
          label={deleteTarget.label}
          type={deleteTarget.type}
          linkedName={
            deleteTarget.type === 'CATEGORY'
              ? categoryById.get(deleteTarget.categoryId)?.name
              : deleteTarget.type === 'PAGE'
                ? pageById.get(deleteTarget.pageId)?.title
                : undefined
          }
          isDeleting={isDeleting}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
