export interface DrawerCandidate {
  id: string;
  joinIndex: number;
}

/**
 * Escolhe quem desenha: quem desenhou menos vezes; empate -> quem entrou primeiro.
 * Evita repetir o desenhista anterior enquanto houver alternativa.
 */
export function pickNextDrawer(
  candidates: DrawerCandidate[],
  turns: Map<string, number>,
  lastDrawerId: string | null,
): string {
  if (candidates.length === 0) throw new Error('Sem candidatos a desenhista');
  const sorted = [...candidates].sort((a, b) => {
    const diff = (turns.get(a.id) ?? 0) - (turns.get(b.id) ?? 0);
    return diff !== 0 ? diff : a.joinIndex - b.joinIndex;
  });
  const alternative = sorted.find((c) => c.id !== lastDrawerId);
  return (alternative ?? sorted[0]).id;
}
