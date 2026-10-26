export function plural(value: number, singular: string, pluralForm: string): string {
  return value !== 0 && Math.abs(value) < 2 ? singular : pluralForm;
}

export function formatMaintenanceDue(days: number): string {
  if (days < 0) {
    return `vencida há ${-days} ${days === -1 ? "dia" : "dias"}`;
  }
  if (days === 0) {
    return "hoje";
  }
  return days === 1 ? "amanhã" : `em ${days} dias`;
}

export function fold(text: string): string {
  return text
    .normalize("NFD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
