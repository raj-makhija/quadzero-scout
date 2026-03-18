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
import type { CandidateItem, SavedSearch, User, SearchCriteria, UserStatus, UserRole, PromptItem, BulkImportBatchItem, RequirementItem, RequirementRequestEntry, StatusHistoryEntry, RequirementChangeEntry, PricingConfig, PricingConfigItem, SessionSettings, SessionSettingsItem, ShortlistItem, ClientItem, ScreeningItem, AuditLogItem, AuditLogEntry } from '../types/index.js';
import { DEFAULT_SESSION_TIMEOUT_SECONDS } from '../types/index.js';

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

export async function getCandidateByEmail(email: string): Promise<CandidateItem | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.talentProfilesTable,
      IndexName: 'EmailIndex',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
      Limit: 1,
    })
  );
  return (result.Items?.[0] as CandidateItem) || null;
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
      Item: { ...candidate, _type: 'PROFILE' },
    })
  );
}

export async function searchCandidates(
  _criteria: SearchCriteria,
  _limit?: number,
  lastEvaluatedKey?: Record<string, unknown>
): Promise<{ items: CandidateItem[]; lastKey?: Record<string, unknown> }> {
  // Experience, seniority, availability, and location are no longer hard filters —
  // they are handled as scoring factors in matchScoring.ts so that non-matching
  // candidates still appear in results (ranked lower with mismatches called out).
  const filterExpressions: string[] = [];
  const expressionAttributeNames: Record<string, string> = {};
  const expressionAttributeValues: Record<string, unknown> = {};

  const PAGE_SIZE = 100;
  const MAX_ITEMS = 500;

  const baseScanParams: {
    TableName: string;
    Limit: number;
    ExclusiveStartKey?: Record<string, unknown>;
    FilterExpression?: string;
    ExpressionAttributeNames?: Record<string, string>;
    ExpressionAttributeValues?: Record<string, unknown>;
  } = {
    TableName: config.dynamodb.talentProfilesTable,
    Limit: PAGE_SIZE,
  };

  if (filterExpressions.length > 0) {
    baseScanParams.FilterExpression = filterExpressions.join(' AND ');
    if (Object.keys(expressionAttributeNames).length > 0) {
      baseScanParams.ExpressionAttributeNames = expressionAttributeNames;
    }
    baseScanParams.ExpressionAttributeValues = expressionAttributeValues;
  }

  const allItems: CandidateItem[] = [];
  let currentKey: Record<string, unknown> | undefined = lastEvaluatedKey;

  do {
    const scanParams = { ...baseScanParams };
    if (currentKey) {
      scanParams.ExclusiveStartKey = currentKey;
    }

    const result = await docClient.send(new ScanCommand(scanParams));
    const items = (result.Items || []) as CandidateItem[];
    allItems.push(...items);

    currentKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (currentKey && allItems.length < MAX_ITEMS);

  return {
    items: allItems,
    lastKey: currentKey,
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

// Bulk Import Batch Operations
export async function createBulkImportBatch(batch: BulkImportBatchItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.bulkImportBatchesTable,
      Item: batch,
    })
  );
}

export async function getBulkImportBatch(batchId: string): Promise<BulkImportBatchItem | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.bulkImportBatchesTable,
      Key: { batch_id: batchId },
    })
  );
  return (result.Item as BulkImportBatchItem) || null;
}

export async function updateBulkImportFileStatus(
  batchId: string,
  fileIndex: number,
  status: string,
  result?: { candidateId?: string; candidateName?: string; confidence?: number; isUpdate?: boolean; error?: string }
): Promise<void> {
  const now = new Date().toISOString();

  let updateExpression = `SET files[${fileIndex}].#status = :status, updated_at = :now`;
  const expressionAttributeNames: Record<string, string> = { '#status': 'status' };
  const expressionAttributeValues: Record<string, unknown> = {
    ':status': status,
    ':now': now,
  };

  if (status === 'completed' || status === 'failed') {
    updateExpression += `, files[${fileIndex}].processed_at = :processedAt`;
    expressionAttributeValues[':processedAt'] = now;
  }

  if (result?.candidateId) {
    updateExpression += `, files[${fileIndex}].candidate_id = :candidateId`;
    expressionAttributeValues[':candidateId'] = result.candidateId;
  }

  if (result?.candidateName) {
    updateExpression += `, files[${fileIndex}].candidate_name = :candidateName`;
    expressionAttributeValues[':candidateName'] = result.candidateName;
  }

  if (result?.confidence !== undefined) {
    updateExpression += `, files[${fileIndex}].confidence = :confidence`;
    expressionAttributeValues[':confidence'] = result.confidence;
  }

  if (result?.isUpdate !== undefined) {
    updateExpression += `, files[${fileIndex}].is_update = :isUpdate`;
    expressionAttributeValues[':isUpdate'] = result.isUpdate;
  }

  if (result?.error) {
    updateExpression += `, files[${fileIndex}].#error = :error`;
    expressionAttributeNames['#error'] = 'error';
    expressionAttributeValues[':error'] = result.error.substring(0, 500);
  }

  if (status === 'completed') {
    updateExpression += ' ADD completed_count :one';
    expressionAttributeValues[':one'] = 1;
  } else if (status === 'failed') {
    updateExpression += ' ADD failed_count :one';
    expressionAttributeValues[':one'] = 1;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.bulkImportBatchesTable,
      Key: { batch_id: batchId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

export async function finalizeBulkImportBatch(batchId: string): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.bulkImportBatchesTable,
      Key: { batch_id: batchId },
      UpdateExpression: 'SET #status = :status, updated_at = :now',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':status': 'completed',
        ':now': new Date().toISOString(),
      },
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
        UpdateExpression: 'SET formatted_resume_s3_key = :key, formatted_at = :at, last_updated = :now, #type = :type',
        ExpressionAttributeNames: { '#type': '_type' },
        ExpressionAttributeValues: {
          ':key': formattedS3Key,
          ':at': now,
          ':now': now,
          ':type': 'PROFILE',
        },
      })
    );
  } else {
    await docClient.send(
      new UpdateCommand({
        TableName: config.dynamodb.talentProfilesTable,
        Key: { candidate_id: candidateId },
        UpdateExpression: 'REMOVE formatted_resume_s3_key, formatted_at SET last_updated = :now, #type = :type',
        ExpressionAttributeNames: { '#type': '_type' },
        ExpressionAttributeValues: {
          ':now': now,
          ':type': 'PROFILE',
        },
      })
    );
  }
}

