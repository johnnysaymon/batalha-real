/* Testes das regras: node tests/rules.test.js */
'use strict';
const assert = require('assert');
const Deck = require('../js/deck.js');
const Rules = require('../js/rules.js');
const AI = require('../js/ai.js');

const c = (suit, value) => Deck.makeCard(suit, value);
const ids = (cards) => cards.map((x) => x.id).sort();

function baseState(attacker) {
  return {
    deck: [], discard: [],
    players: { human: { hand: [], damage: [] }, ai: { hand: [], damage: [] } },
    attacker: attacker || 'human',
    table: { attack: [], defense: [] },
    revealed: true, turn: 1, over: false, winner: null, reason: ''
  };
}

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('  ✓ ' + name); } catch (e) { console.error('  ✗ ' + name + '\n    ' + e.message); process.exitCode = 1; }
}

console.log('Batalha Real — regras');

test('baralho tem 52 cartas únicas', () => {
  const d = Deck.createDeck();
  assert.strictEqual(d.length, 52);
  assert.strictEqual(new Set(d.map((x) => x.id)).size, 52);
});

test('maior carta começa; empate decidido pelo naipe ♠ > ♣ > ♦ > ♥', () => {
  assert.strictEqual(Rules.determineStarter(c('H', 10), c('S', 9)), 'human');
  assert.strictEqual(Rules.determineStarter(c('H', 9), c('S', 9)), 'ai');
  assert.strictEqual(Rules.determineStarter(c('C', 5), c('D', 5)), 'human');
  assert.strictEqual(Rules.determineStarter(c('D', 5), c('H', 5)), 'human');
});

test('newGame distribui 7 cartas e define o atacante pela última carta', () => {
  const s = Rules.newGame();
  assert.strictEqual(s.players.human.hand.length, 7);
  assert.strictEqual(s.players.ai.hand.length, 7);
  assert.strictEqual(s.deck.length, 38);
  assert.strictEqual(s.attacker, Rules.determineStarter(s.initialReveal.human, s.initialReveal.ai));
});

test('espada sem bloqueio causa dano direto no defensor', () => {
  const s = baseState('human');
  s.table.attack = [c('S', 9)];
  s.table.defense = [c('C', 2)];
  Rules.resolveTurn(s, {});
  assert.deepStrictEqual(ids(s.players.ai.damage), ['S9']);
  assert.deepStrictEqual(ids(s.players.human.damage), ['C2']); // paus sem ouro = dano direto
});

test('espada maior que ouro vai para a área de dano; ouro descartado', () => {
  const s = baseState('human');
  s.table.attack = [c('S', 10)];
  s.table.defense = [c('D', 7)];
  Rules.resolveTurn(s, { defense: { S10: ['D7'] } });
  assert.deepStrictEqual(ids(s.players.ai.damage), ['S10']);
  assert.deepStrictEqual(ids(s.discard), ['D7']);
});

test('ouro maior ou igual bloqueia: ambas descartadas', () => {
  const s = baseState('human');
  s.table.attack = [c('S', 7)];
  s.table.defense = [c('D', 7)];
  Rules.resolveTurn(s, { defense: { S7: ['D7'] } });
  assert.strictEqual(s.players.ai.damage.length, 0);
  assert.deepStrictEqual(ids(s.discard), ['D7', 'S7']);
});

test('defensor pode somar dois ouros contra uma espada', () => {
  const s = baseState('ai');
  s.table.attack = [c('S', 12)];
  s.table.defense = [c('D', 5), c('D', 8)];
  Rules.resolveTurn(s, { defense: { S12: ['D5', 'D8'] } });
  assert.strictEqual(s.players.human.damage.length, 0);
  assert.strictEqual(s.discard.length, 3);
});

