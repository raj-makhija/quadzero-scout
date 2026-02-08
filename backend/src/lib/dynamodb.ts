import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  DeleteCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config.js';
import type { CandidateItem, SavedSearch, User, SearchCriteria, UserStatus, UserRole, PromptItem } from '../types/index.js';

const client = new DynamoDBClient({ region: config.region });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

// Experience bucket helper
export function getExperienceBucket(years: number): string {
  if (years <= 2) return '0-2';
  if (years <= 5) return '3-5';
  if (years <= 10) return '6-10';
  if (years <= 15) return '11-15';
  return '16+';
}

// Candidate Profile Operations
export async function getCandidateById(candidateId: string): Promise<CandidateItem | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.talentProfilesTable,
      Key: { candidate_id: candidateId },
    })
  );
  return (result.Item as CandidateItem) || null;
}

export async function getCandidateByUserId(userId: string): Promise<CandidateItem | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.talentProfilesTable,
      IndexName: 'UserIdIndex',
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: { ':userId': userId },
      Limit: 1,
    })
  );
  return (result.Items?.[0] as CandidateItem) || null;
}

export async function saveCandidateProfile(candidate: CandidateItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.talentProfilesTable,
      Item: candidate,
    })
  );
}

export async function searchCandidates(
  criteria: SearchCriteria,
  limit: number = 20,
  lastEvaluatedKey?: Record<string, unknown>
): Promise<{ items: CandidateItem[]; lastKey?: Record<string, unknown> }> {
  const filterExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  // Build filter expressions based on criteria
  if (criteria.minExperience !== undefined) {
    filterExpressions.push('total_experience >= :minExp');
    expressionAttributeValues[':minExp'] = criteria.minExperience;
  }

  if (criteria.maxExperience !== undefined) {
    filterExpressions.push('total_experience <= :maxExp');
    expressionAttributeValues[':maxExp'] = criteria.maxExperience;
  }

  if (criteria.seniority && criteria.seniority.length > 0) {
    const seniorityConditions = criteria.seniority.map((_, i) => `:sen${i}`);
    filterExpressions.push(`seniority IN (${seniorityConditions.join(', ')})`);
    criteria.seniority.forEach((s, i) => {
      expressionAttributeValues[`:sen${i}`] = s;
    });
  }

  if (criteria.availability && criteria.availability.length > 0) {
    const availConditions = criteria.availability.map((_, i) => `:avail${i}`);
    filterExpressions.push(`availability IN (${availConditions.join(', ')})`);
    criteria.availability.forEach((a, i) => {
      expressionAttributeValues[`:avail${i}`] = a;
    });
  }

  if (criteria.location) {
    filterExpressions.push('contains(#loc, :location)');
    expressionAttributeNames['#loc'] = 'location';
    expressionAttributeValues[':location'] = criteria.location.toLowerCase();
  }

  const scanParams: {
    TableName: string;
    Limit: number;
    ExclusiveStartKey?: Record<string, unknown>;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  } = {
    TableName: config.dynamodb.talentProfilesTable,
    Limit: limit,
  };

  if (lastEvaluatedKey) {
    scanParams.ExclusiveStartKey = lastEvaluatedKey;
  }

  if (filterExpressions.length > 0) {
    scanParams.FilterExpression = filterExpressions.join(' AND ');
    if (Object.keys(expressionAttributeNames).length > 0) {
      scanParams.ExpressionAttributeNames = expressionAttributeNames;
    }
    scanParams.ExpressionAttributeValues = expressionAttributeValues;
  }

  const result = await docClient.send(new ScanCommand(scanParams));

  return {
    items: (result.Items || []) as CandidateItem[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

// User Operations
export async function getUserById(userId: string): Promise<User | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.usersTable,
      Key: { id: userId },
    })
  );
  return (result.Item as User) || null;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.usersTable,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    })
  );
  return (result.Items?.[0] as User) || null;
}

export async function saveUser(user: User): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.usersTable,
      Item: user,
    })
  );
}

// Saved Search Operations
export async function getSavedSearches(recruiterId: string): Promise<SavedSearch[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.savedSearchesTable,
      KeyConditionExpression: 'recruiter_id = :recruiterId',
      ExpressionAttributeValues: { ':recruiterId': recruiterId },
    })
  );
  return (result.Items || []) as SavedSearch[];
}

export async function saveSavedSearch(search: SavedSearch): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.savedSearchesTable,
      Item: {
        recruiter_id: search.recruiterId,
        search_id: search.searchId,
        name: search.name,
        criteria: search.criteria,
        last_run: search.lastRun,
        result_count: search.resultCount,
        created_at: search.createdAt,
      },
    })
  );
}

export async function deleteSavedSearch(recruiterId: string, searchId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: config.dynamodb.savedSearchesTable,
      Key: {
        recruiter_id: recruiterId,
        search_id: searchId,
      },
    })
  );
}

