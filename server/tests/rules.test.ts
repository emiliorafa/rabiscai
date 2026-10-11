import { describe, expect, it } from 'vitest';
import { validateNickname, normalizeRoomCode } from '../../shared/protocol';
import { WORDS, pickRandomWord } from '../src/data/words';
import { pickNextDrawer } from '../src/game/drawers';
import { containsWord, isCorrectGuess, maskWord, normalizeText, sanitizeMessage } from '../src/game/guess';
import { RateLimiter } from '../src/game/RateLimiter';
import { pointsForGuess, rankPlayers } from '../src/game/scoring';

describe('pontuação', () => {
  it('1º=100, 2º=70, demais=50', () => {
    expect([0, 1, 2, 3, 9].map(pointsForGuess)).toEqual([100, 70, 50, 50, 50]);
  });

  it('classifica com empates', () => {
    const ranking = rankPlayers([
      { id: 'a', nickname: 'A', score: 100 },
      { id: 'b', nickname: 'B', score: 250 },
      { id: 'c', nickname: 'C', score: 100 },
      { id: 'd', nickname: 'D', score: 0 },
    ]);
    expect(ranking.map((r) => [r.nickname, r.rank])).toEqual([['B', 1], ['A', 2], ['C', 2], ['D', 4]]);
  });
});

describe('validação de palpites', () => {
  it('ignora maiúsculas, acentos e espaços extras', () => {
    expect(isCorrectGuess('  bAnAnA ', 'Banana')).toBe(true);
    expect(isCorrectGuess('pao  de   queijo', 'Pão de queijo')).toBe(true);
    expect(isCorrectGuess('CAMALEAO', 'Camaleão')).toBe(true);
    expect(isCorrectGuess('banan', 'Banana')).toBe(false);
    expect(isCorrectGuess('bananas', 'Banana')).toBe(false);
  });

  it('detecta a palavra dentro de uma frase', () => {
    expect(containsWord('é uma BANANA!', 'Banana')).toBe(true);
    expect(containsWord('ba nana', 'Banana')).toBe(true);
    expect(containsWord('é uma fruta', 'Banana')).toBe(false);
  });

  it('mascara a palavra', () => {
    expect(maskWord('BANANA')).toBe('_ _ _ _ _ _');
    expect(maskWord('Guarda-chuva')).toBe('_ _ _ _ _ _ - _ _ _ _ _');
    expect(maskWord('Ovo frito')).toBe('_ _ _   _ _ _ _ _');
  });

  it('sanitiza mensagens', () => {
    expect(sanitizeMessage('  oi \n\t  tudo   bem\u0000 ')).toBe('oi tudo bem');
    expect(sanitizeMessage('   ')).toBe('');
    expect(normalizeText('  ÁrVoRe ')).toBe('arvore');
  });
});

describe('alternância de desenhistas', () => {
  const cands = [
    { id: 'a', joinIndex: 0 },
    { id: 'b', joinIndex: 1 },
    { id: 'c', joinIndex: 2 },
  ];

  it('todos desenham antes de alguém repetir e ninguém repete em sequência', () => {
    const turns = new Map<string, number>();
    let last: string | null = null;
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      const id = pickNextDrawer(cands, turns, last);
      turns.set(id, (turns.get(id) ?? 0) + 1);
      expect(id).not.toBe(last);
      order.push(id);
      last = id;
    }
    expect(order).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  });

  it('com um único candidato ele pode repetir', () => {
    expect(pickNextDrawer([cands[0]], new Map([['a', 1]]), 'a')).toBe('a');
  });
});

describe('palavras e validações', () => {
  it('tem pelo menos 100 palavras únicas em várias categorias e dificuldades', () => {
    const unique = new Set(WORDS.map((w) => w.word));
    expect(unique.size).toBeGreaterThanOrEqual(100);
    expect(new Set(WORDS.map((w) => w.category)).size).toBe(7);
    expect(new Set(WORDS.map((w) => w.difficulty)).size).toBe(3);
  });

  it('não repete palavras até esgotar a lista', () => {
    const used = new Set<string>();
    for (let i = 0; i < WORDS.length; i++) used.add(pickRandomWord(used));
    expect(used.size).toBe(WORDS.length);
  });

  it('valida apelidos e códigos', () => {
    expect(validateNickname('').ok).toBe(false);
    expect(validateNickname('   ').ok).toBe(false);
    expect(validateNickname('a').ok).toBe(false);
    expect(validateNickname('x'.repeat(17)).ok).toBe(false);
    expect(validateNickname('<script>').ok).toBe(false);
    expect(validateNickname(42).ok).toBe(false);
    expect(validateNickname('  João   Silva ')).toEqual({ ok: true, nickname: 'João Silva' });
    expect(normalizeRoomCode(' abc12 ')).toBe('ABC12');
    expect(normalizeRoomCode('abc')).toBeNull();
    expect(normalizeRoomCode(null)).toBeNull();
  });

  it('limita taxa de eventos', () => {
    const rl = new RateLimiter(3, 1000);
    expect([0, 100, 200, 300].map((t) => rl.allow(t))).toEqual([true, true, true, false]);
    expect(rl.allow(1200)).toBe(true);
  });
});