// Update candidate CTC fields (internal recruiter use)
export async function updateCandidateCtc(
  candidateId: string,
  expectedCtc: number,
  currentCtc?: number
): Promise<void> {
  const now = new Date().toISOString();

  const expressionParts = ['expected_ctc = :ectc', 'last_updated = :now', '#type = :type'];
  const values: Record<string, unknown> = {
    ':ectc': expectedCtc,
    ':now': now,
    ':type': 'PROFILE',
  };

  if (currentCtc !== undefined) {
    expressionParts.push('current_ctc = :cctc');
    values[':cctc'] = currentCtc;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.talentProfilesTable,
      Key: { candidate_id: candidateId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeNames: { '#type': '_type' },
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(candidate_id)',
    })
  );
}

export async function updateCandidateCustomFields(
  candidateId: string,
  customFields: Record<string, string | number>
): Promise<void> {
  const now = new Date().toISOString();
  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.talentProfilesTable,
      Key: { candidate_id: candidateId },
      UpdateExpression: 'SET custom_fields = :cf, last_updated = :now, #type = :type',
      ExpressionAttributeNames: { '#type': '_type' },
      ExpressionAttributeValues: {
        ':cf': customFields,
        ':now': now,
        ':type': 'PROFILE',
      },
      ConditionExpression: 'attribute_exists(candidate_id)',
    })
  );
}

// Requirement Operations
export async function saveRequirement(item: RequirementItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.requirementsTable,
      Item: item,
    })
  );
}

export async function getRequirementById(requirementId: string): Promise<RequirementItem | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.requirementsTable,
      Key: { requirement_id: requirementId },
    })
  );
  return (result.Item as RequirementItem) || null;
}

export async function getRequirementsByClient(
  clientNameLower: string,
  dateFrom?: string,
  dateTo?: string,
  limit: number = 20,
  lastEvaluatedKey?: Record<string, unknown>,
  statusFilter?: string
): Promise<{ items: RequirementItem[]; lastKey?: Record<string, unknown> }> {
  let keyCondition = 'client_name_lower = :client';
  const expressionValues: Record<string, unknown> = { ':client': clientNameLower };
  const expressionAttributeNames: Record<string, string> = {};

  if (dateFrom && dateTo) {
    keyCondition += ' AND created_at BETWEEN :from AND :to';
    expressionValues[':from'] = dateFrom;
    expressionValues[':to'] = dateTo;
  } else if (dateFrom) {
    keyCondition += ' AND created_at >= :from';
    expressionValues[':from'] = dateFrom;
  } else if (dateTo) {
    keyCondition += ' AND created_at <= :to';
    expressionValues[':to'] = dateTo;
  }

  const params: {
    TableName: string;
    IndexName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    ExpressionAttributeNames?: Record<string, string>;
    FilterExpression?: string;
    Limit: number;
    ScanIndexForward: boolean;
    ExclusiveStartKey?: Record<string, unknown>;
  } = {
    TableName: config.dynamodb.requirementsTable,
    IndexName: 'ClientNameIndex',
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: expressionValues,
    Limit: limit,
    ScanIndexForward: false,
  };

  if (statusFilter) {
    expressionAttributeNames['#status'] = 'status';
    expressionValues[':statusVal'] = statusFilter;
    params.FilterExpression = '#status = :statusVal';
    params.ExpressionAttributeNames = expressionAttributeNames;
  }

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  const result = await docClient.send(new QueryCommand(params));
  return {
    items: (result.Items || []) as RequirementItem[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export async function getRequirementsByRecruiter(
  recruiterId: string,
  limit: number = 20,
  lastEvaluatedKey?: Record<string, unknown>
): Promise<{ items: RequirementItem[]; lastKey?: Record<string, unknown> }> {
  const params: {
    TableName: string;
    IndexName: string;
    KeyConditionExpression: string;
    ExpressionAttributeValues: Record<string, unknown>;
    Limit: number;
    ScanIndexForward: boolean;
    ExclusiveStartKey?: Record<string, unknown>;
  } = {
    TableName: config.dynamodb.requirementsTable,
    IndexName: 'RecruiterIndex',
    KeyConditionExpression: 'recruiter_id = :rid',
    ExpressionAttributeValues: { ':rid': recruiterId },
    Limit: limit,
    ScanIndexForward: false,
  };

  if (lastEvaluatedKey) {
    params.ExclusiveStartKey = lastEvaluatedKey;
  }

  const result = await docClient.send(new QueryCommand(params));
  return {
    items: (result.Items || []) as RequirementItem[],
    lastKey: result.LastEvaluatedKey as Record<string, unknown> | undefined,
  };
}

export async function getActiveRequirementsByClient(
  clientNameLower: string
): Promise<RequirementItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.requirementsTable,
      IndexName: 'ClientNameIndex',
      KeyConditionExpression: 'client_name_lower = :client',
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: {
        ':client': clientNameLower,
        ':active': 'active',
      },
      ScanIndexForward: false,
      Limit: 10,
    })
  );
  return (result.Items || []) as RequirementItem[];
}

