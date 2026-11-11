import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIVITY_LANGUAGES, DEFAULT_ACTIVITY_LANGUAGE, normalizeActivityLanguage } from '../lib/activity-languages.ts';

const SOUTH_AFRICAN_SPOKEN_LANGUAGES = [
  'English', 'Afrikaans', 'isiNdebele', 'isiXhosa', 'isiZulu', 'Sepedi',
  'Sesotho', 'Setswana', 'siSwati', 'Tshivenda', 'itsonga',
];

test('language menu includes the 11 South African spoken languages supported by text generation', () => {
  const values = ACTIVITY_LANGUAGES.map((language) => language.value);
  for (const language of SOUTH_AFRICAN_SPOKEN_LANGUAGES) assert.ok(values.includes(language), `${language} is missing`);
  assert.equal(values.some((language) => /sign language|SASL/i.test(language)), false);
});

test('language menu includes additional European language choices', () => {
  const values = ACTIVITY_LANGUAGES.map((language) => language.value);
  for (const language of ['French', 'German', 'Italian', 'Dutch', 'Portuguese', 'Spanish']) {
    assert.ok(values.includes(language), `${language} is missing`);
  }
});

test('unsupported or missing language values safely default to English', () => {
  assert.equal(normalizeActivityLanguage(undefined), DEFAULT_ACTIVITY_LANGUAGE);
  assert.equal(normalizeActivityLanguage('Klingon'), DEFAULT_ACTIVITY_LANGUAGE);
  assert.equal(normalizeActivityLanguage('South African Sign Language (SASL)'), DEFAULT_ACTIVITY_LANGUAGE);
});
