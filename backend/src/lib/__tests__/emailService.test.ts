import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — vi.hoisted ensures the fn is available when vi.mock factories run
// ---------------------------------------------------------------------------

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({}),
}));

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: vi.fn().mockImplementation(() => ({ send: mockSend })),
  SendEmailCommand: vi.fn().mockImplementation((input: unknown) => input),
}));

vi.mock('../config.js', () => ({
  config: {
    region: 'ap-south-1',
    email: {
      senderEmail: 'notify@example.com',
      frontendBaseUrl: 'https://dev.scout.quadzero.com',
    },
  },
}));

// ---------------------------------------------------------------------------
// Subject under test
// ---------------------------------------------------------------------------

import { sendNewProfilesNotificationEmail } from '../emailService.js';
import type { SendNotificationEmailParams, MatchedProfile } from '../emailService.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getHtmlBody(): string {
  const call = mockSend.mock.calls[0][0] as { Message: { Body: { Html: { Data: string } } } };
  return call.Message.Body.Html.Data;
}

function getTextBody(): string {
  const call = mockSend.mock.calls[0][0] as { Message: { Body: { Text: { Data: string } } } };
  return call.Message.Body.Text.Data;
}

const baseParams: SendNotificationEmailParams = {
  toEmail: 'recruiter@example.com',
  recruiterName: 'Alice',
  requirementId: 'req_123',
  requirementJobTitle: 'Frontend Dev',
  clientName: 'Acme Corp',
  candidateCount: 1,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendNewProfilesNotificationEmail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockResolvedValue({});
  });

  it('TC-EMAIL-001: includes profile links in HTML when matchedProfiles is provided', async () => {
    const profiles: MatchedProfile[] = [
      { candidateId: 'cand_1', fullName: 'John Doe', primarySkills: ['React', 'TypeScript', 'Node.js'] },
    ];

    await sendNewProfilesNotificationEmail({ ...baseParams, matchedProfiles: profiles });

    const html = getHtmlBody();
    expect(html).toContain('/recruiter/locate/cand_1');
    expect(html).toContain('John Doe');
    expect(html).toContain('React');
    expect(html).toContain('TypeScript');
    expect(html).toContain('Node.js');
    // Should still have the View Requirement button
    expect(html).toContain('/recruiter/requirements/req_123');
    expect(html).toContain('View Requirement');
  });

  it('TC-EMAIL-002: caps displayed profiles at 10 and shows remaining count', async () => {
    const profiles: MatchedProfile[] = Array.from({ length: 15 }, (_, i) => ({
      candidateId: `cand_${i}`,
      fullName: `Candidate ${i}`,
      primarySkills: ['JavaScript'],
    }));

    await sendNewProfilesNotificationEmail({
      ...baseParams,
      candidateCount: 15,
      matchedProfiles: profiles,
    });

    const html = getHtmlBody();
    // First 10 should be present
    for (let i = 0; i < 10; i++) {
      expect(html).toContain(`/recruiter/locate/cand_${i}`);
      expect(html).toContain(`Candidate ${i}`);
    }
    // 11th should NOT be a link
    expect(html).not.toContain('/recruiter/locate/cand_10');
    // Should show "and 5 more"
    expect(html).toContain('and 5 more');

    // Same for text body
    const text = getTextBody();
    expect(text).toContain('...and 5 more');
  });

  it('TC-EMAIL-003: renders correctly when matchedProfiles is undefined (backward compat)', async () => {
    await sendNewProfilesNotificationEmail(baseParams);

    const html = getHtmlBody();
    expect(html).toContain('1 new profile');
    expect(html).toContain('View Requirement');
    expect(html).toContain('/recruiter/requirements/req_123');
    // Should not contain profile list markup
    expect(html).not.toContain('/recruiter/locate/');
  });

  it('TC-EMAIL-004: includes profile URLs in plain text body', async () => {
    const profiles: MatchedProfile[] = [
      { candidateId: 'cand_1', fullName: 'Jane Smith', primarySkills: ['Python', 'Django'] },
      { candidateId: 'cand_2', fullName: 'Bob Jones', primarySkills: ['Go'] },
    ];

    await sendNewProfilesNotificationEmail({
      ...baseParams,
      candidateCount: 2,
      matchedProfiles: profiles,
    });

    const text = getTextBody();
    expect(text).toContain('Matched profiles:');
    expect(text).toContain('- Jane Smith (Python, Django): https://dev.scout.quadzero.com/recruiter/locate/cand_1');
    expect(text).toContain('- Bob Jones (Go): https://dev.scout.quadzero.com/recruiter/locate/cand_2');
  });

  it('TC-EMAIL-005: HTML-escapes candidate names and skills to prevent XSS', async () => {
    const profiles: MatchedProfile[] = [
      { candidateId: 'cand_xss', fullName: '<script>alert("xss")</script>', primarySkills: ['C++ & Java'] },
    ];

    await sendNewProfilesNotificationEmail({
      ...baseParams,
      candidateCount: 1,
      matchedProfiles: profiles,
    });

    const html = getHtmlBody();
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('C++ &amp; Java');
  });

  it('TC-EMAIL-006: handles profile with empty primarySkills gracefully', async () => {
    const profiles: MatchedProfile[] = [
      { candidateId: 'cand_empty', fullName: 'No Skills User', primarySkills: [] },
    ];

    await sendNewProfilesNotificationEmail({
      ...baseParams,
      candidateCount: 1,
      matchedProfiles: profiles,
    });

    const html = getHtmlBody();
    expect(html).toContain('No Skills User');
    expect(html).toContain('/recruiter/locate/cand_empty');
    // Should not have the mdash separator when no skills
    expect(html).not.toContain('No Skills User &mdash;');
  });
});