export async function getDistinctClientNames(): Promise<{ clientNames: string[]; endClients: string[] }> {
  const clientNameSet = new Set<string>();
  const endClientSet = new Set<string>();
  let currentKey: Record<string, unknown> | undefined;

  do {
    const params: {
      TableName: string;
      ProjectionExpression: string;
      ExclusiveStartKey?: Record<string, unknown>;
    } = {
      TableName: config.dynamodb.requirementsTable,
      ProjectionExpression: 'client_name, end_client',
    };

    if (currentKey) {
      params.ExclusiveStartKey = currentKey;
    }

    const result = await docClient.send(new ScanCommand(params));
    for (const item of (result.Items || []) as Pick<RequirementItem, 'client_name' | 'end_client'>[]) {
      if (item.client_name) clientNameSet.add(item.client_name);
      if (item.end_client) endClientSet.add(item.end_client);
    }
    currentKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (currentKey);

  return {
    clientNames: Array.from(clientNameSet).sort((a, b) => a.localeCompare(b)),
    endClients: Array.from(endClientSet).sort((a, b) => a.localeCompare(b)),
  };
}

export async function updateRequirementStatus(
  requirementId: string,
  status: string,
  statusHistoryEntry?: StatusHistoryEntry,
  duplicateOf?: string
): Promise<void> {
  let updateExpression = 'SET #status = :status, last_updated = :now';
  const expressionAttributeNames: Record<string, string> = { '#status': 'status' };
  const expressionAttributeValues: Record<string, unknown> = {
    ':status': status,
    ':now': new Date().toISOString(),
  };

  if (duplicateOf) {
    updateExpression += ', duplicate_of = :dupOf';
    expressionAttributeValues[':dupOf'] = duplicateOf;
  }

  if (statusHistoryEntry) {
    updateExpression += ', status_history = list_append(if_not_exists(status_history, :emptyList), :newStatusEntry)';
    expressionAttributeValues[':newStatusEntry'] = [statusHistoryEntry];
    expressionAttributeValues[':emptyList'] = [];
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.requirementsTable,
      Key: { requirement_id: requirementId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
    })
  );
}

export async function updateRequirementNotifyIds(
  requirementId: string,
  notifyRecruiterIds: string[]
): Promise<void> {
  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.requirementsTable,
      Key: { requirement_id: requirementId },
      UpdateExpression: 'SET notify_recruiter_ids = :ids, last_updated = :now',
      ExpressionAttributeValues: {
        ':ids': notifyRecruiterIds,
        ':now': new Date().toISOString(),
      },
      ConditionExpression: 'attribute_exists(requirement_id)',
    })
  );
}

export async function consolidateRequirement(
  requirementId: string,
  entry: RequirementRequestEntry,
  contributingRecruiters: string[],
  demandScore: number
): Promise<void> {
  const now = new Date().toISOString();

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.requirementsTable,
      Key: { requirement_id: requirementId },
      UpdateExpression: `
        SET request_history = list_append(if_not_exists(request_history, :emptyList), :newEntry),
            request_count = if_not_exists(request_count, :one) + :one,
            last_requested_at = :now,
            contributing_recruiters = :recruiters,
            demand_score = :demandScore,
            last_updated = :now
      `,
      ExpressionAttributeValues: {
        ':newEntry': [entry],
        ':emptyList': [],
        ':one': 1,
        ':now': now,
        ':recruiters': contributingRecruiters,
        ':demandScore': demandScore,
      },
      ConditionExpression: 'attribute_exists(requirement_id)',
    })
  );
}

export async function updateRequirementCriteria(
  requirementId: string,
  parsedCriteria: Record<string, unknown>,
  budgetMaxLpa: number | undefined,
  now: string
): Promise<void> {
  let updateExpression = 'SET parsed_criteria = :criteria, last_updated = :now';
  const expressionAttributeValues: Record<string, unknown> = {
    ':criteria': parsedCriteria,
    ':now': now,
  };

  if (budgetMaxLpa !== undefined) {
    updateExpression += ', budget_max_lpa = :budget';
    expressionAttributeValues[':budget'] = budgetMaxLpa;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.requirementsTable,
      Key: { requirement_id: requirementId },
      UpdateExpression: updateExpression,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'attribute_exists(requirement_id)',
    })
  );
}

