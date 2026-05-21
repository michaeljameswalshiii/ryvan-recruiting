/**
 * Outreach Email Template
 * Used for recruiter outreach to leads
 */

import * as React from 'react';
import { Html, Head, Body, Container, Text, Button, Hr, Tailwind } from '@react-email/components';

export interface OutreachEmailProps {
  leadName: string;
  companyName: string;
  position: string;
  customMessage?: string;
  recruiterName: string;
  ctaUrl?: string;
}

export function OutreachEmail({
  leadName,
  companyName,
  position,
  customMessage,
  recruiterName,
  ctaUrl = 'https://yourapp.com/schedule',
}: OutreachEmailProps) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f9fc' }}>
        <Tailwind>
          <Container className="mx-auto my-8 max-w-[600px] rounded-xl bg-white p-8 shadow">
            <Text className="text-2xl font-semibold text-gray-900">Hi {leadName},</Text>

            <Text className="mt-6 text-gray-700">
              I came across your profile and was impressed by your experience. We're currently looking for a{' '}
              <strong>{position}</strong> at <strong>{companyName}</strong>.
            </Text>

            {customMessage && <Text className="mt-4 text-gray-700">{customMessage}</Text>}

            <Button
              href={ctaUrl}
              className="mt-6 inline-block rounded-lg bg-blue-600 px-6 py-3 text-white"
            >
              Schedule a Quick Chat
            </Button>

            <Hr className="my-8" />

            <Text className="text-sm text-gray-500">
              Best regards,<br />
              {recruiterName}<br />
              Recruiter @ {companyName}
            </Text>
          </Container>
        </Tailwind>
      </Body>
    </Html>
  );
}

export default OutreachEmail;
