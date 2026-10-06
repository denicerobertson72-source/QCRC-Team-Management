export type RaceCommitment = {
  raceId: string;
  raceTitle: string;
  boatId: string | null;
  boatName: string;
  raceTime: string | null;
  memberIds: string[];
};

export type RaceConflict = {
  kind: "boat" | "rower";
  resourceId: string;
  resourceName: string;
  first: RaceCommitment;
  second: RaceCommitment;
  minutesApart: number;
  severity: "high" | "warning";
};

/** Builds conflicts from final race-lineup assignments only (never signups). */
export function findRaceConflicts(commitments: RaceCommitment[], minimumRaceTurnaroundMinutes: number) {
  const compare = (kind: RaceConflict["kind"], key: (item: RaceCommitment) => string[]) => {
    const grouped = new Map<string, RaceCommitment[]>();
    commitments.forEach((commitment) => key(commitment).forEach((resourceId) => {
      if (!resourceId || !commitment.raceTime) return;
      grouped.set(resourceId, [...(grouped.get(resourceId) ?? []), commitment]);
    }));
    const conflicts: RaceConflict[] = [];
    grouped.forEach((items, resourceId) => {
      const sorted = [...items].sort((a, b) => Date.parse(a.raceTime!) - Date.parse(b.raceTime!));
      for (let index = 1; index < sorted.length; index += 1) {
        const first = sorted[index - 1];
        const second = sorted[index];
        const minutesApart = Math.round((Date.parse(second.raceTime!) - Date.parse(first.raceTime!)) / 60000);
        if (minutesApart >= minimumRaceTurnaroundMinutes) continue;
        conflicts.push({
          kind,
          resourceId,
          resourceName: kind === "boat" ? second.boatName : resourceId,
          first,
          second,
          minutesApart,
          severity: minutesApart < Math.min(15, minimumRaceTurnaroundMinutes) ? "high" : "warning",
        });
      }
    });
    return conflicts;
  };

  return {
    boat: compare("boat", (item) => item.boatId ? [item.boatId] : []),
    rower: compare("rower", (item) => item.memberIds),
  };
}
