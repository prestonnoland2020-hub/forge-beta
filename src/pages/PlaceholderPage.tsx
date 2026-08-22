export function PlaceholderPage({ title, description }: { title: string; description: string }) {
  return (
    <main className="shell">
      <section className="card">
        <div className="muted">NEXT MIGRATION PHASE</div>
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </section>
    </main>
  );
}
