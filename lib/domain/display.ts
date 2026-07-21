export function optionalFieldDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Nicht angegeben";
}
