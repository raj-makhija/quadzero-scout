import { test, expect } from '../fixtures';
import { SearchPage } from '../pages/search.page';
import { ScreeningModal } from '../pages/screening.modal';

/**
 * Smoke: the screening round-trip. Open the modal, toggle "still on job",
 * save, reopen, and verify the toggle pre-fills from the saved value.
 */
test.describe('Screening modal', () => {
  test('toggle "still on job", save, reopen, verify pre-fill', async ({
    authedPage,
  }) => {
    const search = new SearchPage(authedPage);
    await search.goto();
    await search.searchByJobDescription(
      'Senior Java developer with Spring Boot and AWS experience, 5+ years.',
    );
    await search.waitForResults();

    // First pass: flip the toggle to the opposite of its current value, save.
    await search.openScreeningForFirstResult();
    const modal = new ScreeningModal(authedPage);
    await modal.expectOpen();
    const before = await modal.isStillOnJobChecked();
    const target = !before;
    await modal.setStillOnJob(target);
    await modal.save();

    // Reopen the same candidate and confirm the saved value pre-filled.
    await search.openScreeningForFirstResult();
    const reopened = new ScreeningModal(authedPage);
    await reopened.expectOpen();
    expect(await reopened.isStillOnJobChecked()).toBe(target);
  });
});
