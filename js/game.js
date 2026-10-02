/* Batalha Real — fluxo da partida */
(function (root) {
  'use strict';

  const Deck = root.BR.Deck;
  const Rules = root.BR.Rules;
  const AI = root.BR.AI;
  const UI = root.BR.UI;

  const DELAY = 900;
  let state = null;
  let gameId = 0;

  function wait(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function logEvents(events) {
    events.forEach(function (e) { UI.log(e.text, e.type); });
  }

  function describe(cards) {
    return cards.map(Deck.cardLabel).join(' e ');
  }

  async function playTurn(id) {
    const attacker = state.attacker;
    const defender = Rules.other(attacker);
    const alive = function () { return id === gameId; };

    UI.log('Rodada ' + state.turn + ' — ' + Rules.NAMES[attacker] + ' ataca', 'turn');

    // 1. Atacante joga cartas viradas para baixo
    let ids;
    if (attacker === 'human') {
      UI.setStatus('Você é o atacante: escolha 1 ou 2 cartas (ficarão viradas para baixo).');
      ids = await UI.askPlay(state, 'attack');
    } else {
      UI.setStatus('A máquina está escolhendo seu ataque…');
      UI.render(state);
      await wait(DELAY);
      ids = AI.chooseAttack(state, 'ai');
    }
    if (!alive()) return;
    Rules.playCards(state, attacker, ids, 'attack');
    UI.log(Rules.NAMES[attacker] + ' colocou ' + ids.length + (ids.length > 1 ? ' cartas' : ' carta') + ' virada(s) para baixo.');
    UI.render(state);

    // 2. Defensor joga cartas viradas para cima
    if (defender === 'human') {
      UI.setStatus('Você é o defensor: escolha 1 ou 2 cartas (viradas para cima).');
      ids = await UI.askPlay(state, 'defense');
    } else {
      UI.setStatus('A máquina está escolhendo sua defesa…');
      await wait(DELAY);
      ids = AI.chooseDefense(state, 'ai');
    }
    if (!alive()) return;
    const defenseCards = Rules.playCards(state, defender, ids, 'defense');
    UI.log(Rules.NAMES[defender] + ' defendeu com ' + describe(defenseCards) + '.');
    UI.render(state);
    await wait(DELAY / 2);
    if (!alive()) return;

    // 3. Revela o ataque
    state.revealed = true;
    UI.setStatus('Cartas do atacante reveladas!');
    UI.log('Ataque revelado: ' + describe(state.table.attack) + '.');
    UI.render(state);
    await wait(DELAY);
    if (!alive()) return;

    // 4. Distribuição dos ouros
    const clashes = Rules.getClashes(state);
    const blocks = {};
    const steps = [['defense', defender], ['attack', attacker]];
    for (let i = 0; i < steps.length; i++) {
      const key = steps[i][0];
      const owner = steps[i][1];
      const clash = clashes[key];
      if (!clash.threats.length || !clash.blockers.length) continue;
      const suggestion = Rules.bestAssignment(clash.threats, clash.blockers);
      if (owner === 'human') {
        UI.setStatus('Escolha como usar seus ouros.');
        blocks[key] = await UI.askBlocks(clash.threats, clash.blockers, suggestion, key);
        if (!alive()) return;
      } else {
        blocks[key] = AI.chooseBlocks(clash.threats, clash.blockers);
      }
    }

    // 5. Resolução
    UI.setStatus('Resolvendo a rodada…');
    logEvents(Rules.resolveTurn(state, blocks));
    UI.render(state);
    await wait(DELAY);
    if (!alive()) return;

    // 6. Compra e troca de papéis
    logEvents(Rules.endTurn(state));
    UI.render(state);
  }

  async function run(id) {
    while (!state.over) {
      await playTurn(id);
      if (id !== gameId) return;
    }
    const h = Rules.total(state.players.human.damage);
    const a = Rules.total(state.players.ai.damage);
    const reason = state.reason === 'damage'
      ? (h >= Rules.DAMAGE_TO_WIN && a >= Rules.DAMAGE_TO_WIN
        ? 'Os dois jogadores atingiram ' + Rules.DAMAGE_TO_WIN + ' pontos de dano.'
        : (h >= Rules.DAMAGE_TO_WIN ? 'Você' : 'A máquina') + ' sofreu ' + Rules.DAMAGE_TO_WIN + ' ou mais pontos de dano.')
      : 'O monte acabou e não foi possível completar as mãos.';
    const title = state.winner === 'human' ? 'Vitória!' : (state.winner === 'ai' ? 'Derrota' : 'Empate');
    UI.setStatus(title + ' — Você sofreu ' + h + ', a máquina sofreu ' + a + '.');
    UI.log(title + ' ' + reason, 'end');
    UI.render(state);
    await UI.showModal(title,
      '<p>' + reason + '</p><p>Dano sofrido — Você: <strong>' + h + '</strong> · Máquina: <strong>' + a + '</strong></p>',
      'Jogar novamente');
    if (id === gameId) newGame();
  }

  async function newGame() {
    const id = ++gameId;
    UI.cancelPending();
    UI.clearLog();
    state = Rules.newGame();
    UI.setStatus('');
    UI.render(state);
    const reveal = state.initialReveal;
    UI.log('Cartas reveladas: Você ' + Deck.cardLabel(reveal.human) + ' x Máquina ' + Deck.cardLabel(reveal.ai) + '.');
    await UI.showModal('Quem começa?', UI.revealNode(reveal, state.attacker), 'Começar');
    if (id !== gameId) return;
    run(id);
  }

  UI.init({ onNewGame: newGame });
  newGame();

  root.BR.Game = { getState: function () { return state; }, newGame: newGame };
})(window);
