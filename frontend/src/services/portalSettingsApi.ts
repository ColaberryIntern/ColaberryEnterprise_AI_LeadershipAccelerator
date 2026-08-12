import portalApi from '../utils/portalApi';

// ── Shapes (mirror backend portalSettingsService.SettingsView) ───────────────

export interface SettingsAccount {
  id: string;
  full_name: string;
  email: string;
  tier: string;
  enrollment_type: string;
  status: string;
  cohort_name: string | null;
  member_since: string | null;
  // Organization / manager layer: true when this enrollment owns or manages an
  // org; `org` is that org's identity (drives the "Your company" nav + page).
  is_org_manager: boolean;
  org: { id: string; name: string } | null;
}
export interface SettingsProfile {
  title: string | null;
  company: string | null;
  company_size: string | null;
  phone: string | null;
  linkedin_url: string | null;
}
export interface SettingsResume {
  file_name: string;
  mime: string | null;
  size_bytes: number;
  uploaded_at: string | null;
}
export interface SettingsPersonalization {
  industry: string | null;
  role: string | null;
  seniority: string | null;
  years_experience: string | null;
  location: string | null;
  goals: string | null;
  skills: string | null;
}
export interface SettingsPreferences {
  email_updates: boolean;
  event_reminders: boolean;
  weekly_digest: boolean;
  community_visible: boolean;
  timezone: string | null;
  weekly_hours: string | null;
  primary_goal: string | null;
  preferred_contact: string | null;
  experience_level: string | null;
}
export interface SettingsView {
  account: SettingsAccount;
  profile: SettingsProfile;
  avatar_data_url: string | null;
  resume: SettingsResume | null;
  personalization: SettingsPersonalization;
  preferences: SettingsPreferences;
}

export interface ProfilePatch {
  full_name?: string;
  title?: string;
  company?: string;
  company_size?: string;
  phone?: string;
  linkedin_url?: string;
  personalization?: Partial<SettingsPersonalization>;
  preferences?: Partial<SettingsPreferences>;
}

// The shell reads the avatar from here for an instant, flash-free paint; the
// Settings page keeps it in sync on load and on every avatar change/removal.
export const AVATAR_CACHE_KEY = 'te_avatar';
// Cache states: absent key = "not fetched yet this session" (the shell fetches
// once to fill it); '' = "fetched, no photo"; a data URL = the photo. Cleared on
// login/logout so a shared device never shows the previous user's photo.
export function cacheAvatar(dataUrl: string | null): void {
  try { localStorage.setItem(AVATAR_CACHE_KEY, dataUrl || ''); } catch { /* ignore quota/availability */ }
  try { window.dispatchEvent(new CustomEvent('te-avatar-changed')); } catch { /* ignore */ }
}
export function readCachedAvatar(): string | null {
  try { return localStorage.getItem(AVATAR_CACHE_KEY); } catch { return null; }
}

// ── API calls ────────────────────────────────────────────────────────────────

export async function fetchSettings(): Promise<SettingsView> {
  const { data } = await portalApi.get<SettingsView>('/api/portal/settings');
  cacheAvatar(data.avatar_data_url);
  return data;
}

export async function updateProfile(patch: ProfilePatch): Promise<SettingsView> {
  const { data } = await portalApi.put<SettingsView>('/api/portal/settings/profile', patch);
  return data;
}

export async function uploadAvatar(dataUrl: string): Promise<SettingsView> {
  const { data } = await portalApi.post<SettingsView>('/api/portal/settings/avatar', { data_url: dataUrl });
  cacheAvatar(data.avatar_data_url);
  return data;
}

export async function removeAvatar(): Promise<SettingsView> {
  const { data } = await portalApi.delete<SettingsView>('/api/portal/settings/avatar');
  cacheAvatar(null);
  return data;
}

export async function uploadResume(file: { file_name: string; mime: string; data_base64: string }): Promise<SettingsView> {
  const { data } = await portalApi.post<SettingsView>('/api/portal/settings/resume', file);
  return data;
}

export async function removeResume(): Promise<SettingsView> {
  const { data } = await portalApi.delete<SettingsView>('/api/portal/settings/resume');
  return data;
}

/** Fetch the resume bytes and hand back an object URL the caller can download. */
export async function downloadResume(fileName: string): Promise<void> {
  const res = await portalApi.get('/api/portal/settings/resume', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName || 'resume';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── File helpers ─────────────────────────────────────────────────────────────

/** Read a file as pure base64 (no `data:` prefix) for the resume upload body. */
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale + center-crop an image file to a square `size`px JPEG data URL.
 * Keeps avatars tiny (a few KB) so they store cheaply in the DB and paint fast.
 */
export function downscaleImageToSquare(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error || new Error('Could not read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be loaded'));
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas unavailable'));
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.src = String(reader.result || '');
    };
    reader.readAsDataURL(file);
  });
}

/** Human-readable file size for the resume row. */
export function formatBytes(bytes: number): string {
  if (!bytes) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
