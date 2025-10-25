import './globals.css';

export const metadata = {
  title: 'Adapt',
  description: 'Adaptive, AI-generated UI.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
      </body>
    </html>
  );
}