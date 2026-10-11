/** Remove acentos, ignora maiúsculas/minúsculas e espaços extras. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function isCorrectGuess(guess: string, word: string): boolean {
  return normalizeText(guess) === normalizeText(word);
}

/** Verdadeiro se o texto contém a palavra secreta (ignorando espaços, hífens e acentos). */
export function containsWord(text: string, word: string): boolean {
  const squash = (s: string) => normalizeText(s).replace(/[\s-]/g, '');
  return squash(text).includes(squash(word));
}

/** Remove caracteres de controle e espaços repetidos. */
export function sanitizeMessage(raw: string): string {
  return raw
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "BANANA" -> "_ _ _ _ _ _". Espaços da palavra viram intervalos maiores; hífens ficam visíveis. */
export function maskWord(word: string): string {
  return [...word.normalize('NFC')]
    .map((ch) => (ch === ' ' ? ' ' : ch === '-' ? '-' : '_'))
    .join(' ');
}

export function letterCount(word: string): number {
  return [...word].filter((ch) => ch !== ' ' && ch !== '-').length;
}
