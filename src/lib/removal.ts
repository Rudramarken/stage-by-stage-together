export function removalConfirmationValid(action: string, label: string, reason: string, confirmation: string) {
  return action === "delete" ? confirmation === label : action === "archive" || action === "restore" || reason.trim().length > 0;
}