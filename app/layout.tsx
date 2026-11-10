import './globals.css';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { AppShell } from '@/components/app-shell';
import { SessionGate } from '@/components/auth/session-gate';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

export const metadata: Metadata = {
  title: 'XIKATSA SOCIETY',
  description: 'Member register, beneficiaries, benefits and financial records for XIKATSA SOCIETY.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>
        <SessionGate>
          <AppShell>{children}</AppShell>
        </SessionGate>
        <Toaster />
      </body>
    </html>
  );
}
