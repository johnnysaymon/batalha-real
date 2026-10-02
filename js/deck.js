/* Batalha Real — baralho e utilidades de cartas */
(function (root) {
  'use strict';

  const SUITS = ['S', 'C', 'D', 'H'];

  const SUIT_INFO = {
    S: { symbol: '♠', name: 'Espadas', role: 'Ataque', weight: 4, color: 'black' },
    C: { symbol: '♣', name: 'Paus', role: 'Contra-ataque', weight: 3, color: 'black' },
    D: { symbol: '♦', name: 'Ouros', role: 'Defesa', weight: 2, color: 'red' },
    H: { symbol: '♥', name: 'Copas', role: 'Recuperação', weight: 1, color: 'red' }
  };

  const RANK_LABELS = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  function rankLabel(value) {
    return RANK_LABELS[value] || String(value);
  }

  function makeCard(suit, value) {
    return { id: suit + value, suit: suit, value: value };
  }

  function createDeck() {
    const deck = [];
    SUITS.forEach(function (suit) {
      for (let value = 1; value <= 13; value++) deck.push(makeCard(suit, value));
    });
    return deck;
  }

  // Fisher-Yates
  function shuffle(cards, rng) {
    const random = rng || Math.random;
    const arr = cards.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  // > 0 se a carta a for maior que b (valor, depois peso do naipe)
  function compareCards(a, b) {
    return (a.value - b.value) || (SUIT_INFO[a.suit].weight - SUIT_INFO[b.suit].weight);
  }

  function cardLabel(card) {
    return rankLabel(card.value) + SUIT_INFO[card.suit].symbol;
  }

  const Deck = {
    SUITS: SUITS,
    SUIT_INFO: SUIT_INFO,
    rankLabel: rankLabel,
    makeCard: makeCard,
    createDeck: createDeck,
    shuffle: shuffle,
    compareCards: compareCards,
    cardLabel: cardLabel
  };

  root.BR = root.BR || {};
  root.BR.Deck = Deck;
  if (typeof module !== 'undefined' && module.exports) module.exports = Deck;
})(typeof window !== 'undefined' ? window : globalThis);
