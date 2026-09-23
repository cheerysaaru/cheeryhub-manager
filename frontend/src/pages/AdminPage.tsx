import { useEffect, useMemo, useState } from 'react';
import { Shield, UserPlus, KeyRound, Ban, CheckCircle2, Trash2, Pencil } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { Card, CardTitle, CardDescription } from '../components/Card';
import { Input } from '../components/Input';
import { Badge } from '../components/Badge';
import { Modal, ConfirmDialog } from '../components/Modal';
import { api } from '../services/api';
import type { AdminUser } from '../types';

type Mode = 'create' | 'edit' | 'password' | null;

interface FormState {
  name: string;
  email: string;
  password: string;
  role: 'ADMIN' | 'USER';
}

const emptyForm: FormState = { name: '', email: '', password: '', role: 'USER' };

export default function AdminPage() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mode, setMode] = useState<Mode>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: () => Promise<void>;
  } | null>(null);

  const isAdmin = me?.role === 'ADMIN';
  const adminCount = useMemo(
    () => users.filter((u) => u.role === 'ADMIN' && u.status === 'ACTIVE').length,
    [users]
  );

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const result = await api<{ users: AdminUser[] }>('/admin/users');
      setUsers(result.users);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (isAdmin) void loadUsers();
  }, [isAdmin]);

  function flash(message: string) {
    setNotice(message);
    setTimeout(() => setNotice(''), 3000);
  }

  function openCreate() {
    setForm(emptyForm);
    setEditing(null);
    setMode('create');
  }

  function openEdit(target: AdminUser) {
    setForm({
      name: target.name,
      email: target.email,
      password: '',
      role: target.role,
    });
    setEditing(target);
    setMode('edit');
  }

  function openPassword(target: AdminUser) {
    setForm({ ...emptyForm, password: '' });
    setEditing(target);
    setMode('password');
  }

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    if (mode === 'password' && form.password.length < 5) {
      setError('Password must be at least 5 characters');
      return;
    }
    setSaving(true);
    setError('');
    try {
      if (mode === 'create') {
        await api('/admin/users', {
          method: 'POST',
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            password: form.password,
            role: form.role,
          }),
        });
        flash('User created');
      } else if (mode === 'edit' && editing) {
        await api(`/admin/users/${editing.id}`, {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name,
            email: form.email,
            role: form.role,
          }),
        });
        flash('User updated');
      } else if (mode === 'password' && editing) {
        await api(`/admin/users/${editing.id}/reset-password`, {
          method: 'POST',
          body: JSON.stringify({ password: form.password }),
        });
        flash('Password reset');
      }
      setMode(null);
      setEditing(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setSaving(false);
    }
  }

  function askConfirm(
    title: string,
    message: string,
    action: () => Promise<void>
  ) {
    setConfirm({ open: true, title, message, action });
  }

  async function runConfirm() {
    if (!confirm) return;
    setSaving(true);
    setError('');
    try {
      await confirm.action();
      setConfirm(null);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
      setConfirm(null);
    } finally {
      setSaving(false);
    }
  }

  function toggleStatus(target: AdminUser) {
    if (target.id === me?.id) return;
    if (target.status === 'ACTIVE') {
      askConfirm(
        'Disable account?',
        `${target.name} will be signed out and blocked from the dashboard.`,
        async () => {
          await api(`/admin/users/${target.id}/disable`, { method: 'POST' });
          flash('Account disabled');
        }
      );
    } else {
      void (async () => {
        await api(`/admin/users/${target.id}/enable`, { method: 'POST' });
        flash('Account enabled');
        await loadUsers();
      })();
    }
  }

  function removeUser(target: AdminUser) {
    if (target.id === me?.id) return;
    askConfirm(
      'Delete user?',
      `This permanently deletes ${target.name} and all of their data. This cannot be undone.`,
      async () => {
        await api(`/admin/users/${target.id}`, { method: 'DELETE' });
        flash('User deleted');
      }
    );
  }

  if (!isAdmin) {
    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>Access denied</h1>
            <p className="muted">You need administrator access to view this page.</p>
          </div>
        </header>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Admin</p>
          <h1>User management</h1>
          <p className="muted">Create, update, disable, and remove dashboard accounts.</p>
        </div>
        <Button onClick={openCreate}>
          <UserPlus size={16} /> New user
        </Button>
      </header>

      {notice && (
        <p className="save-indicator show" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      <Card padding="lg">
        <div className="settings-section">
          <div className="settings-section-header">
            <Shield size={20} />
            <div>
              <CardTitle>Accounts</CardTitle>
              <CardDescription>
                {users.length} total · {adminCount} active admin{adminCount === 1 ? '' : 's'}
              </CardDescription>
            </div>
          </div>

          {loading ? (
            <div className="page-loading">Loading users…</div>
          ) : (
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {users.map((target) => (
                    <tr key={target.id}>
                      <td>
                        <div className="admin-user-cell">
                          <strong>{target.name}</strong>
                          <span>{target.email}</span>
                          {target.id === me?.id && (
                            <Badge variant="info" size="sm">You</Badge>
                          )}
                        </div>
                      </td>
                      <td>
                        <Badge
                          variant={target.role === 'ADMIN' ? 'warning' : 'default'}
                          size="sm"
                        >
                          {target.role}
                        </Badge>
                      </td>
                      <td>
                        <Badge
                          variant={target.status === 'ACTIVE' ? 'success' : 'danger'}
                          size="sm"
                        >
                          {target.status}
                        </Badge>
                      </td>
                      <td className="admin-muted">
                        {new Date(target.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        <div className="admin-actions">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEdit(target)}
                            aria-label={`Edit ${target.name}`}
                          >
                            <Pencil size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openPassword(target)}
                            aria-label={`Reset password for ${target.name}`}
                          >
                            <KeyRound size={14} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={target.id === me?.id}
                            onClick={() => toggleStatus(target)}
                            aria-label={
                              target.status === 'ACTIVE'
                                ? `Disable ${target.name}`
                                : `Enable ${target.name}`
                            }
                          >
                            {target.status === 'ACTIVE' ? (
                              <Ban size={14} />
                            ) : (
                              <CheckCircle2 size={14} />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="admin-danger"
                            disabled={target.id === me?.id}
                            onClick={() => removeUser(target)}
                            aria-label={`Delete ${target.name}`}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {users.length === 0 && (
                    <tr>
                      <td colSpan={5} className="admin-muted">
                        No users found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>

      <Modal
        isOpen={mode !== null}
        onClose={() => {
          setMode(null);
          setEditing(null);
          setError('');
        }}
        title={
          mode === 'create'
            ? 'Create user'
            : mode === 'edit'
              ? 'Edit user'
              : 'Reset password'
        }
        size="sm"
      >
        <form className="modal-form" onSubmit={submitForm}>
          {mode !== 'password' && (
            <>
              <Input
                label="Name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                maxLength={100}
              />
              <Input
                label="Email / username"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                maxLength={254}
              />
            </>
          )}
          {mode === 'create' && (
            <Input
              label="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
              minLength={5}
              autoComplete="new-password"
            />
          )}
          {mode === 'password' && (
            <>
              <p className="modal-message">
                Set a new password for {editing?.email}.
              </p>
              <Input
                label="New password"
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={5}
                autoComplete="new-password"
              />
            </>
          )}
          {mode !== 'password' && (
            <label className="input-wrapper">
              <span className="input-label">Role</span>
              <select
                className="select"
                value={form.role}
                onChange={(e) =>
                  setForm({ ...form, role: e.target.value as FormState['role'] })
                }
              >
                <option value="USER">USER</option>
                <option value="ADMIN">ADMIN</option>
              </select>
            </label>
          )}
          {mode === 'edit' && editing?.id === me?.id && (
            <p className="muted">You cannot demote or disable your own account.</p>
          )}
          <div className="modal-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setMode(null);
                setEditing(null);
                setError('');
              }}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {mode === 'create'
                ? 'Create'
                : mode === 'edit'
                  ? 'Save changes'
                  : 'Reset password'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        isOpen={confirm?.open ?? false}
        onClose={() => setConfirm(null)}
        onConfirm={runConfirm}
        title={confirm?.title ?? ''}
        message={confirm?.message ?? ''}
        confirmText="Confirm"
        variant="danger"
        loading={saving}
      />
    </div>
  );
}