test('defensor escolhe qual espada bloquear', () => {
  const s = baseState('human');
  s.table.attack = [c('S', 4), c('S', 11)];
  s.table.defense = [c('D', 12)];
  Rules.resolveTurn(s, { defense: { S11: ['D12'] } });
  assert.deepStrictEqual(ids(s.players.ai.damage), ['S4']);
});

test('paus do defensor maior que ouro do atacante causa dano no atacante', () => {
  const s = baseState('human');
  s.table.attack = [c('D', 6)];
  s.table.defense = [c('C', 9)];
  Rules.resolveTurn(s, { attack: { C9: ['D6'] } });
  assert.deepStrictEqual(ids(s.players.human.damage), ['C9']);
});

test('ouro do atacante bloqueia paus menor', () => {
  const s = baseState('human');
  s.table.attack = [c('D', 10)];
  s.table.defense = [c('C', 9)];
  Rules.resolveTurn(s, { attack: { C9: ['D10'] } });
  assert.strictEqual(s.players.human.damage.length, 0);
  assert.strictEqual(s.discard.length, 2);
});

test('paus do atacante e espada do defensor são descartadas', () => {
  const s = baseState('human');
  s.table.attack = [c('C', 13)];
  s.table.defense = [c('S', 13)];
  Rules.resolveTurn(s, {});
  assert.strictEqual(s.players.human.damage.length + s.players.ai.damage.length, 0);
  assert.deepStrictEqual(ids(s.discard), ['C13', 'S13']);
});

test('copas sem dano é descartada', () => {
  const s = baseState('human');
  s.table.attack = [c('H', 10)];
  s.table.defense = [c('H', 3)];
  Rules.resolveTurn(s, {});
  assert.deepStrictEqual(ids(s.discard), ['H10', 'H3']);
});

test('copas remove cartas de dano com soma menor que seu valor', () => {
  const s = baseState('human');
  s.players.human.damage = [c('S', 5), c('C', 4), c('S', 9)];
  s.table.attack = [c('H', 10)];
  s.table.defense = [c('D', 1)];
  Rules.resolveTurn(s, {});
  // melhor soma < 10: 9 (S9) ou 5+4 = 9 → remove 9 pontos
  assert.strictEqual(Rules.total(s.players.human.damage), 9);
});

test('copas não supera nenhuma carta de dano: nada removido', () => {
  const s = baseState('ai');
  s.players.human.damage = [c('S', 8)];
  s.table.attack = [c('D', 2)];
  s.table.defense = [c('H', 8)];
  Rules.resolveTurn(s, {});
  assert.strictEqual(Rules.total(s.players.human.damage), 8);
});

test('copas cura dano recebido na mesma rodada', () => {
  const s = baseState('ai');
  s.table.attack = [c('S', 6)];
  s.table.defense = [c('H', 7)];
  Rules.resolveTurn(s, {});
  assert.strictEqual(s.players.human.damage.length, 0);
});

test('duas copas somadas removem a maior carta de dano ≤ soma', () => {
  const s = baseState('human');
  s.players.human.damage = [c('S', 9), c('C', 3)];
  s.table.attack = [c('H', 4), c('H', 6)];
  s.table.defense = [c('D', 1)];
  Rules.resolveTurn(s, {});
  // individual: 4♥ remove 3♣ (3); somadas (10) removem 9♠ (9) → escolhe a soma
  assert.deepStrictEqual(ids(s.players.human.damage), ['C3']);
});

test('soma de copas igual ao valor da carta de dano também remove', () => {
  const s = baseState('ai');
  s.players.human.damage = [c('S', 9)];
  s.table.attack = [c('D', 2)];
  s.table.defense = [c('H', 4), c('H', 5)];
  Rules.resolveTurn(s, {});
  assert.strictEqual(s.players.human.damage.length, 0);
});

test('duas copas removem apenas a maior carta elegível', () => {
  const plan = Rules.planHeal([c('H', 5), c('H', 5)], [c('S', 7), c('S', 8), c('S', 12)]);
  assert.ok(plan.combined);
  assert.deepStrictEqual(ids(plan.removed), ['S8']);
});

