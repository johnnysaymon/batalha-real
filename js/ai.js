/* Batalha Real — inteligência da máquina (heurística simples) */
(function (root) {
  'use strict';

  const Rules = (typeof require === 'function' && typeof module !== 'undefined')
    ? require('./rules.js')
    : root.BR.Rules;

  function combos(hand) {
    const list = [];
    for (let i = 0; i < hand.length; i++) {
      list.push([hand[i]]);
      for (let j = i + 1; j < hand.length; j++) list.push([hand[i], hand[j]]);
    }
    return list;
  }

  // Simula a cura sequencial de uma ou mais copas
  function healValue(hearts, damage) {
    let remaining = damage.slice();
    let healed = 0;
    hearts.forEach(function (h) {
      const removed = Rules.bestHeal(remaining, h.value);
      healed += Rules.total(removed);
      remaining = remaining.filter(function (c) { return removed.indexOf(c) < 0; });
    });
    return healed;
  }

  function scoreAttack(combo, me, opp) {
    const oppDamage = Rules.total(opp.damage);
    const aggression = oppDamage >= 20 ? 1.1 : 0.8;
    let score = 0;
    let diamonds = 0;
    const hearts = [];
    combo.forEach(function (c) {
      if (c.suit === 'S') score += c.value * aggression;
      else if (c.suit === 'D') score += (diamonds++ === 0 ? Math.min(c.value, 8) * 0.45 : Math.min(c.value, 8) * 0.15);
      else if (c.suit === 'H') hearts.push(c);
      else score -= 1.5; // paus não servem ao atacante
    });
    score += healValue(hearts, me.damage) * 1.1;
    if (hearts.length && healValue(hearts, me.damage) === 0) score -= 1;
    return score + combo.length * 0.4;
  }

  function scoreDefense(combo, me, opp, attackCount) {
    const myDamage = Rules.total(me.damage);
    let score = 0;
    let diamonds = 0;
    const hearts = [];
    combo.forEach(function (c) {
      if (c.suit === 'D') {
        const weight = diamonds === 0 ? 0.55 : (attackCount > 1 ? 0.35 : 0.25);
        score += c.value * weight * (myDamage >= 20 ? 1.3 : 1);
        diamonds++;
      } else if (c.suit === 'C') score += c.value * 0.7;
      else if (c.suit === 'H') hearts.push(c);
      else score -= 1.5; // espadas não servem ao defensor
    });
    score += healValue(hearts, me.damage) * 1.1;
    if (hearts.length && healValue(hearts, me.damage) === 0) score -= 1;
    return score + combo.length * 0.4;
  }

  function pick(hand, scorer, rng) {
    const random = rng || Math.random;
    let best = null;
    let bestScore = -Infinity;
    combos(hand).forEach(function (combo) {
      const s = scorer(combo) + random() * 2;
      if (s > bestScore) {
        bestScore = s;
        best = combo;
      }
    });
    return best.map(function (c) { return c.id; });
  }

  const AI = {
    chooseAttack: function (state, playerId, rng) {
      const me = state.players[playerId];
      const opp = state.players[Rules.other(playerId)];
      return pick(me.hand, function (c) { return scoreAttack(c, me, opp); }, rng);
    },
    chooseDefense: function (state, playerId, rng) {
      const me = state.players[playerId];
      const opp = state.players[Rules.other(playerId)];
      const attackCount = state.table.attack.length;
      return pick(me.hand, function (c) { return scoreDefense(c, me, opp, attackCount); }, rng);
    },
    chooseBlocks: function (threats, blockers) {
      return Rules.bestAssignment(threats, blockers);
    }
  };

  root.BR = root.BR || {};
  root.BR.AI = AI;
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
})(typeof window !== 'undefined' ? window : globalThis);
