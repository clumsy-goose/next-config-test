export const metadata = {
  title: 'Next Config Test',
  description: 'ISR/SSR/CSR/SSG + headers/redirects/rewrites verification project',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'system-ui, sans-serif', margin: 24 }}>
        {children}
      </body>
    </html>
  )
}