test('duas copas usam a cura individual quando ela remove mais', () => {
  const plan = Rules.planHeal([c('H', 12), c('H', 13)], [c('S', 5), c('S', 6), c('C', 11)]);
  // individual: 12♥ remove 11 e 13♥ remove 5+6 = 22 > soma (remove 11)
  assert.ok(!plan.combined);
  assert.strictEqual(Rules.total(plan.removed), 22);
});

test('bestHeal maximiza o total removido', () => {
  const healed = Rules.bestHeal([c('S', 6), c('S', 5), c('C', 3), c('C', 2)], 12);
  assert.strictEqual(Rules.total(healed), 11);
});

test('bestAssignment soma ouros quando necessário', () => {
  const map = Rules.bestAssignment([c('S', 11)], [c('D', 6), c('D', 5)]);
  assert.deepStrictEqual(map.S11.sort(), ['D5', 'D6']);
});

test('vitória ao atingir 30 de dano', () => {
  const s = baseState('human');
  s.players.ai.damage = [c('S', 13), c('S', 12), c('C', 5)];
  s.deck = [c('H', 1), c('H', 2)];
  Rules.endTurn(s);
  assert.ok(s.over);
  assert.strictEqual(s.winner, 'human');
  assert.strictEqual(s.reason, 'damage');
});

test('monte vazio e mão incompleta: vence quem sofreu menos dano', () => {
  const s = baseState('human');
  s.players.human.hand = [c('H', 1), c('H', 2), c('H', 3), c('H', 4), c('H', 5)];
  s.players.ai.hand = [c('D', 1), c('D', 2), c('D', 3), c('D', 4), c('D', 5), c('D', 6)];
  s.deck = [c('S', 1)];
  s.players.human.damage = [c('S', 10)];
  s.players.ai.damage = [c('S', 4)];
  Rules.endTurn(s);
  assert.ok(s.over);
  assert.strictEqual(s.reason, 'deck');
  assert.strictEqual(s.winner, 'ai');
});

test('endTurn completa as mãos e alterna o atacante', () => {
  const s = Rules.newGame();
  Rules.playCards(s, 'human', [s.players.human.hand[0].id], 'attack');
  Rules.playCards(s, 'ai', [s.players.ai.hand[0].id, s.players.ai.hand[1].id], 'defense');
  const before = s.attacker;
  Rules.resolveTurn(s, {});
  Rules.endTurn(s);
  assert.strictEqual(s.players.human.hand.length, 7);
  assert.strictEqual(s.players.ai.hand.length, 7);
  assert.strictEqual(s.attacker, Rules.other(before));
});

test('partidas simuladas IA x IA terminam e conservam as 52 cartas', () => {
  for (let g = 0; g < 300; g++) {
    const s = Rules.newGame();
    let guard = 0;
    while (!s.over && guard++ < 100) {
      const att = s.attacker, def = Rules.other(att);
      Rules.playCards(s, att, AI.chooseAttack(s, att), 'attack');
      Rules.playCards(s, def, AI.chooseDefense(s, def), 'defense');
      const cl = Rules.getClashes(s);
      Rules.resolveTurn(s, {
        defense: AI.chooseBlocks(cl.defense.threats, cl.defense.blockers),
        attack: AI.chooseBlocks(cl.attack.threats, cl.attack.blockers)
      });
      Rules.endTurn(s);
      const count = s.deck.length + s.discard.length +
        ['human', 'ai'].reduce((n, p) => n + s.players[p].hand.length + s.players[p].damage.length, 0);
      assert.strictEqual(count, 52);
    }
    assert.ok(s.over, 'partida não terminou');
    assert.ok(['human', 'ai', 'draw'].includes(s.winner));
  }
});

console.log(passed + ' testes passaram.');
