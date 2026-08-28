export function SignupRoster({ names }: { names: string[] }) {
  return (
    <details className="card-subtle">
      <summary>See who&apos;s signed up ({names.length})</summary>
      <p className="muted" style={{ marginTop: "0.7rem" }}>
        {names.length > 0 ? names.join(", ") : "No one has signed up yet."}
      </p>
    </details>
  );
}
