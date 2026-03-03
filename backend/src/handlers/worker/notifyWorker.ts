import { notifyMatchingRecruiters } from '../../lib/notificationService.js';

interface NotifyWorkerEvent {
  candidateIds: string[];
}

export async function handler(event: NotifyWorkerEvent): Promise<void> {
  const { candidateIds } = event;
  if (!candidateIds || candidateIds.length === 0) {
    console.log('Notify worker: no candidateIds provided, skipping');
    return;
  }
  console.log('Notify worker started for candidates:', candidateIds);
  await notifyMatchingRecruiters(candidateIds);
  console.log('Notify worker completed');
}
