/* Batalha Real — renderização e interação com o jogador */
(function (root) {
  'use strict';

  const Deck = root.BR.Deck;
  const Rules = root.BR.Rules;
  const $ = function (id) { return document.getElementById(id); };

  let selection = [];
  let pendingPlay = null; // { mode, resolve }
  let current = null;     // último estado renderizado

  const ANIM_MS = 480;
  const reduceMotion = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Elementos persistentes das cartas em jogo (id -> elemento). Cada carta tem
  // um único elemento que é movido entre as áreas, em vez de ser recriado.
  const elements = new Map();

  function fillFront(el, card) {
    if (el.dataset.filled) return;
    const info = Deck.SUIT_INFO[card.suit];
    const rank = Deck.rankLabel(card.value);
    el.classList.add(info.color);
    el.title = Deck.cardLabel(card) + ' — ' + info.name + ' (' + info.role + ')';
    el.querySelector('.front').innerHTML =
      '<span class="corner">' + rank + '<br>' + info.symbol + '</span>' +
      '<span class="center">' + info.symbol + '</span>' +
      '<span class="corner bottom">' + rank + '<br>' + info.symbol + '</span>' +
      '<span class="role-tag">' + info.role + '</span>';
    el.dataset.filled = '1';
  }

  function makeCardEl(card, faceUp) {
    const el = document.createElement('div');
    el.className = 'card' + (faceUp ? '' : ' face-down');
    el.innerHTML = '<div class="card-inner"><div class="face front"></div><div class="face back"></div></div>';
    // A face só é preenchida quando a carta é revelada, para não expor as cartas da máquina
    if (faceUp) fillFront(el, card);
    return el;
  }

  // Carta avulsa (modais e painel de bloqueio), fora da mesa
  function cardEl(card) {
    return makeCardEl(card, true);
  }

  function trackedCard(card) {
    let el = elements.get(card.id);
    if (!el) {
      el = makeCardEl(card, false);
      el.addEventListener('click', function () { onCardClick(card.id); });
      elements.set(card.id, el);
    }
    return el;
  }

  function sortHand(hand) {
    const order = { S: 0, C: 1, D: 2, H: 3 };
    return hand.slice().sort(function (a, b) { return (order[a.suit] - order[b.suit]) || (a.value - b.value); });
  }

  // Onde cada carta deve estar e se fica virada para cima
  function layout(state) {
    const humanAttacking = state.attacker === 'human';
    return [
      { box: $('hand-ai'), cards: state.players.ai.hand, faceUp: false },
      { box: $('hand-human'), cards: sortHand(state.players.human.hand), faceUp: true },
      { box: $('damage-ai'), cards: state.players.ai.damage, faceUp: true },
      { box: $('damage-human'), cards: state.players.human.damage, faceUp: true },
      { box: $('slot-attack'), cards: state.table.attack, faceUp: state.revealed || humanAttacking, ownHidden: humanAttacking && !state.revealed },
      { box: $('slot-defense'), cards: state.table.defense, faceUp: true },
      { box: $('discard-pile'), cards: state.discard, faceUp: true }
    ];
  }

  // Técnica FLIP: mede posições antes e depois de mover e anima a diferença
  function placeCards(state) {
    const first = new Map();
    elements.forEach(function (el, id) {
      if (el.isConnected) first.set(id, el.getBoundingClientRect());
    });

    elements.forEach(function (el) {
      el.getAnimations().forEach(function (a) { a.cancel(); });
    });

    const seen = new Set();
    layout(state).forEach(function (zone) {
      zone.cards.forEach(function (card, i) {
        const el = trackedCard(card);
        seen.add(card.id);
        if (zone.faceUp) fillFront(el, card);
        el.classList.toggle('face-down', !zone.faceUp);
        el.classList.toggle('face-down-own', !!zone.ownHidden);
        if (zone.box.children[i] !== el) zone.box.insertBefore(el, zone.box.children[i] || null);
      });
    });

    elements.forEach(function (el, id) {
      if (!seen.has(id)) {
        el.remove();
        elements.delete(id);
      }
    });

    if (reduceMotion) return;
    const deckRect = $('deck-pile').getBoundingClientRect();
    let dealt = 0;
    elements.forEach(function (el, id) {
      const last = el.getBoundingClientRect();
      const isNew = !first.has(id);
      const from = isNew ? deckRect : first.get(id);
      if (!last.width || !from.width) return;
      const dx = from.left - last.left;
      const dy = from.top - last.top;
      const sx = from.width / last.width;
      const sy = from.height / last.height;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01) return;
      el.animate([
        { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', zIndex: 5 },
        { transform: 'none', zIndex: 5 }
      ], {
        duration: ANIM_MS,
        easing: 'cubic-bezier(.2,.75,.25,1)',
        delay: isNew ? (dealt++) * 60 : 0,
        fill: 'backwards'
      });
    });
  }

  function updateSelection() {
    const inHand = current ? current.players.human.hand.map(function (c) { return c.id; }) : [];
    elements.forEach(function (el, id) {
      const selectable = !!pendingPlay && inHand.indexOf(id) >= 0;
      el.classList.toggle('selectable', selectable);
      el.classList.toggle('selected', selectable && selection.indexOf(id) >= 0);
    });
  }

  function setText(id, text) {
    const el = $(id);
    if (el.textContent !== String(text)) el.textContent = text;
  }

  function render(state) {
    current = state;
    placeCards(state);
    updateSelection();

    ['human', 'ai'].forEach(function (id) {
      const dmg = Rules.total(state.players[id].damage);
      setText('dmg-' + id, dmg);
      $('meter-' + id).style.width = Math.min(100, dmg / Rules.DAMAGE_TO_WIN * 100) + '%';
      const role = $('role-' + id);
      const isAtk = id === state.attacker;
      setText('role-' + id, state.over ? '' : (isAtk ? 'Atacante' : 'Defensor'));
      role.className = 'role ' + (state.over ? '' : (isAtk ? 'attacker' : 'defender'));
    });

    setText('label-attack', 'Ataque — ' + Rules.NAMES[state.attacker]);
    setText('label-defense', 'Defesa — ' + Rules.NAMES[Rules.other(state.attacker)]);
    setText('deck-count', state.deck.length);
    $('deck-pile').style.visibility = state.deck.length ? 'visible' : 'hidden';
    setText('discard-count', state.discard.length);

    $('area-human').classList.toggle('active', !!pendingPlay);
    updatePlayButton();
  }

  function onCardClick(id) {
    if (!pendingPlay || !current) return;
    if (!current.players.human.hand.some(function (c) { return c.id === id; })) return;
    const idx = selection.indexOf(id);
    if (idx >= 0) selection.splice(idx, 1);
    else if (selection.length < Rules.MAX_PLAY) selection.push(id);
    else selection = [selection[1], id];
    updateSelection();
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
    updateSelection();
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
