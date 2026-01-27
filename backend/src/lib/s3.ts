import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
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

export async function generateDownloadUrl(s3Key: string): Promise<PresignedUrlResult> {
  const command = new GetObjectCommand({
    Bucket: config.s3.resumesBucket,
    Key: s3Key,
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
