import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * Support ticket 20336934. A student clicked ONE superseded access link 16 times across 10
 * issued links, and every attempt returned the same sentence: "Invalid or expired link. Please
 * request a new one."
 *
 * That sentence is true and useless. Only one portal_token is stored per enrollment, so asking
 * for a link silently kills the previous one; the advice to request another is exactly what she
 * did, before going back to the email she already had open and clicking it again.
 *
 * These tests pin the guidance that breaks that loop. They are copy tests on purpose: the copy
 * IS the fix, so a future edit that drops it should fail rather than pass quietly.
 */
jest.mock('../../../contexts/ParticipantAuthContext', () => ({ useParticipantAuth: jest.fn() }));
jest.mock('../../../utils/portalApi', () => ({ __esModule: true, default: { get: jest.fn() } }));

const mockNavigate = jest.fn();
let mockSearch = '';
jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams(mockSearch)],
}));

import PortalVerifyPage from '../PortalVerifyPage';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import portalApi from '../../../utils/portalApi';

const mockedAuth = useParticipantAuth as jest.Mock;
const mockedGet = (portalApi as unknown as { get: jest.Mock }).get;

let container: HTMLDivElement;
let root: Root;

const mount = async () => { await act(async () => { root.render(<PortalVerifyPage />); }); };
const text = () => (container.textContent || '').replace(/\s+/g, ' ');

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockNavigate.mockReset();
  mockedAuth.mockReturnValue({ login: jest.fn() });
  mockedGet.mockReset();
  mockSearch = 'token=356ae2f5-0000-4000-8000-000000000000';
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('a failed sign-in says which email to open', () => {
  it('tells the student only the newest link works', async () => {
    mockedGet.mockRejectedValue({ response: { data: { error: 'Invalid or expired link. Please request a new one.' } } });
    await mount();

    // The server's sentence still shows: it is the literal truth about this token.
    expect(text()).toContain('Invalid or expired link.');
    // ...and now the part it cannot know, which is why she kept failing.
    expect(text()).toContain('Only the newest email works.');
    expect(text()).toContain('before requesting another');
  });

  it('shows the guidance even when the server sends no message at all', async () => {
    // A 500, a timeout or a proxy error all land here with no response body. The student is just
    // as stuck, so the advice must not depend on the server having explained itself.
    mockedGet.mockRejectedValue(new Error('network down'));
    await mount();

    expect(text()).toContain('Only the newest email works.');
  });

  it('says nothing about links when the sign-in succeeds', async () => {
    mockedGet.mockResolvedValue({ data: { jwt: 'header.payload.sig' } });
    await mount();

    expect(text()).not.toContain('Only the newest email works.');
    expect(mockNavigate).toHaveBeenCalledWith('/portal/today', { replace: true });
  });
});
