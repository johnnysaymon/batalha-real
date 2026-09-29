# Batalha Real

Jogo de cartas para navegador feito apenas com HTML, CSS e JavaScript — você contra a máquina.

## Como jogar

Abra `index.html` em qualquer navegador moderno (não precisa de servidor nem de instalação).

## Regras

Objetivo: fazer o adversário acumular **30 pontos de dano**.

| Naipe | Função |
|-------|--------|
| ♠ Espadas | Ataque |
| ♣ Paus | Contra-ataque |
| ♦ Ouros | Defesa |
| ♥ Copas | Recuperação |

Baralho de 52 cartas. Valores: A=1, 2–10, J=11, Q=12, K=13. O dano de um jogador é a soma das cartas na sua área de dano.

**Início:** cada jogador puxa 7 cartas e revela a última puxada. A maior começa como atacante; em empate de número decide o naipe (♠ > ♣ > ♦ > ♥).

**Rodada:**
1. O atacante coloca 1 ou 2 cartas viradas para baixo.
2. O defensor coloca 1 ou 2 cartas viradas para cima.
3. As cartas do atacante são reveladas. Quem tem ouros escolhe o que cada ouro bloqueia, podendo somar dois ouros contra a mesma carta.
4. Resolução:
   - ♠ do atacante x ♦ do defensor: se a espada for maior, vai para a área de dano do defensor (ouros descartados); senão todas são descartadas. Espada sem bloqueio causa dano direto.
   - ♣ do defensor x ♦ do atacante: mesma regra; paus maior vai para a área de dano do atacante. Paus sem bloqueio causa dano direto.
   - ♣ usado pelo atacante e ♠ usado pelo defensor são descartados.
   - ♥ Copas (aplicada após o combate): sem dano, é descartada; com dano, remove da sua área de dano as cartas cuja soma seja menor que o valor da copas.
5. Cada jogador completa a mão até 7 cartas (atacante primeiro) e os papéis se invertem.

**Fim:** vence quem causar 30 de dano primeiro. Se o monte acabar e algum jogador não tiver 7 cartas, vence quem sofreu menos dano (igualdade = empate).

## Estrutura

```
index.html        página do jogo
css/style.css     visual da mesa e das cartas
js/deck.js        baralho, embaralhamento e comparação de cartas
js/rules.js       regras (lógica pura, sem DOM)
js/ai.js          decisões da máquina
js/ui.js          renderização e interação
js/game.js        fluxo da partida
tests/            testes das regras
```

## Testes

```
node tests/rules.test.js
```
