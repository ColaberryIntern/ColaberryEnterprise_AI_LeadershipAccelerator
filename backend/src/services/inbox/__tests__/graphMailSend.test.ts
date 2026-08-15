/**
 * Hotmail reply sending via the public Graph client.
 *
 * The stored refresh token was consented for Mail.Read/Mail.ReadWrite only, so
 * asking AAD for Mail.Send fails the ENTIRE token request with AADSTS70000 —
 * it does not return a reduced token. That is why the send scope is requested
 * on its own token and never folded into the read scope: doing so would break
 * inbox sync and auto-archive (both working) in exchange for a send path that
 * still would not work.
 *
 * These tests pin that isolation and the diagnosis quality of the failure.
 */
jest.mock('axios', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));

import axios from 'axios';
import { replyToMessage, MailSendConsentError } from '../graphMailService';

const post = (axios as any).post as jest.Mock;

const TOKEN_URL = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

function aadScopeDenied() {
  return {
    response: {
      data: {
        error: 'invalid_grant',
        error_description: 'AADSTS70000: The request was denied because one or more scopes requested are unauthorized or expired.',
      },
    },
  };
}

describe('replyToMessage (public Graph client)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.MS_GRAPH_CLIENT_ID = 'client-id';
    process.env.MS_GRAPH_REFRESH_TOKEN = 'refresh-token';
  });

  it('requests Mail.Send only on the send token, never on the shared read token', async () => {
    post.mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.resolve({ data: { access_token: 'tok', expires_in: 3600 } });
      return Promise.resolve({ data: {} });
    });

    await replyToMessage('msg-1', 'hello');

    const tokenCall = post.mock.calls.find((c) => c[0] === TOKEN_URL);
    expect(tokenCall).toBeDefined();
    expect(String(tokenCall![1])).toContain('Mail.Send');
  });

  it('posts the reply to the Graph reply endpoint with the comment body', async () => {
    post.mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.resolve({ data: { access_token: 'tok', expires_in: 3600 } });
      return Promise.resolve({ data: {} });
    });

    await replyToMessage('msg-42', 'the reply body');

    const replyCall = post.mock.calls.find((c) => String(c[0]).includes('/messages/msg-42/reply'));
    expect(replyCall).toBeDefined();
    expect(replyCall![1]).toEqual({ comment: 'the reply body' });
    expect(replyCall![2].headers.Authorization).toBe('Bearer tok');
  });

  it('raises a consent-specific error when Mail.Send was never granted', async () => {
    post.mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.reject(aadScopeDenied());
      return Promise.resolve({ data: {} });
    });

    await expect(replyToMessage('msg-1', 'hi')).rejects.toBeInstanceOf(MailSendConsentError);
  });

  it('names the required remediation rather than reporting a generic auth failure', async () => {
    post.mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.reject(aadScopeDenied());
      return Promise.resolve({ data: {} });
    });

    await expect(replyToMessage('msg-1', 'hi')).rejects.toThrow(/Mail\.Send/);
    await expect(replyToMessage('msg-1', 'hi')).rejects.toThrow(/MS_GRAPH_REFRESH_TOKEN/);
  });

  it('never attempts the reply when the token request fails', async () => {
    post.mockImplementation((url: string) => {
      if (url === TOKEN_URL) return Promise.reject(aadScopeDenied());
      return Promise.resolve({ data: {} });
    });

    await expect(replyToMessage('msg-1', 'hi')).rejects.toBeTruthy();

    expect(post.mock.calls.some((c) => String(c[0]).includes('/reply'))).toBe(false);
  });
});
