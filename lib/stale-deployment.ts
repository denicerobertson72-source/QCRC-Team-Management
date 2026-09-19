export function isStaleDeploymentError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  return /failed to find server action|server action not found|missing server action|action.*(deployment|version).*(mismatch|stale)|stale.*(action|deployment)/i.test(message);
}
