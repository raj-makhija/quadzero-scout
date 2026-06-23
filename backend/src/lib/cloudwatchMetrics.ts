import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { config } from './config.js';

const cloudwatchClient = new CloudWatchClient({ region: config.region });

const NAMESPACE = 'QuadzeroScout/LlmRerank';
const MATCH_CACHE_NAMESPACE = 'QuadzeroScout/MatchCache';

export interface MetricDimension {
  Name: string;
  Value: string;
}

/**
 * Emit a single CloudWatch metric to the LlmRerank namespace.
 * Never throws — a metrics failure must not propagate to callers.
 */
export async function putLlmRerankMetric(
  metricName: string,
  value: number,
  unit: 'Count' | 'Milliseconds' | 'None',
  dimensions: MetricDimension[] = []
): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: NAMESPACE,
        MetricData: [
          {
            MetricName: metricName,
            Value: value,
            Unit: unit,
            Dimensions: dimensions,
          },
        ],
      })
    );
  } catch (err) {
    console.error(`[cloudwatchMetrics] Failed to put metric ${metricName}:`, err);
  }
}

/**
 * Emit a cache-build-failure metric to the MatchCache namespace (ticket #447).
 * Fired when a requirement's match-cache build exhausts its retries on create /
 * criteria-edit / reopen, so the silent-empty-cache condition is observable as a
 * CloudWatch alarm signal rather than swallowed.
 * Never throws — a metrics failure must not propagate to callers.
 */
export async function putMatchCacheFailureMetric(requirementId: string): Promise<void> {
  try {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: MATCH_CACHE_NAMESPACE,
        MetricData: [
          {
            MetricName: 'CacheBuildFailure',
            Value: 1,
            Unit: 'Count',
            Dimensions: [{ Name: 'RequirementId', Value: requirementId }],
          },
        ],
      })
    );
  } catch (err) {
    console.error('[cloudwatchMetrics] Failed to put CacheBuildFailure metric:', err);
  }
}
