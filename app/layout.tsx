import './globals.css';
export const metadata = {
  title: 'Adapt',
  description: 'UI sandbox for generated components.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
