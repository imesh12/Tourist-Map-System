'use client';

import { useMemo, useState } from 'react';
import type { PublicContentLanguage } from 'shared-types';
import { pageCreateInputSchema, pageUpdateInputSchema, type PageParsed } from 'validation';
import { Breadcrumb } from '@/components/admin-shell/breadcrumb';
import { DeletePageDialog } from './delete-page-dialog';
import { PageFormDrawer, type PageFormValues } from './page-form-drawer';

/**
 * The `/admin/maps/{mapId}/pages` manager — checkpoint 1B.11 §6/§7. Same
 * shape `categories-manager.tsx` and `pois-manager.tsx` already established:
 * after every successful create/edit/enable-disable/delete mutation, this
 * re-fetches `GET /api/maps/{mapId}/pages` and replaces state with that
 * response — Firestore is the authoritative source, not whatever was just
 * optimistically typed into a form. A full browser reload re-runs the server
 * component instead, which sources the same `loadTenantPages()` helper —
 * both paths agree.
 *
 * Search/status-filter are pure client-side derivations over the
 * already-loaded `pages` state — no new endpoint, no server round trip.
 *
 * Delete confirmation mirrors `PoisManager`'s `requestDelete`/`cancelDelete`/
 * `confirmDelete` flow, with one addition: `DELETE /api/maps/{mapId}/pages/
 * {pageId}` can reject with a 409 `map/page-in-use` response when a PAGE
 * menu item still references this page (see that route's own doc comment
 * for the chosen deletion policy). That specific rejection is surfaced
 * in-place on `DeletePageDialog` via `inUseMessage` rather than folded into
 * the generic `listError`, so the admin sees exactly why right where they
 * asked to delete, without the dialog just silently closing.
 */

type StatusFilter = 'ALL' | 'ENABLED' | 'DISABLED';

interface PagesManagerProps {
  readonly mapId: string;
  readonly mapName: string;
  readonly initialPages: readonly PageParsed[];
  readonly canEdit: boolean;
  /** checkpoint 1B.17B §9 — see `CategoriesManagerProps`'s identical doc comment. */
  readonly enabledLanguages: readonly PublicContentLanguage[];
  readonly defaultLanguage: PublicContentLanguage;
}

type DrawerState = { readonly mode: 'create' } | { readonly mode: 'edit'; readonly page: PageParsed } | undefined;

const PAGE_IN_USE_CODE = 'map/page-in-use';

async function parseSafeErrorBody(response: Response, fallback: string): Promise<{ message: string; code?: string }> {
  try {
    const body = (await response.json()) as { message?: unknown; code?: unknown };
    return {
      message: typeof body.message === 'string' && body.message.length > 0 ? body.message : fallback,
      code: typeof body.code === 'string' ? body.code : undefined,
    };
  } catch {
    return { message: fallback };
  }
}

function emptyFormValues(): PageFormValues {
  return { title: '', content: '', status: 'ENABLED', translations: {} };
}

function pageToFormValues(page: PageParsed): PageFormValues {
  return { title: page.title, content: page.content, status: page.status, translations: page.translations ?? {} };
}

