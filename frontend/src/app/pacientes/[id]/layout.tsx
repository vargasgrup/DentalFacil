export function generateStaticParams() {
  // Placeholder segment for `output: "export"`. FastAPI SPA fallback serves this
  // HTML for any /pacientes/{id}/ deep link; the client reads the real id from the URL.
  return [{ id: "_" }];
}

export default function PacienteIdLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
