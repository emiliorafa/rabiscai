export type Category = 'objeto' | 'animal' | 'comida' | 'profissão' | 'lugar' | 'ação' | 'conceito';

export interface WordEntry {
  word: string;
  category: Category;
  /** 1 = fácil, 2 = médio, 3 = difícil */
  difficulty: 1 | 2 | 3;
}

const w = (category: Category, difficulty: 1 | 2 | 3, words: string[]): WordEntry[] =>
  words.map((word) => ({ word: word.normalize('NFC'), category, difficulty }));

export const WORDS: WordEntry[] = [
  ...w('objeto', 1, ['Cadeira', 'Mesa', 'Bola', 'Chave', 'Cama', 'Livro', 'Sapato', 'Chapéu', 'Relógio', 'Telefone']),
  ...w('objeto', 2, ['Guarda-chuva', 'Óculos', 'Tesoura', 'Mochila', 'Vassoura', 'Lâmpada', 'Espelho', 'Violão', 'Bicicleta', 'Martelo']),
  ...w('objeto', 3, ['Escova de dentes', 'Ventilador', 'Cadeado', 'Pneu', 'Televisão']),
  ...w('animal', 1, ['Cachorro', 'Gato', 'Elefante', 'Girafa', 'Cobra', 'Macaco', 'Leão', 'Cavalo', 'Coelho']),
  ...w('animal', 2, ['Tartaruga', 'Borboleta', 'Pinguim', 'Coruja', 'Tubarão', 'Jacaré', 'Aranha', 'Baleia', 'Papagaio']),
  ...w('animal', 3, ['Polvo', 'Caracol', 'Tamanduá', 'Camaleão']),
  ...w('comida', 1, ['Banana', 'Pizza', 'Sorvete', 'Bolo', 'Cenoura', 'Morango', 'Queijo', 'Pipoca']),
  ...w('comida', 2, ['Brigadeiro', 'Hambúrguer', 'Melancia', 'Abacaxi', 'Coxinha', 'Macarrão', 'Sanduíche', 'Pastel']),
  ...w('comida', 3, ['Pão de queijo', 'Feijoada', 'Churrasco', 'Tapioca', 'Ovo frito']),
  ...w('profissão', 1, ['Médico', 'Professor', 'Bombeiro', 'Palhaço', 'Cantor']),
  ...w('profissão', 2, ['Padeiro', 'Astronauta', 'Cozinheiro', 'Dentista', 'Pintor', 'Piloto', 'Pescador']),
  ...w('profissão', 3, ['Jardineiro', 'Mágico', 'Fotógrafo']),
  ...w('lugar', 1, ['Praia', 'Escola', 'Hospital', 'Floresta', 'Montanha', 'Igreja']),
  ...w('lugar', 2, ['Aeroporto', 'Biblioteca', 'Circo', 'Castelo', 'Farol', 'Cachoeira', 'Estádio', 'Zoológico']),
  ...w('lugar', 3, ['Deserto', 'Pirâmide', 'Supermercado']),
  ...w('ação', 1, ['Dormir', 'Nadar', 'Dançar', 'Correr', 'Voar']),
  ...w('ação', 2, ['Pular corda', 'Pescar', 'Cozinhar', 'Tomar banho', 'Jogar futebol', 'Plantar', 'Escalar']),
  ...w('ação', 3, ['Escovar os dentes', 'Espirrar', 'Surfar']),
  ...w('conceito', 1, ['Chuva', 'Natal', 'Fantasma', 'Festa de aniversário']),
  ...w('conceito', 2, ['Amizade', 'Sonho', 'Medo', 'Arco-íris', 'Carnaval', 'Dor de cabeça']),
  ...w('conceito', 3, ['Liberdade', 'Tempo', 'Eclipse', 'Gravidade', 'Silêncio', 'Saudade']),
];

/** Sorteia uma palavra ainda não usada na partida. Se todas foram usadas, recomeça o ciclo. */
export function pickRandomWord(used: Set<string>, random: () => number = Math.random): string {
  let pool = WORDS.filter((entry) => !used.has(entry.word));
  if (pool.length === 0) {
    used.clear();
    pool = WORDS;
  }
  return pool[Math.floor(random() * pool.length)].word;
}
