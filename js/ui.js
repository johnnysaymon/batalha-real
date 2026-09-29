/* Batalha Real — renderização e interação com o jogador */
(function (root) {
  'use strict';

  const Deck = root.BR.Deck;
  const Rules = root.BR.Rules;
  const $ = function (id) { return document.getElementById(id); };

  let selection = [];
  let pendingPlay = null; // { mode, resolve }

  function cardEl(card, opts) {
    opts = opts || {};
    const el = document.createElement('div');
    if (opts.back) {
      el.className = 'card back';
      return el;
    }
    const info = Deck.SUIT_INFO[card.suit];
    el.className = 'card ' + info.color;
    el.dataset.id = card.id;
    el.title = Deck.cardLabel(card) + ' — ' + info.name + ' (' + info.role + ')';
    const rank = Deck.rankLabel(card.value);
    el.innerHTML =
      '<span class="corner">' + rank + '<br>' + info.symbol + '</span>' +
      '<span class="center">' + info.symbol + '</span>' +
      '<span class="corner bottom">' + rank + '<br>' + info.symbol + '</span>' +
      '<span class="role-tag">' + info.role + '</span>';
    return el;
  }

  function sortHand(hand) {
    const order = { S: 0, C: 1, D: 2, H: 3 };
    return hand.slice().sort(function (a, b) { return (order[a.suit] - order[b.suit]) || (a.value - b.value); });
  }

  function renderHuman(state) {
    const container = $('hand-human');
    container.innerHTML = '';
    sortHand(state.players.human.hand).forEach(function (card) {
      const el = cardEl(card);
      if (pendingPlay) {
        el.classList.add('selectable');
        if (selection.indexOf(card.id) >= 0) el.classList.add('selected');
        el.addEventListener('click', function () { toggleSelect(card.id, state); });
      }
      container.appendChild(el);
    });
  }

  function renderDamage(state, id) {
    const container = $('damage-' + id);
    container.innerHTML = '';
    state.players[id].damage.forEach(function (card) { container.appendChild(cardEl(card)); });
    const dmg = Rules.total(state.players[id].damage);
    $('dmg-' + id).textContent = dmg;
    $('meter-' + id).style.width = Math.min(100, dmg / Rules.DAMAGE_TO_WIN * 100) + '%';
  }

  function renderTable(state) {
    const attacker = state.attacker;
    const defender = Rules.other(attacker);
    $('label-attack').textContent = 'Ataque — ' + Rules.NAMES[attacker];
    $('label-defense').textContent = 'Defesa — ' + Rules.NAMES[defender];

    const atk = $('slot-attack');
    atk.innerHTML = '';
    state.table.attack.forEach(function (card) {
      let el;
      if (state.revealed) {
        el = cardEl(card);
        el.classList.add('flip');
      } else if (attacker === 'human') {
        el = cardEl(card);
        el.classList.add('face-down-own');
      } else {
        el = cardEl(card, { back: true });
      }
      atk.appendChild(el);
    });

    const def = $('slot-defense');
    def.innerHTML = '';
    state.table.defense.forEach(function (card) { def.appendChild(cardEl(card)); });

    ['human', 'ai'].forEach(function (id) {
      const role = $('role-' + id);
      const isAtk = id === attacker;
      role.textContent = state.over ? '' : (isAtk ? 'Atacante' : 'Defensor');
      role.className = 'role ' + (state.over ? '' : (isAtk ? 'attacker' : 'defender'));
    });
  }

  function render(state) {
    const aiHand = $('hand-ai');
    aiHand.innerHTML = '';
    state.players.ai.hand.forEach(function () { aiHand.appendChild(cardEl(null, { back: true })); });
    renderHuman(state);
    renderDamage(state, 'human');
    renderDamage(state, 'ai');
    renderTable(state);

    $('deck-count').textContent = state.deck.length;
    $('deck-pile').style.visibility = state.deck.length ? 'visible' : 'hidden';
    $('discard-count').textContent = state.discard.length;
    const discard = $('discard-pile');
    discard.innerHTML = '';
    if (state.discard.length) discard.appendChild(cardEl(state.discard[state.discard.length - 1]));

    $('area-human').classList.toggle('active', !!pendingPlay);
    updatePlayButton();
  }

  function toggleSelect(id, state) {
    const idx = selection.indexOf(id);
    if (idx >= 0) selection.splice(idx, 1);
    else if (selection.length < Rules.MAX_PLAY) selection.push(id);
    else selection = [selection[1], id];
    renderHuman(state);
    updatePlayButton();
  }

  function updatePlayButton() {
    const btn = $('btn-play');
    if (!pendingPlay) {
      btn.disabled = true;
      btn.textContent = 'Jogar';
      return;
    }
    const n = selection.length;
    btn.disabled = n < 1;
    btn.textContent = (pendingPlay.mode === 'attack' ? 'Atacar' : 'Defender') + (n ? ' (' + n + ')' : '');
  }

  // Aguarda o jogador escolher 1 ou 2 cartas
  function askPlay(state, mode) {
    selection = [];
    return new Promise(function (resolve) {
      pendingPlay = { mode: mode, resolve: resolve };
      render(state);
    });
  }

  function confirmPlay() {
    if (!pendingPlay || !selection.length) return;
    const p = pendingPlay;
    const chosen = selection.slice();
    pendingPlay = null;
    selection = [];
    p.resolve(chosen);
  }

  function cancelPending() {
    pendingPlay = null;
    selection = [];
    $('block-panel').classList.add('hidden');
    closeAllModals();
  }

  // Painel para o jogador distribuir seus ouros entre as ameaças
  function askBlocks(threats, blockers, suggestion, context) {
    const panel = $('block-panel');
    const rows = $('block-rows');
    $('block-title').textContent = context === 'defense'
      ? 'Defenda-se das espadas da máquina'
      : 'Proteja-se do contra-ataque (paus) da máquina';
    $('block-hint').textContent = 'Escolha o que cada ouro bloqueia. Você pode somar dois ouros contra a mesma carta. Empate favorece o ouro.';
    rows.innerHTML = '';

    const assigned = {};
    Object.keys(suggestion).forEach(function (tid) {
      suggestion[tid].forEach(function (bid) { assigned[bid] = tid; });
    });

    const summary = document.createElement('div');
    summary.className = 'block-summary';

    function updateSummary() {
      summary.innerHTML = threats.map(function (t) {
        const sum = blockers.reduce(function (s, b) { return s + (assigned[b.id] === t.id ? b.value : 0); }, 0);
        const ok = sum >= t.value;
        return Deck.cardLabel(t) + ': ' + (sum ? 'ouros ' + sum + ' → ' : 'sem bloqueio → ') +
          '<span class="' + (ok ? 'ok">bloqueada' : 'fail">' + t.value + ' de dano') + '</span>';
      }).join(' &nbsp;·&nbsp; ');
    }

    blockers.forEach(function (b) {
      const row = document.createElement('div');
      row.className = 'block-row';
      row.appendChild(cardEl(b));
      const select = document.createElement('select');
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'Não usar';
      select.appendChild(none);
      threats.forEach(function (t) {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = 'Bloquear ' + Deck.cardLabel(t);
        select.appendChild(opt);
      });
      select.value = assigned[b.id] || '';
      select.addEventListener('change', function () {
        if (select.value) assigned[b.id] = select.value;
        else delete assigned[b.id];
        updateSummary();
      });
      row.appendChild(select);
      rows.appendChild(row);
    });
    rows.appendChild(summary);
    updateSummary();
    panel.classList.remove('hidden');

    return new Promise(function (resolve) {
      $('btn-block').onclick = function () {
        panel.classList.add('hidden');
        const map = {};
        Object.keys(assigned).forEach(function (bid) {
          (map[assigned[bid]] = map[assigned[bid]] || []).push(bid);
        });
        resolve(map);
      };
    });
  }

  function setStatus(text) {
    $('status').textContent = text;
  }

  function log(text, type) {
    const li = document.createElement('li');
    li.textContent = text;
    if (type) li.className = type;
    const list = $('log');
    list.insertBefore(li, list.firstChild);
  }

  function clearLog() {
    $('log').innerHTML = '';
  }

  // Pilha de modais: abrir as regras sobre outro modal não perde o anterior
  const modalStack = [];

  function paintModal(entry) {
    $('modal-title').textContent = entry.title;
    const content = $('modal-body');
    content.innerHTML = '';
    if (typeof entry.body === 'string') content.innerHTML = entry.body;
    else content.appendChild(entry.body);
    $('modal-ok').textContent = entry.okText || 'OK';
    $('modal').classList.remove('hidden');
  }

  function showModal(title, body, okText) {
    return new Promise(function (resolve) {
      const entry = { title: title, body: body, okText: okText, resolve: resolve };
      modalStack.push(entry);
      paintModal(entry);
    });
  }

  function hideModal() {
    const entry = modalStack.pop();
    if (modalStack.length) paintModal(modalStack[modalStack.length - 1]);
    else $('modal').classList.add('hidden');
    if (entry) entry.resolve();
  }

  function closeAllModals() {
    while (modalStack.length) hideModal();
  }

  function showRules() {
    const node = $('rules-template').content.cloneNode(true);
    showModal('Regras da Batalha Real', node, 'Entendi');
  }

  function revealNode(reveal, starter) {
    const wrap = document.createElement('div');
    const cards = document.createElement('div');
    cards.className = 'reveal';
    [['human', 'Você'], ['ai', 'Máquina']].forEach(function (p) {
      const fig = document.createElement('figure');
      fig.appendChild(cardEl(reveal[p[0]]));
      const cap = document.createElement('figcaption');
      cap.textContent = p[1];
      fig.appendChild(cap);
      cards.appendChild(fig);
    });
    wrap.appendChild(cards);
    const p = document.createElement('p');
    p.textContent = starter === 'human'
      ? 'Sua carta é maior: você começa como atacante!'
      : 'A carta da máquina é maior: ela começa atacando.';
    wrap.appendChild(p);
    return wrap;
  }

  function init(handlers) {
    $('btn-play').addEventListener('click', confirmPlay);
    $('modal-ok').addEventListener('click', hideModal);
    $('btn-rules').addEventListener('click', showRules);
    $('btn-new').addEventListener('click', handlers.onNewGame);
  }

  root.BR = root.BR || {};
  root.BR.UI = {
    init: init,
    render: render,
    askPlay: askPlay,
    askBlocks: askBlocks,
    cancelPending: cancelPending,
    setStatus: setStatus,
    log: log,
    clearLog: clearLog,
    showModal: showModal,
    revealNode: revealNode
  };
})(window);
