import { Card } from "@/components/ui/Card";
import { formatEasternDateTime } from "@/lib/time";

type HeldBoat = {
  id: string;
  boatName: string;
};

type TrainingHoldConflict = {
  id: string;
  boatName: string;
  memberName: string;
  reservationStart: string;
  reservationEnd: string;
  reservationStatus: string;
};

export function TrainingHoldConflictPanel({
  sessionStartsAt,
  sessionEndsAt,
  heldBoats,
  conflicts,
  loadFailed = false,
}: {
  sessionStartsAt: string;
  sessionEndsAt: string;
  heldBoats: HeldBoat[];
  conflicts: TrainingHoldConflict[];
  loadFailed?: boolean;
}) {
  return (
    <Card className="stack">
      <div className="page-title">
        <h3>Training Holds</h3>
        <span className="muted">{heldBoats.length} priority boat{heldBoats.length === 1 ? "" : "s"} held</span>
      </div>

      {loadFailed ? <p className="error" role="alert">Training hold conflicts could not be checked.</p> : null}
      {!loadFailed ? (
        conflicts.length === 0 ? (
          <p className="muted">No reservation conflicts.</p>
        ) : (
          <p className="error">{conflicts.length} reservation conflict{conflicts.length === 1 ? "" : "s"} need staff review.</p>
        )
      ) : null}

      {heldBoats.length > 0 ? (
        <details>
          <summary>Held for Advanced Training</summary>
          <ul>
            {heldBoats.map((hold) => (
              <li key={hold.id}>{hold.boatName}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {!loadFailed
        ? conflicts.map((conflict) => (
            <Card key={conflict.id} subtle className="stack">
              <div>
                <strong>Training hold conflict: {conflict.boatName}</strong>
                <div className="muted">
                  Advanced Training: {formatEasternDateTime(sessionStartsAt)}–{formatEasternDateTime(sessionEndsAt)} ET
                </div>
              </div>
              <div>
                <strong>Existing reservation</strong>
                <div>
                  {conflict.memberName} · {formatEasternDateTime(conflict.reservationStart)}–{formatEasternDateTime(conflict.reservationEnd)} ET
                  {conflict.reservationStatus ? ` (${conflict.reservationStatus.replaceAll("_", " ")})` : ""}
                </div>
              </div>
              <p className="muted">This reservation was created before or independently of the training hold and has not been cancelled.</p>
            </Card>
          ))
        : null}
    </Card>
  );
}
