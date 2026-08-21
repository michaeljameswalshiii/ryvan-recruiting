import type { Metadata } from 'next';
import { RyvanLanding } from '@/components/marketing/RyvanLanding';

export const metadata: Metadata = {
  title: 'RYVAN Recruiting | Great candidates. Great companies.',
  description: 'Engaged, direct hire, and fractional recruiting solutions built around people, pace, and lasting fit.',
};

export default function Home() {
  return <RyvanLanding />;
}
