/**
 * Migrate legacy TalentProfiles that predate the split between primary (core)
 * and secondary (non-core) skills.
 *
 * For each profile where skills_schema_version is absent:
 *   - Re-partition primary_skills using the skills ontology:
 *       in-ontology  → stays in primary_skills
 *       not-in-ontology → moved to secondary_skills
 *   - Any entries already in secondary_skills are kept (union, deduped).
 *   - primary_skill_years entries for demoted skills are dropped.
 *   - Stamp skills_schema_version = "v1.5".
 *
 * Profiles already stamped (any version) are skipped.
 *
 * Usage:
 *   npx tsx scripts/migrateLegacySkillsSchema.ts                # dry run (default)
 *   npx tsx scripts/migrateLegacySkillsSchema.ts --apply        # actually write
 *
 * Env vars:
 *   AWS_REGION                      (default: ap-south-1)
 *   DYNAMODB_TABLE_TALENT_PROFILES  (default: TalentProfiles-prod)
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { isCoreSkill, normalizeSkill, normalizeSkills } from '../src/lib/skillNormalizer.js';

const region = process.env.AWS_REGION || 'ap-south-1';
const tableName = process.env.DYNAMODB_TABLE_TALENT_PROFILES || 'TalentProfiles-prod';
const APPLY = process.argv.includes('--apply');
const BATCH_CONCURRENCY = 10;

const client = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(client);

type Profile = {
  candidate_id: string;
  primary_skills?: string[];
  secondary_skills?: string[];
  primary_skill_years?: Record<string, number>;
  skills_schema_version?: string;
};

type Partitioned = {
  newPrimary: string[];
  newSecondary: string[];
  newYears: Record<string, number>;
  demoted: string[];
};

function partition(p: Profile): Partitioned {
  const primary = normalizeSkills(p.primary_skills || []);
  const existingSecondary = normalizeSkills(p.secondary_skills || []);
  const years = p.primary_skill_years || {};

  const newPrimary: string[] = [];
  const demoted: string[] = [];
  for (const skill of primary) {
    if (isCoreSkill(skill)) newPrimary.push(skill);
    else demoted.push(skill);
  }

  const secondarySet = new Set(existingSecondary);
  for (const s of demoted) secondarySet.add(s);
  const newSecondary = [...secondarySet];

  const retainedPrimarySet = new Set(newPrimary);
  const newYears: Record<string, number> = {};
  for (const [k, v] of Object.entries(years)) {
    const nk = normalizeSkill(k);
    if (!retainedPrimarySet.has(nk)) continue;
    // Write normalized key. If aliases collide (e.g. "React" and "react.js"),
    // keep the max years — matches the rule in normalizeSkillYears().
    newYears[nk] = Math.max(newYears[nk] ?? 0, v);
  }

  return { newPrimary, newSecondary, newYears, demoted };
}

async function run() {
  console.log(`Migration target: ${tableName} in ${region}`);
  console.log(`Mode: ${APPLY ? 'APPLY (writes)' : 'DRY RUN (no writes)'}`);

  let lastKey: Record<string, unknown> | undefined;
  let scanned = 0;
  let alreadyStamped = 0;
  let unchanged = 0;
  let migrated = 0;
  let totalDemoted = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: tableName,
        ProjectionExpression: 'candidate_id, primary_skills, secondary_skills, primary_skill_years, skills_schema_version',
        Limit: 200,
        ...(lastKey ? { ExclusiveStartKey: lastKey } : {}),
      })
    );

    const items = (result.Items || []) as Profile[];
    scanned += items.length;

    const targets = items.filter((p) => !p.skills_schema_version);
    alreadyStamped += items.length - targets.length;

    const plans = targets
      .map((p) => ({ p, ...partition(p) }))
      .map((plan) => {
        const changed = plan.demoted.length > 0;
        return { ...plan, changed };
      });

    const actionable = plans.filter((x) => x.changed);
    unchanged += plans.length - actionable.length;

    if (actionable.length > 0) {
      totalDemoted += actionable.reduce((s, x) => s + x.demoted.length, 0);

      if (APPLY) {
        for (let i = 0; i < actionable.length; i += BATCH_CONCURRENCY) {
          const batch = actionable.slice(i, i + BATCH_CONCURRENCY);
          await Promise.all(
            batch.map((plan) =>
              docClient.send(
                new UpdateCommand({
                  TableName: tableName,
                  Key: { candidate_id: plan.p.candidate_id },
                  UpdateExpression:
                    'SET primary_skills = :p, secondary_skills = :s, primary_skill_years = :y, skills_schema_version = :v',
                  ExpressionAttributeValues: {
                    ':p': plan.newPrimary,
                    ':s': plan.newSecondary,
                    ':y': plan.newYears,
                    ':v': 'v1.5',
                  },
                  ConditionExpression: 'attribute_not_exists(skills_schema_version)',
                })
              ).catch((err: Error & { name?: string }) => {
                if (err.name === 'ConditionalCheckFailedException') return;
                throw err;
              })
            )
          );
        }
      }
      migrated += actionable.length;
    }

    // Also stamp the "no-change" legacy profiles (no demotions but still unstamped).
    const stampOnly = plans.filter((x) => !x.changed);
    if (stampOnly.length > 0 && APPLY) {
      for (let i = 0; i < stampOnly.length; i += BATCH_CONCURRENCY) {
        const batch = stampOnly.slice(i, i + BATCH_CONCURRENCY);
        await Promise.all(
          batch.map((plan) =>
            docClient.send(
              new UpdateCommand({
                TableName: tableName,
                Key: { candidate_id: plan.p.candidate_id },
                UpdateExpression: 'SET skills_schema_version = :v',
                ExpressionAttributeValues: { ':v': 'v1.5' },
                ConditionExpression: 'attribute_not_exists(skills_schema_version)',
              })
            ).catch((err: Error & { name?: string }) => {
              if (err.name === 'ConditionalCheckFailedException') return;
              throw err;
            })
          )
        );
      }
    }

    lastKey = result.LastEvaluatedKey as Record<string, unknown> | undefined;
    console.log(
      `progress scanned=${scanned} stamped=${alreadyStamped} migrated=${migrated} unchanged=${unchanged} demotedSkills=${totalDemoted}`
    );
  } while (lastKey);

  console.log('---');
  console.log(`DONE (${APPLY ? 'APPLIED' : 'DRY RUN'})`);
  console.log(`  scanned:        ${scanned}`);
  console.log(`  already stamped: ${alreadyStamped}`);
  console.log(`  migrated:       ${migrated}`);
  console.log(`  unchanged:      ${unchanged}`);
  console.log(`  skills demoted: ${totalDemoted}`);
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
