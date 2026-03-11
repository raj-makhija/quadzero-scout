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
    `&$select=id,subject,from,receivedDateTime,hasAttachments,internetMessageId` +
    `&$expand=attachments($select=id,name,contentType,contentBytes,size)`;

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
 * Filter a message's attachments to only PDF and DOCX file attachments.
 */
export function getResumeAttachments(message: GraphMessage): GraphAttachment[] {
  if (!message.attachments || message.attachments.length === 0) return [];

  return message.attachments.filter(
    (att) =>
      att.contentBytes &&
      SUPPORTED_ATTACHMENT_TYPES.includes(att.contentType.toLowerCase())
  );
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
