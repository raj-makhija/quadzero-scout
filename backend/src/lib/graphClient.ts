/**
 * Microsoft Graph API client for reading emails from an M365 shared mailbox.
 * Uses OAuth2 client credentials flow (daemon app) — no user interaction needed.
 * Uses native fetch (Node.js 20) to avoid adding dependencies.
 */

export interface GraphConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailboxAddress: string;
}

export interface GraphEmailAddress {
  name: string;
  address: string;
}

export interface GraphAttachment {
  id: string;
  name: string;
  contentType: string;
  contentBytes: string; // base64-encoded
  size: number;
}

export interface GraphMessage {
  id: string;
  subject: string;
  from: { emailAddress: GraphEmailAddress };
  receivedDateTime: string;
  hasAttachments: boolean;
  attachments?: GraphAttachment[];
  internetMessageId: string; // RFC 822 Message-ID — globally unique, used for idempotency
  body?: { contentType: string; content: string };
}

interface GraphMailFolder {
  id: string;
  displayName: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number; // Unix timestamp in ms
}

// Module-level token cache (persists across invocations within a warm Lambda)
let tokenCache: TokenCache | null = null;

const SUPPORTED_ATTACHMENT_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const RESUME_FILE_EXTENSIONS = ['pdf', 'docx'];

/**
 * Check if an attachment's content type (or file extension fallback) indicates a resume file.
 * Handles MIME types with parameters (e.g., "application/pdf; name=file.pdf")
 * and falls back to file extension when contentType is generic (application/octet-stream).
 */
export function isResumeContentType(contentType: string, fileName: string): boolean {
  const baseMime = contentType.toLowerCase().split(';')[0].trim();
  if (SUPPORTED_ATTACHMENT_TYPES.includes(baseMime)) return true;
  if (baseMime === 'application/octet-stream') {
    const ext = fileName.toLowerCase().split('.').pop();
    return ext !== undefined && RESUME_FILE_EXTENSIONS.includes(ext);
  }
  return false;
}

/**
 * Acquire an OAuth2 access token using client credentials flow.
 * Caches the token in memory and refreshes 5 minutes before expiry.
 */
export async function getAccessToken(graphConfig: GraphConfig): Promise<string> {
  const now = Date.now();
  const REFRESH_BUFFER_MS = 5 * 60 * 1000; // 5 minutes

  if (tokenCache && tokenCache.expiresAt - REFRESH_BUFFER_MS > now) {
    return tokenCache.accessToken;
  }

  const tokenUrl = `https://login.microsoftonline.com/${graphConfig.tenantId}/oauth2/v2.0/token`;

  const body = new URLSearchParams({
    client_id: graphConfig.clientId,
    client_secret: graphConfig.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials',
  });

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph token acquisition failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

/**
 * Fetch unread messages from the shared mailbox Inbox, oldest first.
 * Includes attachments inline via $expand.
 * Only returns file attachments (not inline images or itemAttachments).
 */
export async function getUnreadMessages(
  graphConfig: GraphConfig,
  top: number = 10
): Promise<GraphMessage[]> {
  const token = await getAccessToken(graphConfig);
  const mailbox = encodeURIComponent(graphConfig.mailboxAddress);

  const url =
    `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders/Inbox/messages` +
    `?$filter=isRead eq false` +
    `&$top=${top}` +
    `&$orderby=receivedDateTime asc` +
    `&$select=id,subject,from,receivedDateTime,hasAttachments,internetMessageId,body` +
    `&$expand=attachments`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph getUnreadMessages failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { value: GraphMessage[] };
  return data.value || [];
}

/**
 * Fetch a single attachment's full content (including contentBytes) by ID.
 * Used as a fallback when $expand=attachments does not return contentBytes inline.
 */
async function fetchAttachmentContent(
  graphConfig: GraphConfig,
  messageId: string,
  attachmentId: string
): Promise<string | null> {
  const token = await getAccessToken(graphConfig);
  const mailbox = encodeURIComponent(graphConfig.mailboxAddress);
  const url =
    `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/attachments/${attachmentId}` +
    `?$select=id,contentBytes`;

  const response = await fetch(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    console.warn(
      `Email ingest: Failed to fetch attachment ${attachmentId} (${response.status})`
    );
    return null;
  }

  const data = (await response.json()) as { contentBytes?: string };
  return data.contentBytes || null;
}

/**
 * Filter a message's attachments to only PDF and DOCX file attachments.
 * If contentBytes is missing (Graph API list endpoint may omit it),
 * fetches attachment content individually as a fallback.
 */
export async function getResumeAttachments(
  graphConfig: GraphConfig,
  message: GraphMessage
): Promise<GraphAttachment[]> {
  if (!message.attachments || message.attachments.length === 0) return [];

  // Log all attachments for diagnostics
  for (const att of message.attachments) {
    console.log(
      `Email ingest: Attachment "${att.name}" — contentType="${att.contentType}", ` +
        `size=${att.size}, hasContentBytes=${!!att.contentBytes}`
    );
  }

  // Filter to resume-type attachments by MIME type or file extension
  const candidates = message.attachments.filter((att) =>
    isResumeContentType(att.contentType, att.name)
  );

  if (candidates.length === 0) return [];

  // For candidates missing contentBytes, fetch individually from Graph API
  const results: GraphAttachment[] = [];
  for (const att of candidates) {
    if (att.contentBytes) {
      results.push(att);
    } else {
      console.log(
        `Email ingest: contentBytes missing for "${att.name}", fetching individually`
      );
      const contentBytes = await fetchAttachmentContent(
        graphConfig,
        message.id,
        att.id
      );
      if (contentBytes) {
        results.push({ ...att, contentBytes });
      } else {
        console.warn(
          `Email ingest: Could not retrieve contentBytes for "${att.name}", skipping attachment`
        );
      }
    }
  }

  return results;
}

/**
 * Mark a message as read.
 */
export async function markMessageAsRead(
  graphConfig: GraphConfig,
  messageId: string
): Promise<void> {
  const token = await getAccessToken(graphConfig);
  const mailbox = encodeURIComponent(graphConfig.mailboxAddress);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ isRead: true }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph markMessageAsRead failed (${response.status}): ${errorText}`);
  }
}

/**
 * Move a message to a target folder by folder ID.
 */
export async function moveMessageToFolder(
  graphConfig: GraphConfig,
  messageId: string,
  folderId: string
): Promise<void> {
  const token = await getAccessToken(graphConfig);
  const mailbox = encodeURIComponent(graphConfig.mailboxAddress);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${mailbox}/messages/${messageId}/move`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ destinationId: folderId }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph moveMessageToFolder failed (${response.status}): ${errorText}`);
  }
}

/**
 * Get the folder ID of a top-level mail folder by display name.
 * Returns null if the folder does not exist.
 */
export async function getMailFolderByName(
  graphConfig: GraphConfig,
  folderName: string
): Promise<string | null> {
  const token = await getAccessToken(graphConfig);
  const mailbox = encodeURIComponent(graphConfig.mailboxAddress);

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${mailbox}/mailFolders` +
      `?$filter=displayName eq '${folderName}'&$select=id,displayName`,
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Graph getMailFolderByName failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { value: GraphMailFolder[] };
  return data.value.length > 0 ? data.value[0].id : null;
}

/**
 * Invalidate the cached access token (useful for retry after 401).
 */
export function invalidateTokenCache(): void {
  tokenCache = null;
}
