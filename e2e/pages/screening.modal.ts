import { Page, Locator, expect } from '@playwright/test';

/**
 * Page object for the candidate screening modal.
 * Mirrors frontend/src/components/screening-modal.tsx.
 */
export class ScreeningModal {
  readonly heading: Locator;
  readonly stillOnJobCheckbox: Locator;
  readonly saveButton: Locator;

  constructor(private readonly page: Page) {
    this.heading = this.page.getByRole('heading', { name: /screen candidate/i });
    // The "still on the job" toggle is a checkbox whose label reads
    // "Still on the job — LWD will be known after resignation".
    this.stillOnJobCheckbox = this.page.getByRole('checkbox', {
      name: /still on the job/i,
    });
    this.saveButton = this.page.getByRole('button', { name: /save screening/i });
  }

  async expectOpen() {
    await expect(this.heading).toBeVisible();
  }

  async isStillOnJobChecked(): Promise<boolean> {
    return this.stillOnJobCheckbox.isChecked();
  }

  async setStillOnJob(checked: boolean) {
    await this.stillOnJobCheckbox.setChecked(checked);
  }

  async save() {
    await this.saveButton.click();
    // Modal closes on a successful save.
    await expect(this.heading).toBeHidden({ timeout: 20_000 });
  }
}
