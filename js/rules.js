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

  // Todas as formas de distribuir os ouros entre as ameaças. Cada ouro bloqueia
  // nenhuma, uma ou várias ameaças (desde que o seu valor cubra a soma delas).
  function enumerateAssignments(threats, blockers) {
    const results = [];
    const subsets = 1 << threats.length;
    const choice = new Array(blockers.length).fill(0);
    (function rec(i) {
      if (i === blockers.length) {
        const map = {};
        choice.forEach(function (mask, bi) {
          threats.forEach(function (t, ti) {
            if (mask & (1 << ti)) (map[t.id] = map[t.id] || []).push(blockers[bi].id);
          });
        });
        results.push(map);
        return;
      }
      for (let mask = 0; mask < subsets; mask++) {
        choice[i] = mask;
        rec(i + 1);
      }
    })(0);
    return results;
  }

  // Agrupa ameaças e ouros ligados pelo mapa de bloqueios. Em cada grupo, os ouros
  // somados enfrentam as ameaças somadas (ex.: J♦ contra 8♠ + 3♠).
  function blockGroups(threats, blockers, map) {
    const groups = [];
    const groupOf = {};
    threats.forEach(function (t) {
      (map[t.id] || []).forEach(function (bid) {
        const b = blockers.find(function (x) { return x.id === bid; });
        if (!b) return;
        let g = groupOf[t.id] || groupOf[b.id];
        const other = groupOf[t.id] && groupOf[b.id] && groupOf[t.id] !== groupOf[b.id] ? groupOf[b.id] : null;
        if (!g) {
          g = { threats: [], blockers: [] };
          groups.push(g);
        }
        if (other) {
          other.threats.forEach(function (x) { g.threats.push(x); groupOf[x.id] = g; });
          other.blockers.forEach(function (x) { g.blockers.push(x); groupOf[x.id] = g; });
          groups.splice(groups.indexOf(other), 1);
        }
        if (!groupOf[t.id]) { g.threats.push(t); groupOf[t.id] = g; }
        if (!groupOf[b.id]) { g.blockers.push(b); groupOf[b.id] = g; }
      });
    });
    // Mantém a ordem original das cartas dentro de cada grupo
    groups.forEach(function (g) {
      g.threats.sort(function (a, b) { return threats.indexOf(a) - threats.indexOf(b); });
      g.blockers.sort(function (a, b) { return blockers.indexOf(a) - blockers.indexOf(b); });
    });
    return groups;
  }

  function preventedDamage(threats, blockers, map) {
    let prevented = 0;
    let used = 0;
    let links = 0;
    blockGroups(threats, blockers, map).forEach(function (g) {
      used += g.blockers.length;
      if (total(g.blockers) >= total(g.threats)) prevented += total(g.threats);
    });
    Object.keys(map).forEach(function (tid) { links += map[tid].length; });
    return { prevented: prevented, used: used, links: links };
  }

  // Melhor distribuição: maximiza o dano evitado usando o mínimo de ouros
  function bestAssignment(threats, blockers) {
    let best = {};
    let bestScore = { prevented: -1, used: 0, links: 0 };
    enumerateAssignments(threats, blockers).forEach(function (map) {
      const s = preventedDamage(threats, blockers, map);
      if (s.prevented > bestScore.prevented ||
          (s.prevented === bestScore.prevented && s.used < bestScore.used) ||
          (s.prevented === bestScore.prevented && s.used === bestScore.used && s.links < bestScore.links)) {
        best = map;
        bestScore = s;
      }
    });
    return best;
  }

  // Maior conjunto de cartas de dano cuja soma seja MENOR OU IGUAL ao valor da copas
  function bestHeal(damageCards, heartValue) {
    const limit = heartValue;
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
    const grouped = new Set();
    blockGroups(threats, blockers, map).forEach(function (g) {
      g.blockers.forEach(function (b) { used.add(b.id); });
      g.threats.forEach(function (t) { grouped.add(t.id); });
      const sum = total(g.blockers);
      const attack = total(g.threats);
      const many = g.threats.length > 1;
      if (attack > sum) {
        victim.damage.push.apply(victim.damage, g.threats);
        state.discard.push.apply(state.discard, g.blockers);
        events.push({ type: 'hit', text: labels(g.threats) + (many ? ' (' + attack + ') romperam' : ' rompeu') +
          ' a defesa ' + labels(g.blockers) + ' (' + sum + '): ' + attack + ' de dano em ' + NAMES[victimId] + '.' });
      } else {
        state.discard.push.apply(state.discard, g.threats);
        state.discard.push.apply(state.discard, g.blockers);
        events.push({ type: 'block', text: labels(g.blockers) + ' (' + sum + ') bloqueou ' + labels(g.threats) +
          (many ? ' (' + attack + ')' : '') + '. Cartas descartadas.' });
      }
    });
    threats.forEach(function (threat) {
      if (grouped.has(threat.id)) return;
      victim.damage.push(threat);
      events.push({ type: 'hit', text: label(threat) + ' não foi bloqueada: ' + threat.value + ' de dano em ' + NAMES[victimId] + '.' });
    });
    blockers.forEach(function (b) {
      if (!used.has(b.id)) {
        state.discard.push(b);
        events.push({ type: 'discard', text: label(b) + ' não teve o que defender e foi descartada.' });
      }
    });
  }

  // Cura carta a carta: cada copas remove cartas cuja soma seja menor ou igual ao seu valor
  function sequentialHeal(hearts, damage) {
    let remaining = damage.slice();
    const removed = [];
    hearts.forEach(function (h) {
      const healed = bestHeal(remaining, h.value);
      removed.push.apply(removed, healed);
      remaining = remaining.filter(function (c) { return healed.indexOf(c) < 0; });
    });
    return removed;
  }

  // Duas copas somadas removem a maior carta de dano com valor igual ou inferior à soma
  function combinedHeal(hearts, damage) {
    if (hearts.length !== 2) return [];
    const sum = total(hearts);
    let best = null;
    damage.forEach(function (c) {
      if (c.value <= sum && (!best || c.value > best.value)) best = c;
    });
    return best ? [best] : [];
  }

  // Escolhe a forma de cura que remove mais dano
  function planHeal(hearts, damage) {
    const sequential = sequentialHeal(hearts, damage);
    const combined = combinedHeal(hearts, damage);
    if (total(combined) > total(sequential)) return { removed: combined, combined: true };
    return { removed: sequential, combined: false };
  }

  function applyHearts(state, playerId, hearts, events) {
    if (!hearts.length) return;
    const player = state.players[playerId];
    state.discard.push.apply(state.discard, hearts);
    if (player.damage.length === 0) {
      events.push({ type: 'discard', text: labels(hearts) + ' de ' + NAMES[playerId] + ' descartada(s): não havia dano para recuperar.' });
      return;
    }
    const plan = planHeal(hearts, player.damage);
    if (plan.removed.length === 0) {
      events.push({ type: 'discard', text: labels(hearts) + ' de ' + NAMES[playerId] + ' não alcança(m) nenhuma carta de dano e foi(ram) descartada(s).' });
      return;
    }
    player.damage = player.damage.filter(function (c) { return plan.removed.indexOf(c) < 0; });
    state.discard.push.apply(state.discard, plan.removed);
    const source = plan.combined ? labels(hearts) + ' (soma ' + total(hearts) + ')' : labels(hearts);
    events.push({ type: 'heal', text: source + ' recuperou ' + total(plan.removed) + ' de dano de ' + NAMES[playerId] + ' (' + labels(plan.removed) + ').' });
  }

  // Remove ids inválidos e repetidos. Um mesmo ouro pode bloquear várias ameaças.
  function sanitize(map, clash) {
    const out = {};
    const threatIds = clash.threats.map(function (c) { return c.id; });
    const blockerIds = clash.blockers.map(function (c) { return c.id; });
    Object.keys(map || {}).forEach(function (tid) {
      if (threatIds.indexOf(tid) < 0) return;
      (map[tid] || []).forEach(function (bid) {
        if (blockerIds.indexOf(bid) < 0 || (out[tid] && out[tid].indexOf(bid) >= 0)) return;
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
    const isHeart = function (c) { return c.suit === 'H'; };
    applyHearts(state, attackerId, attack.filter(isHeart), events);
    applyHearts(state, defenderId, defense.filter(isHeart), events);

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
    blockGroups: blockGroups,
    bestAssignment: bestAssignment,
    bestHeal: bestHeal,
    planHeal: planHeal,
    resolveTurn: resolveTurn,
    checkEnd: checkEnd,
    endTurn: endTurn
  };

  root.BR = root.BR || {};
  root.BR.Rules = Rules;
  if (typeof module !== 'undefined' && module.exports) module.exports = Rules;
})(typeof window !== 'undefined' ? window : globalThis);