export async function updateSavedSearchStats(
  recruiterId: string,
  searchId: string,
  resultCount: number
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.savedSearchesTable,
      Key: {
        recruiter_id: recruiterId,
        search_id: searchId,
      },
      UpdateExpression: 'SET last_run = :lastRun, result_count = :count',
      ExpressionAttributeValues: {
        ':lastRun': new Date().toISOString(),
        ':count': resultCount,
      },
    })
  );
}

// Admin: Get users by status (optionally filtered by role)
export async function getUsersByStatus(
  status: UserStatus,
  role?: UserRole
): Promise<User[]> {
  // DynamoDB scan with filter (no GSI for status yet)
  const filterExpressions: string[] = ['#status = :status'];
  const expressionAttributeNames: Record<string, string> = { '#status': 'status' };
  const expressionAttributeValues: Record<string, unknown> = { ':status': status };

  if (role) {
    filterExpressions.push('#role = :role');
    expressionAttributeNames['#role'] = 'role';
    expressionAttributeValues[':role'] = role;
  }

  const result = await docClient.send(
    new ScanCommand({
      TableName: config.dynamodb.usersTable,
      FilterExpression: filterExpressions.join(' AND '),
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );

  return (result.Items || []) as User[];
}

// Admin: Update user status
export async function updateUserStatus(
  userId: string,
  status: UserStatus,
  adminId: string
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.usersTable,
      Key: { id: userId },
      UpdateExpression: 'SET #status = :status, statusUpdatedAt = :updatedAt, statusUpdatedBy = :updatedBy',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': status,
        ':updatedAt': new Date().toISOString(),
        ':updatedBy': adminId,
      },
    })
  );
}

// Prompts Operations
export async function getActivePrompt(promptKey: string): Promise<PromptItem | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.promptsTable,
      KeyConditionExpression: 'prompt_key = :key',
      FilterExpression: 'is_active = :active',
      ExpressionAttributeValues: {
        ':key': promptKey,
        ':active': true,
      },
      ScanIndexForward: false, // Latest version first
      Limit: 1,
    })
  );
  return (result.Items?.[0] as PromptItem) || null;
}

export async function getPromptVersions(promptKey: string): Promise<PromptItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.promptsTable,
      KeyConditionExpression: 'prompt_key = :key',
      ExpressionAttributeValues: { ':key': promptKey },
      ScanIndexForward: false, // Latest version first
    })
  );
  return (result.Items || []) as PromptItem[];
}

export async function getAllPromptKeys(): Promise<string[]> {
  const result = await docClient.send(
    new ScanCommand({
      TableName: config.dynamodb.promptsTable,
      ProjectionExpression: 'prompt_key',
    })
  );
  // Deduplicate prompt keys
  const keys = new Set<string>();
  (result.Items || []).forEach(item => keys.add(item.prompt_key as string));
  return Array.from(keys);
}

export async function getNextPromptVersion(promptKey: string): Promise<number> {
  const versions = await getPromptVersions(promptKey);
  if (versions.length === 0) return 1;
  return Math.max(...versions.map(v => v.version)) + 1;
}

export async function savePromptVersion(prompt: PromptItem): Promise<void> {
  // Deactivate all existing versions for this prompt key
  const existingVersions = await getPromptVersions(prompt.prompt_key);
  for (const existing of existingVersions) {
    if (existing.is_active) {
      await docClient.send(
        new UpdateCommand({
          TableName: config.dynamodb.promptsTable,
          Key: { prompt_key: existing.prompt_key, version: existing.version },
          UpdateExpression: 'SET is_active = :inactive',
          ExpressionAttributeValues: { ':inactive': false },
        })
      );
    }
  }

  // Save new version as active
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.promptsTable,
      Item: prompt,
    })
  );
}

// Update candidate's formatted resume S3 key
export async function updateCandidateFormattedResume(
  candidateId: string,
  formattedS3Key: string | null
): Promise<void> {
  const now = new Date().toISOString();

  if (formattedS3Key) {
    await docClient.send(
      new UpdateCommand({
        TableName: config.dynamodb.talentProfilesTable,
        Key: { candidate_id: candidateId },
        UpdateExpression: 'SET formatted_resume_s3_key = :key, formatted_at = :at, last_updated = :now',
        ExpressionAttributeValues: {
          ':key': formattedS3Key,
          ':at': now,
          ':now': now,
        },
      })
    );
  } else {
    await docClient.send(
      new UpdateCommand({
        TableName: config.dynamodb.talentProfilesTable,
        Key: { candidate_id: candidateId },
        UpdateExpression: 'REMOVE formatted_resume_s3_key, formatted_at SET last_updated = :now',
        ExpressionAttributeValues: {
          ':now': now,
        },
      })
    );
  }
}
