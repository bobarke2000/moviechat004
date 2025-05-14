// app/layout.tsx or app/layout.js
export const metadata = {
  title: 'Criterion Librarian',
  description: 'Your dry film discovery assistant',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body style={{ fontFamily: "'Instrument Serif', serif" }}>{children}</body>
    </html>
  );
}