export async function updateRequirementFields(
  requirementId: string,
  fields: Record<string, unknown>,
  changeEntry: RequirementChangeEntry
): Promise<void> {
  const setParts: string[] = ['last_updated = :now'];
  const expressionAttributeValues: Record<string, unknown> = {
    ':now': changeEntry.changed_at,
    ':newChangeEntry': [changeEntry],
    ':emptyList': [],
  };
  const expressionAttributeNames: Record<string, string> = {};

  let idx = 0;
  for (const [key, value] of Object.entries(fields)) {
    const placeholder = `:f${idx}`;
    // Use expression attribute names for reserved words
    const nameAlias = `#f${idx}`;
    expressionAttributeNames[nameAlias] = key;
    setParts.push(`${nameAlias} = ${placeholder}`);
    expressionAttributeValues[placeholder] = value;
    idx++;
  }

  const updateExpression = `SET ${setParts.join(', ')}, change_history = list_append(if_not_exists(change_history, :emptyList), :newChangeEntry)`;

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.requirementsTable,
      Key: { requirement_id: requirementId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: expressionAttributeNames,
      ExpressionAttributeValues: expressionAttributeValues,
      ConditionExpression: 'attribute_exists(requirement_id)',
    })
  );
}

// ─── Pricing Config Operations ──────────────────────────────────────────────

const DEFAULT_PRICING_CONFIG: PricingConfig = {
  platformFees: { junior: 25000, mid: 25000, senior: 30000, architect: 35000 },
  variableMarkupPct: { junior: 0.10, mid: 0.10, senior: 0.12, architect: 0.15 },
  minContributionPerMonth: 30000,
  idealContributionPerMonth: 40000,
  costOfCapitalPctAnnual: 0.12,
  negotiationBufferPct: 0.05,
  annualRecruiterCost: 600000,
  maxCostMultiplierThreshold: 1.75,
  maxContributionCapPerMonth: 70000,
  budgetCeilingBufferPct: 0.02,
  contractDurationDiscount: {
    thresholds: [
      { minMonths: 1, maxMonths: 5, discountPct: 0 },
      { minMonths: 6, maxMonths: 11, discountPct: 0.05 },
      { minMonths: 12, maxMonths: 23, discountPct: 0.10 },
      { minMonths: 24, maxMonths: 60, discountPct: 0.15 },
    ],
  },
};

let pricingConfigCache: { config: PricingConfig; fetchedAt: number } | null = null;
const PRICING_CONFIG_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getActivePricingConfig(): Promise<PricingConfig> {
  if (pricingConfigCache && Date.now() - pricingConfigCache.fetchedAt < PRICING_CONFIG_CACHE_TTL) {
    return pricingConfigCache.config;
  }

  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: config.dynamodb.pricingConfigTable,
        KeyConditionExpression: 'config_key = :key',
        FilterExpression: 'is_active = :active',
        ExpressionAttributeValues: {
          ':key': 'default',
          ':active': true,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    const item = result.Items?.[0] as PricingConfigItem | undefined;
    const pricingConfig = item?.config ?? DEFAULT_PRICING_CONFIG;
    pricingConfigCache = { config: pricingConfig, fetchedAt: Date.now() };
    return pricingConfig;
  } catch {
    return DEFAULT_PRICING_CONFIG;
  }
}

export async function savePricingConfig(
  pricingConf: PricingConfig,
  createdBy: string,
  description?: string
): Promise<number> {
  // Get latest version number
  const existing = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.pricingConfigTable,
      KeyConditionExpression: 'config_key = :key',
      ExpressionAttributeValues: { ':key': 'default' },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  const latestVersion = (existing.Items?.[0] as PricingConfigItem | undefined)?.version ?? 0;
  const newVersion = latestVersion + 1;

  // Deactivate current active version
  const activeItems = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.pricingConfigTable,
      KeyConditionExpression: 'config_key = :key',
      FilterExpression: 'is_active = :active',
      ExpressionAttributeValues: {
        ':key': 'default',
        ':active': true,
      },
    })
  );

  for (const item of (activeItems.Items || []) as PricingConfigItem[]) {
    await docClient.send(
      new UpdateCommand({
        TableName: config.dynamodb.pricingConfigTable,
        Key: { config_key: item.config_key, version: item.version },
        UpdateExpression: 'SET is_active = :inactive',
        ExpressionAttributeValues: { ':inactive': false },
      })
    );
  }

  // Save new version
  const newItem: PricingConfigItem = {
    config_key: 'default',
    version: newVersion,
    config: pricingConf,
    is_active: true,
    created_at: new Date().toISOString(),
    created_by: createdBy,
    ...(description && { description }),
  };

  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.pricingConfigTable,
      Item: newItem,
    })
  );

  // Invalidate cache
  pricingConfigCache = null;

  return newVersion;
}

// ─── Session Settings (reuses PricingConfig table with config_key = 'session_settings') ───

const DEFAULT_SESSION_SETTINGS: SessionSettings = {
  sessionTimeoutSeconds: DEFAULT_SESSION_TIMEOUT_SECONDS,
};

let sessionSettingsCache: { settings: SessionSettings; fetchedAt: number } | null = null;
const SESSION_SETTINGS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function getActiveSessionSettings(): Promise<SessionSettings> {
  if (sessionSettingsCache && Date.now() - sessionSettingsCache.fetchedAt < SESSION_SETTINGS_CACHE_TTL) {
    return sessionSettingsCache.settings;
  }

  try {
    const result = await docClient.send(
      new QueryCommand({
        TableName: config.dynamodb.pricingConfigTable,
        KeyConditionExpression: 'config_key = :key',
        FilterExpression: 'is_active = :active',
        ExpressionAttributeValues: {
          ':key': 'session_settings',
          ':active': true,
        },
        ScanIndexForward: false,
        Limit: 1,
      })
    );

    const item = result.Items?.[0] as SessionSettingsItem | undefined;
    const settings = item?.config ?? DEFAULT_SESSION_SETTINGS;
    sessionSettingsCache = { settings, fetchedAt: Date.now() };
    return settings;
  } catch {
    return DEFAULT_SESSION_SETTINGS;
  }
}

