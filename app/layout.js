import "./globals.css";

export const metadata = {
  title: "JJ Gold Bankers",
  description: "Jewellery Pawn Management System",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ta">
      <body>{children}</body>
    </html>
  );
}
