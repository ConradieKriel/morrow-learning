export const ACTIVITY_LANGUAGES = [
  { value: 'English', label: 'English', group: 'South African official languages' },
  { value: 'Afrikaans', label: 'Afrikaans', group: 'South African official languages' },
  { value: 'isiNdebele', label: 'isiNdebele', group: 'South African official languages' },
  { value: 'isiXhosa', label: 'isiXhosa', group: 'South African official languages' },
  { value: 'isiZulu', label: 'isiZulu', group: 'South African official languages' },
  { value: 'Sepedi', label: 'Sepedi (Sesotho sa Leboa)', group: 'South African official languages' },
  { value: 'Sesotho', label: 'Sesotho', group: 'South African official languages' },
  { value: 'Setswana', label: 'Setswana', group: 'South African official languages' },
  { value: 'siSwati', label: 'siSwati', group: 'South African official languages' },
  { value: 'Tshivenda', label: 'Tshivenda', group: 'South African official languages' },
  { value: 'itsonga', label: 'itsonga', group: 'South African official languages' },
  { value: 'French', label: 'French', group: 'Additional languages' },
  { value: 'German', label: 'German', group: 'Additional languages' },
  { value: 'Italian', label: 'Italian', group: 'Additional languages' },
  { value: 'Dutch', label: 'Dutch', group: 'Additional languages' },
  { value: 'Portuguese', label: 'Portuguese', group: 'Additional languages' },
  { value: 'Spanish', label: 'Spanish', group: 'Additional languages' },
] as const;

export type ActivityLanguage = (typeof ACTIVITY_LANGUAGES)[number]['value'];
export const DEFAULT_ACTIVITY_LANGUAGE: ActivityLanguage = 'English';

export function normalizeActivityLanguage(value: unknown): ActivityLanguage {
  if (typeof value !== 'string') return DEFAULT_ACTIVITY_LANGUAGE;
  const match = ACTIVITY_LANGUAGES.find((language) => language.value === value);
  return match?.value || DEFAULT_ACTIVITY_LANGUAGE;
}

export function getActivityLanguageLabel(value: unknown): string {
  return ACTIVITY_LANGUAGES.find((language) => language.value === value)?.label || DEFAULT_ACTIVITY_LANGUAGE;
}