export async function saveSessionSettings(
  settings: SessionSettings,
  createdBy: string,
  description?: string
): Promise<number> {
  // Get latest version number
  const existing = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.pricingConfigTable,
      KeyConditionExpression: 'config_key = :key',
      ExpressionAttributeValues: { ':key': 'session_settings' },
      ScanIndexForward: false,
      Limit: 1,
    })
  );

  const latestVersion = (existing.Items?.[0] as SessionSettingsItem | undefined)?.version ?? 0;
  const newVersion = latestVersion + 1;

  // Deactivate current active version
  const activeItems = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.pricingConfigTable,
      KeyConditionExpression: 'config_key = :key',
      FilterExpression: 'is_active = :active',
      ExpressionAttributeValues: {
        ':key': 'session_settings',
        ':active': true,
      },
    })
  );

  for (const item of (activeItems.Items || []) as SessionSettingsItem[]) {
    await docClient.send(
      new UpdateCommand({
        TableName: config.dynamodb.pricingConfigTable,
        Key: { config_key: item.config_key, version: item.version },
        UpdateExpression: 'SET is_active = :inactive',
        ExpressionAttributeValues: { ':inactive': false },
      })
    );
  }

  // Save new version
  const newItem: SessionSettingsItem = {
    config_key: 'session_settings',
    version: newVersion,
    config: settings,
    is_active: true,
    created_at: new Date().toISOString(),
    created_by: createdBy,
    ...(description && { description }),
  };

  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.pricingConfigTable,
      Item: newItem,
    })
  );

  // Invalidate cache
  sessionSettingsCache = null;

  return newVersion;
}

export async function getAllRequirementsPaginated(
  limit: number = 20,
  offset: number = 0,
  statusFilter?: string,
  clientNameLower?: string,
  dateFrom?: string,
  dateTo?: string
): Promise<{ items: RequirementItem[]; total: number; hasMore: boolean }> {
  const PAGE_SIZE = 100;
  const MAX_SCAN = 1000;
  const allItems: RequirementItem[] = [];
  let currentKey: Record<string, unknown> | undefined;

  do {
    const scanParams: {
      TableName: string;
      Limit: number;
      ExclusiveStartKey?: Record<string, unknown>;
      FilterExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    } = {
      TableName: config.dynamodb.requirementsTable,
      Limit: PAGE_SIZE,
    };

    const filterParts: string[] = [];
    const exprNames: Record<string, string> = {};
    const exprValues: Record<string, unknown> = {};

    if (statusFilter) {
      filterParts.push('#status = :statusVal');
      exprNames['#status'] = 'status';
      exprValues[':statusVal'] = statusFilter;
    }

    if (clientNameLower) {
      filterParts.push('client_name_lower = :clientName');
      exprValues[':clientName'] = clientNameLower;
    }

    if (dateFrom) {
      filterParts.push('created_at >= :dateFrom');
      exprValues[':dateFrom'] = dateFrom;
    }

    if (dateTo) {
      filterParts.push('created_at <= :dateTo');
      exprValues[':dateTo'] = dateTo;
    }

    if (filterParts.length > 0) {
      scanParams.FilterExpression = filterParts.join(' AND ');
      if (Object.keys(exprNames).length > 0) {
        scanParams.ExpressionAttributeNames = exprNames;
      }
      scanParams.ExpressionAttributeValues = exprValues;
    }

    if (currentKey) {
      scanParams.ExclusiveStartKey = currentKey;
    }

    const result = await docClient.send(new ScanCommand(scanParams));
    allItems.push(...((result.Items || []) as RequirementItem[]));
    currentKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (currentKey && allItems.length < MAX_SCAN);

  // Sort all items by created_at descending
  allItems.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  // Paginate by offset
  const page = allItems.slice(offset, offset + limit);

  return {
    items: page,
    total: allItems.length,
    hasMore: offset + limit < allItems.length,
  };
}

// ─── Recent Requirements ────────────────────────────────────────────────────

// TODO: If Requirements table grows beyond ~1000 items, add a GSI with
// partition key = "ALL" and sort key = created_at for efficient queries.
export async function getRecentRequirements(
  limit: number = 10,
  statusFilter?: string
): Promise<RequirementItem[]> {
  const PAGE_SIZE = 100;
  const MAX_SCAN = 500;
  const allItems: RequirementItem[] = [];
  let currentKey: Record<string, unknown> | undefined;

  do {
    const scanParams: {
      TableName: string;
      Limit: number;
      ExclusiveStartKey?: Record<string, unknown>;
      FilterExpression?: string;
      ExpressionAttributeNames?: Record<string, string>;
      ExpressionAttributeValues?: Record<string, unknown>;
    } = {
      TableName: config.dynamodb.requirementsTable,
      Limit: PAGE_SIZE,
    };

    if (statusFilter) {
      scanParams.FilterExpression = '#status = :statusVal';
      scanParams.ExpressionAttributeNames = { '#status': 'status' };
      scanParams.ExpressionAttributeValues = { ':statusVal': statusFilter };
    }

    if (currentKey) {
      scanParams.ExclusiveStartKey = currentKey;
    }

    const result = await docClient.send(new ScanCommand(scanParams));
    allItems.push(...((result.Items || []) as RequirementItem[]));
    currentKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (currentKey && allItems.length < MAX_SCAN);

  // Sort by created_at descending and return top N
  allItems.sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  return allItems.slice(0, limit);
}

// ─── Requirement Scanning ───────────────────────────────────────────────────

export async function getAllActiveRequirements(): Promise<RequirementItem[]> {
  const PAGE_SIZE = 100;
  const MAX_ITEMS = 500;
  const allItems: RequirementItem[] = [];
  let currentKey: Record<string, unknown> | undefined;

  do {
    const params: {
      TableName: string;
      FilterExpression: string;
      ExpressionAttributeNames: Record<string, string>;
      ExpressionAttributeValues: Record<string, unknown>;
      Limit: number;
      ExclusiveStartKey?: Record<string, unknown>;
    } = {
      TableName: config.dynamodb.requirementsTable,
      FilterExpression: '#status = :active',
      ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':active': 'active' },
      Limit: PAGE_SIZE,
    };

    if (currentKey) {
      params.ExclusiveStartKey = currentKey;
    }

    const result = await docClient.send(new ScanCommand(params));
    allItems.push(...((result.Items || []) as RequirementItem[]));
    currentKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (currentKey && allItems.length < MAX_ITEMS);

  return allItems;
}

// ─── Shortlist Operations ───────────────────────────────────────────────────

export async function saveShortlist(item: ShortlistItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.shortlistsTable,
      Item: item,
    })
  );
}

