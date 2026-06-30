export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main>
      <section className="card stack offline-card">
        <div className="page-header">
          <p className="eyebrow">Offline</p>
          <h1>You’re offline right now.</h1>
          <p>
            QCRC Team Management needs a connection for live reservation, safety, and admin data. Once you reconnect,
            refresh the app and everything will pick back up.
          </p>
        </div>
        <div className="card-subtle stack">
          <h3>What still works</h3>
          <p>The app can stay installed on your device, and its basic shell assets will load faster after the first visit.</p>
        </div>
      </section>
    </main>
  );
}