export function PagesManager({ mapId, mapName, initialPages, canEdit, enabledLanguages, defaultLanguage }: PagesManagerProps) {
  const [pages, setPages] = useState<readonly PageParsed[]>(initialPages);
  const [listError, setListError] = useState<string | undefined>(undefined);
  const [isRefetching, setIsRefetching] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const [drawer, setDrawer] = useState<DrawerState>(undefined);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | undefined>(undefined);
  const [fieldErrors, setFieldErrors] = useState<readonly string[]>([]);

  const [busyPageId, setBusyPageId] = useState<string | undefined>(undefined);
  const [deleteTarget, setDeleteTarget] = useState<PageParsed | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteInUseMessage, setDeleteInUseMessage] = useState<string | undefined>(undefined);

  const visiblePages = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return pages.filter((page) => {
      if (statusFilter === 'ENABLED' && page.status !== 'ENABLED') return false;
      if (statusFilter === 'DISABLED' && page.status !== 'DISABLED') return false;
      if (query && !page.title.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [pages, searchQuery, statusFilter]);

  async function refetchPages(): Promise<void> {
    setIsRefetching(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/pages`);
      if (!response.ok) {
        setListError((await parseSafeErrorBody(response, 'Could not load pages.')).message);
        return;
      }
      const body = (await response.json()) as { pages: PageParsed[] };
      setPages(body.pages);
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

  function openEditDrawer(page: PageParsed): void {
    setFormError(undefined);
    setFieldErrors([]);
    setDrawer({ mode: 'edit', page });
  }

  function closeDrawer(): void {
    setDrawer(undefined);
  }

  async function handleCreateSubmit(values: PageFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const parsed = pageCreateInputSchema.safeParse({
      title: values.title,
      content: values.content,
      status: values.status,
      // checkpoint 1B.17B — omitted entirely when nothing was translated.
      ...(Object.keys(values.translations).length > 0 ? { translations: values.translations } : {}),
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/pages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError((await parseSafeErrorBody(response, 'Could not create the page. Please try again.')).message);
        return;
      }
      closeDrawer();
      await refetchPages();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleEditSubmit(page: PageParsed, values: PageFormValues): Promise<void> {
    setFormError(undefined);
    setFieldErrors([]);

    const parsed = pageUpdateInputSchema.safeParse({
      title: values.title,
      content: values.content,
      status: values.status,
      // checkpoint 1B.17B — ALWAYS sent on edit, even as `{}` (full-replace/
      // clear semantics — see `PATCH /api/maps/{mapId}/pages/{pageId}`'s own
      // doc comment).
      translations: values.translations,
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.issues.map((issue) => `${issue.path.join('.') || 'form'}: ${issue.message}`));
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/pages/${page.pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
      });
      if (!response.ok) {
        setFormError((await parseSafeErrorBody(response, 'Could not save the page. Please try again.')).message);
        return;
      }
      closeDrawer();
      await refetchPages();
    } catch {
      setFormError('Could not reach the server. Please check your connection and try again.');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleToggleEnabled(page: PageParsed): Promise<void> {
    setBusyPageId(page.pageId);
    try {
      const response = await fetch(`/api/maps/${mapId}/pages/${page.pageId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: page.status === 'ENABLED' ? 'DISABLED' : 'ENABLED' }),
      });
      if (!response.ok) {
        setListError((await parseSafeErrorBody(response, 'Could not save the page. Please try again.')).message);
      }
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
    }
    await refetchPages();
    setBusyPageId(undefined);
  }

  function requestDelete(page: PageParsed): void {
    setDeleteInUseMessage(undefined);
    setDeleteTarget(page);
  }

  function cancelDelete(): void {
    if (isDeleting) return;
    setDeleteInUseMessage(undefined);
    setDeleteTarget(undefined);
  }

  async function confirmDelete(): Promise<void> {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/maps/${mapId}/pages/${deleteTarget.pageId}`, { method: 'DELETE' });
      if (!response.ok) {
        const { message, code } = await parseSafeErrorBody(response, 'Could not delete the page. Please try again.');
        if (code === PAGE_IN_USE_CODE) {
          // Surfaced in-place on the still-open dialog — not `listError` —
          // so the admin sees exactly why right where they asked to delete.
          setDeleteInUseMessage(message);
          return;
        }
        setListError(message);
        setDeleteTarget(undefined);
        return;
      }
      setDeleteTarget(undefined);
      await refetchPages();
    } catch {
      setListError('Could not reach the server. Please check your connection and try again.');
      setDeleteTarget(undefined);
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
          { label: 'Pages' },
        ]}
      />

      <div className="page-header">
        <div>
          <h1 className="page-title">Pages</h1>
          <p className="page-description">Write informational content tourists can read from the menu — not places on the map.</p>
        </div>
        {canEdit ? (
          <div className="page-actions">
            <button type="button" className="btn btn-primary" onClick={openCreateDrawer}>
              + New Page
            </button>
          </div>
        ) : null}
      </div>

      {!canEdit ? (
        <div className="alert alert-danger" role="alert">
          Only a Client Admin can create or edit pages. You can view current values below.
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
            placeholder="Search pages..."
            aria-label="Search pages"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
          />
          <select
            className="select"
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="ALL">All statuses</option>
            <option value="ENABLED">Enabled</option>
            <option value="DISABLED">Disabled</option>
          </select>
        </div>

        {pages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-title">No pages yet</div>
            <p>Create your first page to publish informational content tourists can read from the menu.</p>
          </div>
        ) : visiblePages.length === 0 ? (
          <div className="empty-state">
            <p>No pages match your search or filter.</p>
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visiblePages.map((page) => {
                const isBusy = busyPageId === page.pageId || isRefetching;

                return (
                  <tr key={page.pageId}>
                    <td>{page.title}</td>
                    <td>
                      <span className={`badge ${page.status === 'ENABLED' ? 'badge-success' : 'badge-neutral'}`}>
                        {page.status === 'ENABLED' ? 'Enabled' : 'Disabled'}
                      </span>
                    </td>
                    <td>
                      {canEdit ? (
                        <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
                          <button type="button" className="btn btn-secondary" disabled={isBusy} onClick={() => openEditDrawer(page)}>
                            Edit
                          </button>
                          <button type="button" className="btn btn-ghost" disabled={isBusy} onClick={() => handleToggleEnabled(page)}>
                            {page.status === 'ENABLED' ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            aria-label={`Delete ${page.title}`}
                            disabled={isBusy}
                            onClick={() => requestDelete(page)}
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
        <PageFormDrawer
          key={drawer.mode === 'edit' ? drawer.page.pageId : 'create'}
          mode={drawer.mode}
          initialValues={drawer.mode === 'edit' ? pageToFormValues(drawer.page) : emptyFormValues()}
          enabledLanguages={enabledLanguages}
          defaultLanguage={defaultLanguage}
          isSaving={isSaving}
          formError={formError}
          fieldErrors={fieldErrors}
          onCancel={closeDrawer}
          onSubmit={(values) => (drawer.mode === 'create' ? handleCreateSubmit(values) : handleEditSubmit(drawer.page, values))}
        />
      ) : null}

      {deleteTarget ? (
        <DeletePageDialog
          pageTitle={deleteTarget.title}
          isDeleting={isDeleting}
          inUseMessage={deleteInUseMessage}
          onCancel={cancelDelete}
          onConfirm={confirmDelete}
        />
      ) : null}
    </>
  );
}