export async function getShortlistEntry(
  requirementId: string,
  candidateId: string
): Promise<ShortlistItem | null> {
  const result = await docClient.send(
    new GetCommand({
      TableName: config.dynamodb.shortlistsTable,
      Key: { requirement_id: requirementId, candidate_id: candidateId },
    })
  );
  return (result.Item as ShortlistItem) || null;
}

export async function getShortlistsForCandidate(candidateId: string): Promise<ShortlistItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.shortlistsTable,
      IndexName: 'CandidateIndex',
      KeyConditionExpression: 'candidate_id = :cid',
      ExpressionAttributeValues: { ':cid': candidateId },
    })
  );
  return (result.Items || []) as ShortlistItem[];
}

export async function getShortlistsForRequirement(requirementId: string): Promise<ShortlistItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.shortlistsTable,
      KeyConditionExpression: 'requirement_id = :rid',
      ExpressionAttributeValues: { ':rid': requirementId },
    })
  );
  return (result.Items || []) as ShortlistItem[];
}

export async function deleteShortlist(requirementId: string, candidateId: string): Promise<void> {
  await docClient.send(
    new DeleteCommand({
      TableName: config.dynamodb.shortlistsTable,
      Key: { requirement_id: requirementId, candidate_id: candidateId },
    })
  );
}

// ─── Client Master Operations ───────────────────────────────────────────────

export async function saveClient(item: ClientItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.clientsTable,
      Item: item,
    })
  );
}

export async function getClientByName(clientNameLower: string): Promise<ClientItem | null> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.clientsTable,
      IndexName: 'ClientNameLowerIndex',
      KeyConditionExpression: 'client_name_lower = :name',
      ExpressionAttributeValues: { ':name': clientNameLower },
      Limit: 1,
    })
  );
  return (result.Items?.[0] as ClientItem) || null;
}

export async function listClients(): Promise<ClientItem[]> {
  const allItems: ClientItem[] = [];
  let currentKey: Record<string, unknown> | undefined;

  do {
    const params: {
      TableName: string;
      Limit: number;
      ExclusiveStartKey?: Record<string, unknown>;
    } = {
      TableName: config.dynamodb.clientsTable,
      Limit: 100,
    };

    if (currentKey) {
      params.ExclusiveStartKey = currentKey;
    }

    const result = await docClient.send(new ScanCommand(params));
    allItems.push(...((result.Items || []) as ClientItem[]));
    currentKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (currentKey);

  allItems.sort((a, b) => a.client_name.localeCompare(b.client_name));
  return allItems;
}

export async function updateClient(
  clientId: string,
  updates: {
    defaultPaymentTermsDays?: number;
    defaultEngagementModel?: string;
    defaultPayroll?: string;
    notes?: string;
  }
): Promise<void> {
  const expressionParts: string[] = ['last_updated = :now'];
  const values: Record<string, unknown> = { ':now': new Date().toISOString() };

  if (updates.defaultPaymentTermsDays !== undefined) {
    expressionParts.push('default_payment_terms_days = :dptd');
    values[':dptd'] = updates.defaultPaymentTermsDays;
  }
  if (updates.defaultEngagementModel !== undefined) {
    expressionParts.push('default_engagement_model = :dem');
    values[':dem'] = updates.defaultEngagementModel;
  }
  if (updates.defaultPayroll !== undefined) {
    expressionParts.push('default_payroll = :dp');
    values[':dp'] = updates.defaultPayroll;
  }
  if (updates.notes !== undefined) {
    expressionParts.push('notes = :notes');
    values[':notes'] = updates.notes;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.clientsTable,
      Key: { client_id: clientId },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(client_id)',
    })
  );
}

// ─── Candidate Screening Operations ─────────────────────────────────────────

export async function saveScreening(item: ScreeningItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.candidateScreeningsTable,
      Item: item,
    })
  );
}

