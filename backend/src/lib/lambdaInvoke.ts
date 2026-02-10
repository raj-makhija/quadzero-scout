import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { config } from './config.js';

const lambdaClient = new LambdaClient({ region: config.region });

export async function invokeLambdaAsync(
  functionName: string,
  payload: Record<string, unknown>
): Promise<void> {
  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: 'Event',
    Payload: Buffer.from(JSON.stringify(payload)),
  });
  await lambdaClient.send(command);
}
