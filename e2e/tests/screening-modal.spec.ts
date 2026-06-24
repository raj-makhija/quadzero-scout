import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('screening modal: open, toggle still-on-job, save, reopen, verify pre-fill', async ({ page }) => {
  // Navigate to the locate page and find a candidate profile
  await page.goto('/recruiter/locate');

  // Wait for at least one candidate profile link
  const profileLink = page.locator('a[href*="/recruiter/locate/"]').first();
  await expect(profileLink).toBeVisible({ timeout: 15000 });
  await profileLink.click();
  await page.waitForLoadState('networkidle');

  // Open the screening modal
  const screenBtn = page.getByRole('button', { name: 'Screen Candidate' });
  await expect(screenBtn).toBeVisible({ timeout: 5000 });
  await screenBtn.click();

  // Modal should be open — wait for the stillOnJob checkbox
  const stillOnJob = page.locator('#stillOnJob');
  await expect(stillOnJob).toBeVisible({ timeout: 5000 });

  // Ensure stillOnJob is checked for this run
  await stillOnJob.check();
  await expect(stillOnJob).toBeChecked();

  // Fill required fields that may be blank (non-destructive: only fill if empty)
  const currentCtcInput = page.locator('#currentCtc');
  if (await currentCtcInput.isVisible() && (await currentCtcInput.inputValue()) === '') {
    await currentCtcInput.fill('10');
  }

  const expectedCtcInput = page.locator('#expectedCtc');
  if (await expectedCtcInput.isVisible() && (await expectedCtcInput.inputValue()) === '') {
    await expectedCtcInput.fill('12');
  }

  const availabilitySelect = page.locator('#availability');
  if (await availabilitySelect.isVisible() && (await availabilitySelect.inputValue()) === '') {
    await availabilitySelect.selectOption('immediate');
  }

  const engagementSelect = page.locator('#engagementModel');
  if (await engagementSelect.isVisible() && (await engagementSelect.inputValue()) === '') {
    await engagementSelect.selectOption('either');
  }

  // Save the screening
  const saveBtn = page.getByRole('button', { name: 'Save Screening' });
  await expect(saveBtn).toBeEnabled({ timeout: 3000 });
  await saveBtn.click();

  // Modal should close after successful save
  await expect(stillOnJob).not.toBeVisible({ timeout: 10000 });

  // Reopen the screening modal
  await screenBtn.click();

  // Verify stillOnJob is still checked (pre-filled from persisted data)
  const stillOnJobReopened = page.locator('#stillOnJob');
  await expect(stillOnJobReopened).toBeVisible({ timeout: 5000 });
  await expect(stillOnJobReopened).toBeChecked();
});
