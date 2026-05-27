import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from './config.js';

const s3Client = new S3Client({ region: config.region });

export interface PresignedUrlResult {
  url: string;
  key: string;
  expiresIn: number;
}

export async function generateUploadUrl(
  fileName: string,
  contentType: string
): Promise<PresignedUrlResult> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const uniqueId = crypto.randomUUID();

  // Sanitize filename
  const sanitizedFileName = fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .toLowerCase();

  const key = `resumes/${year}/${month}/${uniqueId}-${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: config.s3.presignedUrlExpiry,
  });

  return {
    url,
    key,
    expiresIn: config.s3.presignedUrlExpiry,
  };
}

function getContentTypeFromKey(s3Key: string): string {
  const extension = s3Key.toLowerCase().split('.').pop();
  switch (extension) {
    case 'pdf': return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'doc': return 'application/msword';
    case 'jpg': case 'jpeg': return 'image/jpeg';
    case 'png': return 'image/png';
    default: return 'application/octet-stream';
  }
}

export interface DownloadUrlOptions {
  fileName?: string;
}

export async function generateDownloadUrl(s3Key: string, options?: DownloadUrlOptions): Promise<PresignedUrlResult> {
  const contentType = getContentTypeFromKey(s3Key);
  const disposition = options?.fileName
    ? `attachment; filename="${options.fileName}"`
    : 'inline';

  const command = new GetObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: s3Key,
    ResponseContentType: contentType,
    ResponseContentDisposition: disposition,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: config.s3.presignedUrlExpiry,
  });

  return {
    url,
    key: s3Key,
    expiresIn: config.s3.presignedUrlExpiry,
  };
}

export async function getObject(s3Key: string): Promise<Buffer> {
  const command = new GetObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: s3Key,
  });

  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('Empty response body from S3');
  }

  // Convert stream to buffer
  const chunks: Uint8Array[] = [];
  const reader = response.Body.transformToWebStream().getReader();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }

  return Buffer.concat(chunks);
}

export function extractFileNameFromKey(s3Key: string): string {
  const parts = s3Key.split('/');
  const fullName = parts[parts.length - 1];
  // Remove UUID prefix (format: uuid-filename)
  const match = fullName.match(/^[a-f0-9-]+-(.+)$/);
  return match ? match[1] : fullName;
}

export async function deleteObject(s3Key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: s3Key,
  });
  await s3Client.send(command);
}

export async function generateAttachmentUploadUrl(
  candidateId: string,
  fileName: string,
  contentType: string
): Promise<PresignedUrlResult> {
  const uniqueId = crypto.randomUUID();
  const sanitizedFileName = fileName
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .toLowerCase();
  const key = `candidate-attachments/${candidateId}/${uniqueId}-${sanitizedFileName}`;

  const command = new PutObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: key,
    ContentType: contentType,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: config.s3.presignedUrlExpiry,
  });

  return { url, key, expiresIn: config.s3.presignedUrlExpiry };
}

export async function generateAttachmentDownloadUrl(
  s3Key: string,
  fileName?: string
): Promise<PresignedUrlResult> {
  const contentType = getContentTypeFromKey(s3Key);
  const disposition = fileName
    ? `attachment; filename="${fileName}"`
    : 'inline';

  const command = new GetObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: s3Key,
    ResponseContentType: contentType,
    ResponseContentDisposition: disposition,
  });

  const url = await getSignedUrl(s3Client, command, {
    expiresIn: config.s3.presignedUrlExpiry,
  });

  return { url, key: s3Key, expiresIn: config.s3.presignedUrlExpiry };
}

export async function putObject(
  s3Key: string,
  content: string | Buffer,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: s3Key,
    Body: content,
    ContentType: contentType,
  });
  await s3Client.send(command);
}
