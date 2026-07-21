export function optionalFieldDisplay(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Nicht angegeben";
}

export function optionalFormValue(value: string | null | undefined): string {
  return value ?? "";
}
