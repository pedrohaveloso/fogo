export function plural(value: number, singular: string, pluralForm: string): string {
  return value !== 0 && Math.abs(value) < 2 ? singular : pluralForm;
}
