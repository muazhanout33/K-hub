import { dictionaries, type Dictionary } from './dictionaries';

/**
 * Reverse lookup: English source string → dictionary key inside `errors`.
 *
 * Services, stores and server actions keep returning their existing English
 * messages (business logic untouched); the UI passes them through
 * `errorMessageKey()` and renders the localized value. Unknown strings fall
 * back to themselves, so nothing ever disappears.
 */
const errorKeyByMessage = new Map<string, string>();

function buildErrorIndex(errors: Dictionary['errors']): void {
  for (const [key, message] of Object.entries(errors)) {
    if (!errorKeyByMessage.has(message)) {
      errorKeyByMessage.set(message, `errors.${key}`);
    }
  }
}

buildErrorIndex(dictionaries.en.errors);

/** Returns the `errors.*` key for a known English message, else `null`. */
export function errorMessageKey(message: string): string | null {
  return errorKeyByMessage.get(message) ?? null;
}