export async function getScreeningHistory(
  candidateId: string,
  limit: number = 20
): Promise<ScreeningItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.candidateScreeningsTable,
      KeyConditionExpression: 'candidate_id = :cid',
      ExpressionAttributeValues: { ':cid': candidateId },
      ScanIndexForward: false, // Latest first
      Limit: limit,
    })
  );
  return (result.Items || []) as ScreeningItem[];
}

export async function updateCandidateProfileFields(
  candidateId: string,
  fields: Record<string, unknown>,
  screenedBy: string,
  screenerName?: string
): Promise<void> {
  const now = new Date().toISOString();

  // Use ExpressionAttributeNames for ALL fields to avoid DynamoDB reserved keyword issues
  // (e.g., "location", "status", "name" are all reserved)
  const names: Record<string, string> = {
    '#last_updated': 'last_updated',
    '#last_screened_at': 'last_screened_at',
    '#last_screened_by': 'last_screened_by',
    '#last_screened_by_name': 'last_screened_by_name',
  };
  const setParts: string[] = [
    '#last_updated = :now',
    '#last_screened_at = :now',
    '#last_screened_by = :screenedBy',
    '#last_screened_by_name = :screenerName',
  ];
  const removeParts: string[] = [];
  const values: Record<string, unknown> = {
    ':now': now,
    ':screenedBy': screenedBy,
    ':screenerName': screenerName || screenedBy,
  };

  let paramIndex = 0;
  for (const [key, value] of Object.entries(fields)) {
    const nameAlias = `#f${paramIndex}`;
    names[nameAlias] = key;

    if (value === null || value === undefined) {
      // DynamoDB cannot SET a value to null; use REMOVE instead
      removeParts.push(nameAlias);
    } else {
      const placeholder = `:f${paramIndex}`;
      setParts.push(`${nameAlias} = ${placeholder}`);
      values[placeholder] = value;
    }
    paramIndex++;
  }

  let updateExpression = `SET ${setParts.join(', ')}`;
  if (removeParts.length > 0) {
    updateExpression += ` REMOVE ${removeParts.join(', ')}`;
  }

  await docClient.send(
    new UpdateCommand({
      TableName: config.dynamodb.talentProfilesTable,
      Key: { candidate_id: candidateId },
      UpdateExpression: updateExpression,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
      ConditionExpression: 'attribute_exists(candidate_id)',
    })
  );
}

export async function searchCandidatesByName(
  query: string,
  limit = 50
): Promise<CandidateItem[]> {
  const lowerQuery = query.toLowerCase();
  const PAGE_SIZE = 100;
  const MAX_SCAN = 500;

  const allItems: CandidateItem[] = [];
  let currentKey: Record<string, unknown> | undefined;

  do {
    const scanParams: {
      TableName: string;
      Limit: number;
      ExclusiveStartKey?: Record<string, unknown>;
    } = {
      TableName: config.dynamodb.talentProfilesTable,
      Limit: PAGE_SIZE,
    };
    if (currentKey) {
      scanParams.ExclusiveStartKey = currentKey;
    }

    const result = await docClient.send(new ScanCommand(scanParams));
    const items = (result.Items || []) as CandidateItem[];
    for (const item of items) {
      if ((item.full_name || '').toLowerCase().includes(lowerQuery)) {
        allItems.push(item);
        if (allItems.length >= limit) break;
      }
    }

    currentKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
  } while (currentKey && allItems.length < limit && allItems.length < MAX_SCAN);

  return allItems;
}

// ─── Recent Profiles ────────────────────────────────────────────────────────

// TODO: If TalentProfiles table grows beyond ~1000 items, add a GSI with
// partition key = "ALL" and sort key = last_updated for efficient queries.
export async function getRecentProfiles(
  limit: number = 10
): Promise<CandidateItem[]> {
  const result = await docClient.send(
    new QueryCommand({
      TableName: config.dynamodb.talentProfilesTable,
      IndexName: 'RecentProfilesIndex',
      KeyConditionExpression: '#type = :type',
      ExpressionAttributeNames: { '#type': '_type', '#loc': 'location' },
      ExpressionAttributeValues: { ':type': 'PROFILE' },
      ScanIndexForward: false,
      Limit: limit,
      ProjectionExpression:
        'candidate_id, full_name, primary_skills, total_experience, seniority, #loc, last_updated, created_at, last_screened_at',
    })
  );

  return (result.Items || []) as CandidateItem[];
}

// ─── Audit Log Operations ───────────────────────────────────────────────────

function toAuditLogEntry(item: AuditLogItem): AuditLogEntry {
  return {
    eventId: item.event_id,
    userId: item.user_id,
    userEmail: item.user_email,
    userRole: item.user_role,
    action: item.action,
    entityType: item.entity_type,
    entityId: item.entity_id,
    metadata: item.metadata,
    ipAddress: item.ip_address,
    timestamp: item.timestamp,
  };
}

export async function putAuditLog(item: AuditLogItem): Promise<void> {
  await docClient.send(
    new PutCommand({
      TableName: config.dynamodb.auditLogTable,
      Item: item,
    })
  );
}

