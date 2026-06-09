import { CloudWatchClient, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { config } from './config.js';

const cloudwatchClient = new CloudWatchClient({ region: config.region });

const NAMESPACE = 'QuadzeroScout/LlmRerank';

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
