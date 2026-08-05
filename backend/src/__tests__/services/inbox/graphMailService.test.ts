import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

import { extractGraphErrorDetail, fetchInboxMessages, isConfigured } from '../../../services/inbox/graphMailService';

describe('graphMailService — error diagnostics', () => {
  describe('extractGraphErrorDetail (pure)', () => {
    it('extracts AAD token-endpoint error shape (invalid_grant)', () => {
      const error = { response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } };
      const result = extractGraphErrorDetail(error);
      expect(result.errorClass).toBe('MsGraphAuthError');
      expect(result.message).toContain('invalid_grant');
      expect(result.message).toContain('Token has been expired or revoked.');
    });

    it('extracts MS Graph API error shape (object form)', () => {
      const error = { response: { data: { error: { code: 'BadRequest', message: 'Invalid $select parameter.' } } } };
      const result = extractGraphErrorDetail(error);
      expect(result.errorClass).toBe('MsGraphRequestError');
      expect(result.message).toContain('BadRequest');
      expect(result.message).toContain('Invalid $select parameter.');
    });

    it('classifies InvalidAuthenticationToken as an auth-class error', () => {
      const error = { response: { data: { error: { code: 'InvalidAuthenticationToken', message: 'Access token has expired.' } } } };
      const result = extractGraphErrorDetail(error);
      expect(result.errorClass).toBe('MsGraphAuthError');
    });

    it('falls back to the generic error message when there is no response body', () => {
      const error = new Error('Network Error');
      const result = extractGraphErrorDetail(error);
      expect(result.errorClass).toBe('MsGraphRequestError');
      expect(result.message).toBe('Network Error');
    });

    it('never leaks a client_secret or access_token field from the error body', () => {
      const error = {
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'bad token',
            client_secret: 'super-secret-value',
            access_token: 'leaked-access-token',
          },
        },
      };
      const result = extractGraphErrorDetail(error);
      expect(result.message).not.toContain('super-secret-value');
      expect(result.message).not.toContain('leaked-access-token');
    });
  });

  describe('fetchInboxMessages — error propagation through getAccessToken', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      process.env.MS_GRAPH_CLIENT_ID = 'test-client-id';
      process.env.MS_GRAPH_REFRESH_TOKEN = 'dead-refresh-token';
    });

    it('is configured when both env vars are present', () => {
      expect(isConfigured()).toBe(true);
    });

    it('surfaces the real invalid_grant detail instead of a generic status-code message', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        response: { data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } },
      });

      await expect(fetchInboxMessages(10)).rejects.toThrow(/invalid_grant/);
    });
  });
});