export async function queryAuditLogsByUser(
  userId: string,
  options?: { limit?: number; nextToken?: string; startDate?: string; endDate?: string }
): Promise<{ logs: AuditLogEntry[]; nextToken?: string }> {
  const limit = options?.limit || 50;

  let keyCondition = 'pk = :pk';
  const exprValues: Record<string, unknown> = { ':pk': `USER#${userId}` };

  if (options?.startDate && options?.endDate) {
    keyCondition = 'pk = :pk AND sk BETWEEN :start AND :end';
    exprValues[':start'] = options.startDate;
    exprValues[':end'] = options.endDate + '\uffff';
  } else if (options?.startDate) {
    keyCondition = 'pk = :pk AND sk >= :start';
    exprValues[':start'] = options.startDate;
  } else if (options?.endDate) {
    keyCondition = 'pk = :pk AND sk <= :end';
    exprValues[':end'] = options.endDate + '\uffff';
  }

  const params = {
    TableName: config.dynamodb.auditLogTable,
    KeyConditionExpression: keyCondition,
    ExpressionAttributeValues: exprValues,
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: options?.nextToken
      ? JSON.parse(Buffer.from(options.nextToken, 'base64').toString())
      : undefined,
  };

  const result = await docClient.send(new QueryCommand(params));
  const items = (result.Items || []) as AuditLogItem[];

  return {
    logs: items.map(toAuditLogEntry),
    nextToken: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };
}

export async function queryAuditLogsByEntity(
  entityType: string,
  entityId: string,
  options?: { limit?: number; nextToken?: string }
): Promise<{ logs: AuditLogEntry[]; nextToken?: string }> {
  const limit = options?.limit || 50;

  const params = {
    TableName: config.dynamodb.auditLogTable,
    IndexName: 'EntityIndex',
    KeyConditionExpression: 'entity_key = :ek',
    ExpressionAttributeValues: { ':ek': `${entityType.toUpperCase()}#${entityId}` },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: options?.nextToken
      ? JSON.parse(Buffer.from(options.nextToken, 'base64').toString())
      : undefined,
  };

  const result = await docClient.send(new QueryCommand(params));
  const items = (result.Items || []) as AuditLogItem[];

  return {
    logs: items.map(toAuditLogEntry),
    nextToken: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };
}

export async function scanRecentAuditLogs(
  options?: { limit?: number; nextToken?: string }
): Promise<{ logs: AuditLogEntry[]; nextToken?: string }> {
  const limit = options?.limit || 50;

  const params = {
    TableName: config.dynamodb.auditLogTable,
    Limit: limit,
    ExclusiveStartKey: options?.nextToken
      ? JSON.parse(Buffer.from(options.nextToken, 'base64').toString())
      : undefined,
  };

  const result = await docClient.send(new ScanCommand(params));
  const items = (result.Items || []) as AuditLogItem[];

  // Sort by timestamp descending since Scan doesn't guarantee order
  items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  return {
    logs: items.map(toAuditLogEntry),
    nextToken: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };
}

export async function queryAuditLogsByDate(
  startDate: string,
  endDate: string,
  options?: { limit?: number; nextToken?: string }
): Promise<{ logs: AuditLogEntry[]; nextToken?: string }> {
  const limit = options?.limit || 50;

  // Query each date partition in the range and merge results
  const dates: string[] = [];
  const start = new Date(startDate);
  const end = new Date(endDate);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }

  // If single date, do a simple query
  if (dates.length === 1) {
    const params = {
      TableName: config.dynamodb.auditLogTable,
      IndexName: 'DateIndex',
      KeyConditionExpression: 'log_date = :ld',
      ExpressionAttributeValues: { ':ld': dates[0] },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: options?.nextToken
        ? JSON.parse(Buffer.from(options.nextToken, 'base64').toString())
        : undefined,
    };

    const result = await docClient.send(new QueryCommand(params));
    const items = (result.Items || []) as AuditLogItem[];

    return {
      logs: items.map(toAuditLogEntry),
      nextToken: result.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : undefined,
    };
  }

  // For multi-date ranges, query each date partition and merge
  const allItems: AuditLogItem[] = [];
  for (const date of dates) {
    const params = {
      TableName: config.dynamodb.auditLogTable,
      IndexName: 'DateIndex',
      KeyConditionExpression: 'log_date = :ld',
      ExpressionAttributeValues: { ':ld': date },
      ScanIndexForward: false,
    };

    const result = await docClient.send(new QueryCommand(params));
    allItems.push(...((result.Items || []) as AuditLogItem[]));
  }

  // Sort all items descending by timestamp and apply limit
  allItems.sort((a, b) => b.sk.localeCompare(a.sk));
  const sliced = allItems.slice(0, limit);

  return {
    logs: sliced.map(toAuditLogEntry),
    nextToken: undefined,
  };
}

export async function queryAuditLogsByAction(
  action: string,
  date: string,
  options?: { limit?: number; nextToken?: string }
): Promise<{ logs: AuditLogEntry[]; nextToken?: string }> {
  const limit = options?.limit || 50;

  const params = {
    TableName: config.dynamodb.auditLogTable,
    IndexName: 'ActionTypeIndex',
    KeyConditionExpression: 'action_date = :ad',
    ExpressionAttributeValues: { ':ad': `${action}#${date}` },
    ScanIndexForward: false,
    Limit: limit,
    ExclusiveStartKey: options?.nextToken
      ? JSON.parse(Buffer.from(options.nextToken, 'base64').toString())
      : undefined,
  };

  const result = await docClient.send(new QueryCommand(params));
  const items = (result.Items || []) as AuditLogItem[];

  return {
    logs: items.map(toAuditLogEntry),
    nextToken: result.LastEvaluatedKey
      ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
      : undefined,
  };
}
