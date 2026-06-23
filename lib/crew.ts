function normalizeCrewName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function parseCrewNamesInput(value: string) {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const rawPart of value.split(/[\n,;]+/)) {
    const name = normalizeCrewName(rawPart);
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    ordered.push(name);
  }

  return ordered;
}

export function splitNotesAndCrew(rawNotes: string | null | undefined) {
  const lines = String(rawNotes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const crewNames: string[] = [];
  const commentLines: string[] = [];

  for (const line of lines) {
    if (line.toLowerCase().startsWith("crew:")) {
      crewNames.push(...parseCrewNamesInput(line.slice(5)));
    } else {
      commentLines.push(line);
    }
  }

  return {
    notes: commentLines.join("\n") || null,
    crewNames,
  };
}

export function appendCrewNamesToNotes(notes: string, crewNames: string) {
  const normalizedNotes = splitNotesAndCrew(notes).notes;
  const parsedCrew = parseCrewNamesInput(crewNames);
  const crewLine = parsedCrew.length > 0 ? `Crew: ${parsedCrew.join(", ")}` : null;
  return [normalizedNotes, crewLine].filter(Boolean).join("\n") || "";
}
