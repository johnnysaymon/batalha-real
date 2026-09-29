/* Batalha Real — regras do jogo (lógica pura, sem DOM) */
(function (root) {
  'use strict';

  const Deck = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./deck.js')
    : root.BR.Deck;

  const HAND_SIZE = 7;
  const DAMAGE_TO_WIN = 30;
  const MAX_PLAY = 2;
  const NAMES = { human: 'Você', ai: 'Máquina' };

  function other(playerId) {
    return playerId === 'human' ? 'ai' : 'human';
  }

  function total(cards) {
    return cards.reduce(function (sum, c) { return sum + c.value; }, 0);
  }

  function label(card) {
    return Deck.cardLabel(card);
  }

  function labels(cards) {
    return cards.map(label).join(' + ');
  }

  // Quem tem a maior carta revelada começa como atacante
  function determineStarter(humanCard, aiCard) {
    return Deck.compareCards(humanCard, aiCard) > 0 ? 'human' : 'ai';
  }

  function newGame(rng) {
    const deck = Deck.shuffle(Deck.createDeck(), rng);
    const state = {
      deck: deck,
      discard: [],
      players: {
        human: { hand: [], damage: [] },
        ai: { hand: [], damage: [] }
      },
      attacker: null,
      table: { attack: [], defense: [] },
      revealed: false,
      turn: 1,
      over: false,
      winner: null,
      reason: ''
    };
    ['human', 'ai'].forEach(function (id) {
      for (let i = 0; i < HAND_SIZE; i++) state.players[id].hand.push(state.deck.pop());
    });
    const reveal = {
      human: state.players.human.hand[HAND_SIZE - 1],
      ai: state.players.ai.hand[HAND_SIZE - 1]
    };
    state.attacker = determineStarter(reveal.human, reveal.ai);
    state.initialReveal = reveal;
    return state;
  }

  function isValidPlay(hand, ids) {
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > MAX_PLAY) return false;
    if (new Set(ids).size !== ids.length) return false;
    return ids.every(function (id) { return hand.some(function (c) { return c.id === id; }); });
  }

  // Move cartas da mão do jogador para a mesa ('attack' ou 'defense')
  function playCards(state, playerId, ids, slot) {
    const hand = state.players[playerId].hand;
    if (!isValidPlay(hand, ids)) throw new Error('Jogada inválida');
    const played = [];
    ids.forEach(function (id) {
      const idx = hand.findIndex(function (c) { return c.id === id; });
      played.push(hand.splice(idx, 1)[0]);
    });
    state.table[slot] = played;
    return played;
  }

  // Ameaças e bloqueios da rodada atual
  function getClashes(state) {
    const attack = state.table.attack;
    const defense = state.table.defense;
    const bySuit = function (cards, suit) { return cards.filter(function (c) { return c.suit === suit; }); };
    return {
      // espadas do atacante contra ouros do defensor (defensor escolhe os bloqueios)
      defense: { threats: bySuit(attack, 'S'), blockers: bySuit(defense, 'D') },
      // paus do defensor contra ouros do atacante (atacante escolhe os bloqueios)
      attack: { threats: bySuit(defense, 'C'), blockers: bySuit(attack, 'D') }
    };
  }

  // Todas as formas de distribuir os ouros entre as ameaças (cada ouro: nenhuma ou uma ameaça)
  function enumerateAssignments(threats, blockers) {
    const results = [];
    const choice = new Array(blockers.length).fill(-1);
    (function rec(i) {
      if (i === blockers.length) {
        const map = {};
        choice.forEach(function (t, bi) {
          if (t < 0) return;
          const tid = threats[t].id;
          (map[tid] = map[tid] || []).push(blockers[bi].id);
        });
        results.push(map);
        return;
      }
      for (let t = -1; t < threats.length; t++) {
        choice[i] = t;
        rec(i + 1);
      }
    })(0);
    return results;
  }

  function preventedDamage(threats, blockers, map) {
    let prevented = 0;
    let used = 0;
    threats.forEach(function (t) {
      const ids = map[t.id] || [];
      const sum = total(blockers.filter(function (b) { return ids.indexOf(b.id) >= 0; }));
      used += ids.length;
      if (ids.length && sum >= t.value) prevented += t.value;
    });
    return { prevented: prevented, used: used };
  }

  // Melhor distribuição: maximiza o dano evitado usando o mínimo de ouros
  function bestAssignment(threats, blockers) {
    let best = {};
    let bestScore = { prevented: -1, used: 0 };
    enumerateAssignments(threats, blockers).forEach(function (map) {
      const s = preventedDamage(threats, blockers, map);
      if (s.prevented > bestScore.prevented ||
          (s.prevented === bestScore.prevented && s.used < bestScore.used)) {
        best = map;
        bestScore = s;
      }
    });
    return best;
  }

  // Maior conjunto de cartas de dano cuja soma seja MENOR que o valor da copas
  function bestHeal(damageCards, heartValue) {
    const limit = heartValue - 1;
    if (limit <= 0) return [];
    // dp[s] = índices das cartas que somam exatamente s
    const dp = new Array(limit + 1).fill(null);
    dp[0] = [];
    damageCards.forEach(function (card, idx) {
      for (let s = limit; s >= card.value; s--) {
        if (dp[s] === null && dp[s - card.value] !== null) dp[s] = dp[s - card.value].concat(idx);
      }
    });
    for (let s = limit; s > 0; s--) {
      if (dp[s]) return dp[s].map(function (i) { return damageCards[i]; });
    }
    return [];
  }

  function resolveClash(threats, blockers, map, victimId, state, events) {
    const victim = state.players[victimId];
    const used = new Set();
    threats.forEach(function (threat) {
      const ids = map[threat.id] || [];
      const bl = blockers.filter(function (b) { return ids.indexOf(b.id) >= 0 && !used.has(b.id); });
      bl.forEach(function (b) { used.add(b.id); });
      const sum = total(bl);
      if (bl.length === 0) {
        victim.damage.push(threat);
        events.push({ type: 'hit', text: label(threat) + ' não foi bloqueada: ' + threat.value + ' de dano em ' + NAMES[victimId] + '.' });
      } else if (threat.value > sum) {
        victim.damage.push(threat);
        state.discard.push.apply(state.discard, bl);
        events.push({ type: 'hit', text: label(threat) + ' rompeu a defesa ' + labels(bl) + ' (' + sum + '): ' + threat.value + ' de dano em ' + NAMES[victimId] + '.' });
      } else {
        state.discard.push(threat);
        state.discard.push.apply(state.discard, bl);
        events.push({ type: 'block', text: labels(bl) + ' (' + sum + ') bloqueou ' + label(threat) + '. Cartas descartadas.' });
      }
    });
    blockers.forEach(function (b) {
      if (!used.has(b.id)) {
        state.discard.push(b);
        events.push({ type: 'discard', text: label(b) + ' não teve o que defender e foi descartada.' });
      }
    });
  }

  function applyHeal(state, playerId, heart, events) {
    const player = state.players[playerId];
    state.discard.push(heart);
    if (player.damage.length === 0) {
      events.push({ type: 'discard', text: label(heart) + ' de ' + NAMES[playerId] + ' descartada: não havia dano para recuperar.' });
      return;
    }
    const healed = bestHeal(player.damage, heart.value);
    if (healed.length === 0) {
      events.push({ type: 'discard', text: label(heart) + ' de ' + NAMES[playerId] + ' não supera nenhuma carta de dano e foi descartada.' });
      return;
    }
    player.damage = player.damage.filter(function (c) { return healed.indexOf(c) < 0; });
    state.discard.push.apply(state.discard, healed);
    events.push({ type: 'heal', text: label(heart) + ' recuperou ' + total(healed) + ' de dano de ' + NAMES[playerId] + ' (' + labels(healed) + ').' });
  }

  function sanitize(map, clash) {
    const out = {};
    const seen = new Set();
    const threatIds = clash.threats.map(function (c) { return c.id; });
    const blockerIds = clash.blockers.map(function (c) { return c.id; });
    Object.keys(map || {}).forEach(function (tid) {
      if (threatIds.indexOf(tid) < 0) return;
      (map[tid] || []).forEach(function (bid) {
        if (blockerIds.indexOf(bid) < 0 || seen.has(bid)) return;
        seen.add(bid);
        (out[tid] = out[tid] || []).push(bid);
      });
    });
    return out;
  }

  // Resolve a rodada. blocks = { defense: {idEspada: [idsOuro]}, attack: {idPaus: [idsOuro]} }
  function resolveTurn(state, blocks) {
    const events = [];
    const attackerId = state.attacker;
    const defenderId = other(attackerId);
    const attack = state.table.attack;
    const defense = state.table.defense;
    const clashes = getClashes(state);
    blocks = blocks || {};

    // Paus do atacante e espadas do defensor não têm efeito
    attack.filter(function (c) { return c.suit === 'C'; }).forEach(function (c) {
      state.discard.push(c);
      events.push({ type: 'discard', text: label(c) + ' (paus do atacante) foi descartada.' });
    });
    defense.filter(function (c) { return c.suit === 'S'; }).forEach(function (c) {
      state.discard.push(c);
      events.push({ type: 'discard', text: label(c) + ' (espada do defensor) foi descartada.' });
    });

    // Ataque: espadas x ouros do defensor
    resolveClash(clashes.defense.threats, clashes.defense.blockers,
      sanitize(blocks.defense, clashes.defense), defenderId, state, events);
    // Contra-ataque: paus x ouros do atacante
    resolveClash(clashes.attack.threats, clashes.attack.blockers,
      sanitize(blocks.attack, clashes.attack), attackerId, state, events);

    // Recuperação (após o combate)
    attack.filter(function (c) { return c.suit === 'H'; }).forEach(function (c) { applyHeal(state, attackerId, c, events); });
    defense.filter(function (c) { return c.suit === 'H'; }).forEach(function (c) { applyHeal(state, defenderId, c, events); });

    state.table = { attack: [], defense: [] };
    state.revealed = false;
    return events;
  }

  function decideWinner(state) {
    const h = total(state.players.human.damage);
    const a = total(state.players.ai.damage);
    return h < a ? 'human' : (a < h ? 'ai' : 'draw');
  }

  function checkEnd(state) {
    const h = total(state.players.human.damage);
    const a = total(state.players.ai.damage);
    if (h >= DAMAGE_TO_WIN || a >= DAMAGE_TO_WIN) {
      state.over = true;
      state.winner = decideWinner(state);
      state.reason = 'damage';
    } else if (state.deck.length === 0 &&
        (state.players.human.hand.length < HAND_SIZE || state.players.ai.hand.length < HAND_SIZE)) {
      state.over = true;
      state.winner = decideWinner(state);
      state.reason = 'deck';
    }
    return state.over;
  }

  // Completa as mãos (atacante primeiro), verifica o fim e alterna os papéis
  function endTurn(state) {
    const events = [];
    const order = [state.attacker, other(state.attacker)];
    if (!checkEnd(state)) {
      order.forEach(function (id) {
        const hand = state.players[id].hand;
        let drawn = 0;
        while (hand.length < HAND_SIZE && state.deck.length > 0) {
          hand.push(state.deck.pop());
          drawn++;
        }
        if (drawn) events.push({ type: 'draw', text: NAMES[id] + ' puxou ' + drawn + (drawn > 1 ? ' cartas.' : ' carta.') });
      });
      checkEnd(state);
    }
    if (!state.over) {
      state.attacker = other(state.attacker);
      state.turn++;
    }
    return events;
  }

  const Rules = {
    HAND_SIZE: HAND_SIZE,
    DAMAGE_TO_WIN: DAMAGE_TO_WIN,
    MAX_PLAY: MAX_PLAY,
    NAMES: NAMES,
    other: other,
    total: total,
    determineStarter: determineStarter,
    newGame: newGame,
    isValidPlay: isValidPlay,
    playCards: playCards,
    getClashes: getClashes,
    enumerateAssignments: enumerateAssignments,
    bestAssignment: bestAssignment,
    bestHeal: bestHeal,
    resolveTurn: resolveTurn,
    checkEnd: checkEnd,
    endTurn: endTurn
  };

  root.BR = root.BR || {};
  root.BR.Rules = Rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
})(typeof window !== 'undefined' ? window : globalThis);
