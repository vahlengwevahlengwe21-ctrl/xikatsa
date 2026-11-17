import './globals.css';
import type { Metadata } from 'next';
import { Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { SessionGate } from '@/components/auth/session-gate';
import { Toaster } from '@/components/ui/toaster';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const jakarta = Plus_Jakarta_Sans({ subsets: ['latin'], variable: '--font-jakarta' });

const societyLogoPath = '/Xikatsa%20Society%20Green%20Grass%20Logo.png';

export const metadata: Metadata = {
  title: 'Xikatsa Society | Stronger, together',
  description: 'Xikatsa Society brings people together through mutual care, shared responsibility and support when it matters most.',
  icons: {
    icon: societyLogoPath,
    shortcut: societyLogoPath,
    apple: societyLogoPath,
  },
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
          {children}
        </SessionGate>
        <Toaster />
      </body>
    </html>
  );
}
