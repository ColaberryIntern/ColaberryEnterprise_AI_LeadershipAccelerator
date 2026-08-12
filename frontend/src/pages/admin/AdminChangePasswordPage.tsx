import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { firstAccessiblePath } from '../../components/Layout/adminNav';
import api from '../../utils/api';

const MIN_LENGTH = 12;

/**
 * Self-service password rotation for any admin-portal identity.
 *
 * Shipped 2026-08-09 alongside the sales-rep provisioning: those accounts are
 * handed out with a generated temp password, and until this page existed there
 * was no way for a rep to replace it. The welcome email links straight here.
 */
function AdminChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { canSection } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!currentPassword || !newPassword) {
      setError('Both your current and new password are required.');
      return;
    }
    if (newPassword.length < MIN_LENGTH) {
      setError(`Your new password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two new-password fields do not match.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current one.');
      return;
    }

    setSubmitting(true);
    try {
      await api.post('/api/admin/change-password', { currentPassword, newPassword });
      setDone(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Could not change your password. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 480 }}>
      <h1 className="h4 fw-bold mb-1">Change password</h1>
      <p className="text-muted mb-4" style={{ fontSize: '0.9rem' }}>
        If you signed in with a temporary password, replace it here.
      </p>

      {done ? (
        <div>
          <div className="alert alert-success py-2" role="status">
            Your password has been changed. It takes effect the next time you sign in.
          </div>
          <button className="btn btn-primary" onClick={() => navigate(firstAccessiblePath(canSection))}>
            Back to work
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="alert alert-danger py-2" role="alert">
              {error}
            </div>
          )}

          <div className="mb-3">
            <label htmlFor="currentPassword" className="form-label">Current password</label>
            <input
              type="password"
              className="form-control"
              id="currentPassword"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoFocus
              required
            />
          </div>

          <div className="mb-3">
            <label htmlFor="newPassword" className="form-label">New password</label>
            <input
              type="password"
              className="form-control"
              id="newPassword"
              autoComplete="new-password"
              aria-describedby="newPasswordHelp"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <div id="newPasswordHelp" className="form-text">
              At least {MIN_LENGTH} characters.
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="confirmPassword" className="form-label">Confirm new password</label>
            <input
              type="password"
              className="form-control"
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Saving...' : 'Change password'}
          </button>
        </form>
      )}
    </div>
  );
}

export default AdminChangePasswordPage;
