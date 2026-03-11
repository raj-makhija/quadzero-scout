import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// We'll test the graph client by mocking global.fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import {
  getAccessToken,
  getUnreadMessages,
  getResumeAttachments,
  markMessageAsRead,
  moveMessageToFolder,
  getMailFolderByName,
  invalidateTokenCache,
  type GraphConfig,
  type GraphMessage,
} from '../graphClient.js';

const testConfig: GraphConfig = {
  tenantId: 'test-tenant',
  clientId: 'test-client',
  clientSecret: 'test-secret',
  mailboxAddress: 'scout-ingest@test.com',
};

function mockFetchResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(JSON.stringify(body)),
    json: () => Promise.resolve(body),
  };
}

describe('graphClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateTokenCache();
  });

  describe('getAccessToken', () => {
    it('acquires a token from Azure AD', async () => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ access_token: 'test-token-123', expires_in: 3600 })
      );

      const token = await getAccessToken(testConfig);

      expect(token).toBe('test-token-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch.mock.calls[0][0]).toContain('login.microsoftonline.com/test-tenant');
    });

    it('returns cached token on second call', async () => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ access_token: 'cached-token', expires_in: 3600 })
      );

      const token1 = await getAccessToken(testConfig);
      const token2 = await getAccessToken(testConfig);

      expect(token1).toBe('cached-token');
      expect(token2).toBe('cached-token');
      expect(mockFetch).toHaveBeenCalledTimes(1); // Only one fetch call
    });

    it('throws on failed token acquisition', async () => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ error: 'invalid_client' }, 401)
      );

      await expect(getAccessToken(testConfig)).rejects.toThrow('Graph token acquisition failed (401)');
    });

    it('refreshes token after invalidation', async () => {
      mockFetch
        .mockResolvedValueOnce(
          mockFetchResponse({ access_token: 'token-1', expires_in: 3600 })
        )
        .mockResolvedValueOnce(
          mockFetchResponse({ access_token: 'token-2', expires_in: 3600 })
        );

      const token1 = await getAccessToken(testConfig);
      invalidateTokenCache();
      const token2 = await getAccessToken(testConfig);

      expect(token1).toBe('token-1');
      expect(token2).toBe('token-2');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUnreadMessages', () => {
    beforeEach(() => {
      // First call is always token acquisition
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ access_token: 'test-token', expires_in: 3600 })
      );
    });

    it('fetches unread messages from inbox', async () => {
      const messages = [
        {
          id: 'msg-1',
          subject: 'Resume submission',
          from: { emailAddress: { name: 'John', address: 'john@example.com' } },
          receivedDateTime: '2026-03-10T10:00:00Z',
          hasAttachments: true,
          internetMessageId: '<abc123@example.com>',
          attachments: [],
        },
      ];

      mockFetch.mockResolvedValueOnce(mockFetchResponse({ value: messages }));

      const result = await getUnreadMessages(testConfig, 5);

      expect(result).toHaveLength(1);
      expect(result[0].subject).toBe('Resume submission');
      expect(mockFetch).toHaveBeenCalledTimes(2); // token + messages
      expect(mockFetch.mock.calls[1][0]).toContain('isRead eq false');
      expect(mockFetch.mock.calls[1][0]).toContain('$top=5');
    });

    it('returns empty array when no messages', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ value: [] }));

      const result = await getUnreadMessages(testConfig);
      expect(result).toHaveLength(0);
    });

    it('throws on Graph API error', async () => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ error: { message: 'Forbidden' } }, 403)
      );

      await expect(getUnreadMessages(testConfig)).rejects.toThrow('Graph getUnreadMessages failed (403)');
    });
  });

  describe('getResumeAttachments', () => {
    it('filters to only PDF and DOCX attachments', () => {
      const message: GraphMessage = {
        id: 'msg-1',
        subject: 'Test',
        from: { emailAddress: { name: 'Test', address: 'test@test.com' } },
        receivedDateTime: '2026-03-10T10:00:00Z',
        hasAttachments: true,
        internetMessageId: '<test@test.com>',
        attachments: [
          { id: 'att-1', name: 'resume.pdf', contentType: 'application/pdf', contentBytes: 'abc', size: 100 },
          { id: 'att-2', name: 'photo.png', contentType: 'image/png', contentBytes: 'def', size: 200 },
          {
            id: 'att-3',
            name: 'cv.docx',
            contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            contentBytes: 'ghi',
            size: 300,
          },
          { id: 'att-4', name: 'notes.txt', contentType: 'text/plain', contentBytes: 'jkl', size: 50 },
        ],
      };

      const result = getResumeAttachments(message);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('resume.pdf');
      expect(result[1].name).toBe('cv.docx');
    });

    it('returns empty array when no attachments', () => {
      const message: GraphMessage = {
        id: 'msg-1',
        subject: 'Test',
        from: { emailAddress: { name: 'Test', address: 'test@test.com' } },
        receivedDateTime: '2026-03-10T10:00:00Z',
        hasAttachments: false,
        internetMessageId: '<test@test.com>',
      };

      expect(getResumeAttachments(message)).toHaveLength(0);
    });

    it('excludes attachments without contentBytes', () => {
      const message: GraphMessage = {
        id: 'msg-1',
        subject: 'Test',
        from: { emailAddress: { name: 'Test', address: 'test@test.com' } },
        receivedDateTime: '2026-03-10T10:00:00Z',
        hasAttachments: true,
        internetMessageId: '<test@test.com>',
        attachments: [
          { id: 'att-1', name: 'resume.pdf', contentType: 'application/pdf', contentBytes: '', size: 100 },
        ],
      };

      expect(getResumeAttachments(message)).toHaveLength(0);
    });
  });

  describe('markMessageAsRead', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ access_token: 'test-token', expires_in: 3600 })
      );
    });

    it('sends PATCH request to mark message as read', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({}, 200));

      await markMessageAsRead(testConfig, 'msg-123');

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toContain('/messages/msg-123');
      expect(options.method).toBe('PATCH');
      expect(JSON.parse(options.body)).toEqual({ isRead: true });
    });
  });

  describe('moveMessageToFolder', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ access_token: 'test-token', expires_in: 3600 })
      );
    });

    it('sends POST request to move message', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({}, 200));

      await moveMessageToFolder(testConfig, 'msg-123', 'folder-abc');

      const [url, options] = mockFetch.mock.calls[1];
      expect(url).toContain('/messages/msg-123/move');
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ destinationId: 'folder-abc' });
    });
  });

  describe('getMailFolderByName', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ access_token: 'test-token', expires_in: 3600 })
      );
    });

    it('returns folder ID when found', async () => {
      mockFetch.mockResolvedValueOnce(
        mockFetchResponse({ value: [{ id: 'folder-123', displayName: 'Processed' }] })
      );

      const folderId = await getMailFolderByName(testConfig, 'Processed');
      expect(folderId).toBe('folder-123');
    });

    it('returns null when folder not found', async () => {
      mockFetch.mockResolvedValueOnce(mockFetchResponse({ value: [] }));

      const folderId = await getMailFolderByName(testConfig, 'NonExistent');
      expect(folderId).toBeNull();
    });
  });
});
