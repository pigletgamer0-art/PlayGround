'use strict';
/* Gameplay: movement, quests, dialogue, combat and interactions */
const PETER = NPCS.find(n => n.id === 'peter');
const JESSICA = NPCS.find(n => n.id === 'jessica');
const LUKE = NPCS.find(n => n.id === 'luke');
const DELI = NPCS.find(n => n.id === 'deli');
const AGENT = NPCS.find(n => n.id === 'agent');
const DOOR = { x: tpx(59.5), y: tpx(44.2) };
const CLUES = [{ x: tpx(11.5), y: tpx(20.5) }, { x: tpx(46.5), y: tpx(43.5) }, { x: tpx(63.5), y: tpx(29.5) }];
let nearby = null;
let dialogOpen = false;
let hudTick = 0;
let respawning = false;

/* ------------- dialogue ------------- */
function showDialog(speaker, badge, text, choices) {
  dialogOpen = true;
  $('#dialogue').classList.remove('hidden');
  $('#speaker').textContent = speaker;
  $('#speakerBadge').textContent = badge;
  $('#dialogText').textContent = text;
  const box = $('#choices'); box.innerHTML = '';
  for (const ch of choices) {
    const b = document.createElement('button');
    b.className = 'choice';
    b.innerHTML = ch.label + (ch.note ? '<small>' + ch.note + '</small>' : '');
    b.addEventListener('click', () => { sfx('ui'); closeDialogue(); if (ch.action) ch.action(); });
    box.appendChild(b);
  }
  player.moving = false;
}
function closeDialogue() { dialogOpen = false; $('#dialogue').classList.add('hidden'); }

/* ------------- quests ------------- */
function addXp(n) {
  state.xp += n;
  while (state.xp >= xpNeed()) {
    state.xp -= xpNeed();
    state.level++;
    state.maxHp += 8; state.maxSt += 6;
    state.hp = state.maxHp; state.st = state.maxSt;
    sfx('level');
    notify('NIVEL ' + state.level + ' · Tus habilidades han mejorado.', 'good');
  }
  saveGame();
}

function questInfo() {
  if (state.quest === 0) return { title: 'Un extraño en Queens', desc: 'Encuentra a Peter Parker cerca del centro comunitario.' };
  if (state.quest === 1) return { title: 'Rastro anómalo', desc: 'Investiga la puerta sur del centro comunitario.' };
  if (state.quest === 2) return { title: 'Rastro anómalo', desc: `Derrota a los intrusos (${state.questKills}/3).` };
  if (state.quest === 3) return { title: 'Rastro anómalo', desc: 'Informa a Peter Parker de lo ocurrido.' };
  return { title: 'Queens bajo vigilancia', desc: 'Explora el distrito. Jessica Jones y Luke Cage tienen trabajo para ti.' };
}

function activeTarget() {
  if (state.quest <= 1) return { x: PETER.x, y: PETER.y, label: 'Peter Parker' };
  if (state.quest === 2 || state.quest === 3) return state.quest === 2 ? { x: DOOR.x, y: DOOR.y, label: 'Centro comunitario' } : { x: PETER.x, y: PETER.y, label: 'Peter Parker' };
  if (state.quest >= 4) {
    if (state.jessica === 1) { const c = CLUES[state.jessicaClues] || CLUES[2]; return { x: c.x, y: c.y, label: 'Pista' }; }
    if (state.jessica === 2) return { x: JESSICA.x, y: JESSICA.y, label: 'Jessica Jones' };
    if (state.luke === 0) return { x: LUKE.x, y: LUKE.y, label: 'Luke Cage' };
  }
  return null;
}

function updateQuestText() {
  const q = questInfo();
  $('#questTitle').textContent = q.title;
  $('#questDesc').textContent = q.desc;
  $('#questKicker').textContent = state.quest >= 4 ? 'MISIÓN SECUNDARIA' : 'MISIÓN PRINCIPAL';
  const t = activeTarget();
  if (t) {
    const d = Math.round(dist(player.x, player.y, t.x, t.y) / 32);
    $('#questDist').textContent = t.label.toUpperCase() + ' · ' + d + ' m';
  } else $('#questDist').textContent = 'EXPLORACIÓN LIBRE · QUEENS';
}

/* ------------- NPC conversations ------------- */
function peterTalk() {
  if (state.quest === 0) {
    showDialog('PETER PARKER', 'PP', 'Eres tú. Bien. Anoche alguien forzó la puerta del centro comunitario y dejó un rastro que no es humano. Necesito ojos extra, no otra víctima. ¿Me cubres?', [
      { label: 'Voy a investigar.', note: '+50 XP · MISIÓN PRINCIPAL', action: () => { state.quest = 1; addXp(50); notify('Nueva misión: Rastro anómalo.', 'gold'); saveGame(); } },
      { label: '¿Por qué yo?', action: () => showDialog('PETER PARKER', 'PP', 'Porque apareciste justo cuando la ciudad empezó a moverse raro. En Queens no creemos en coincidencias. Piénsalo y vuelve.', [{ label: 'Entendido.' }]) },
      { label: 'Ahora no.', action: null }
    ]);
  } else if (state.quest === 1) {
    showDialog('PETER PARKER', 'PP', 'El centro está al este, cruzando la calle. Busca la puerta sur con la marca amarilla. No entres sin estar listo.', [
      { label: 'Voy para allá.' }, { label: '¿Y si hay más de uno?', action: () => showDialog('PETER PARKER', 'PP', 'Entonces golpea rápido y no te quedes quieto. Yo vigilo desde la azotea.', [{ label: 'Bien.' }]) }
    ]);
  } else if (state.quest === 2) {
    showDialog('PETER PARKER', 'PP', 'Los sensores siguen activos dentro del centro. Encárgate de los intrusos y sal de ahí.', [{ label: 'En camino.' }]);
  } else if (state.quest === 3) {
    showDialog('PETER PARKER', 'PP', 'Lo vi todo desde arriba. No eres un aficionado. Toma esto: contactos, algo de efectivo y un botiquín. Queens te debe una.', [
      { label: 'Aceptar recompensa.', note: '+150 créditos · +80 XP · BOTIQUÍN', action: () => {
        state.quest = 4; state.credits += 150; state.medkits++; addXp(80);
        notify('Misión completada: Rastro anómalo. +$150', 'good');
        saveGame();
        setTimeout(() => notify('Jessica Jones te busca cerca del parque.', 'gold'), 900);
      } },
      { label: 'Guárdate el dinero.', action: () => { state.quest = 4; addXp(110); state.credits += 40; notify('Tu reputación en Queens ha subido.', 'good'); saveGame(); } }
    ]);
  } else {
    showDialog('PETER PARKER', 'PP', 'La ciudad no se arregla en una noche. Jessica sigue investigando desapariciones y Luke anda buscando sparrings. Yo tengo que volver a la azotea.', [
      { label: 'Nos vemos.' }, { label: '¿Sabes algo de Kingpin?', action: () => showDialog('PETER PARKER', 'PP', 'Solo rumores. Y en esta ciudad los rumores muerden. Si ves algo raro, avísame.', [{ label: 'Lo haré.' }]) }
    ]);
  }
}

function jessicaTalk() {
  if (state.jessica === 0) {
    showDialog('JESSICA JONES', 'JJ', 'Tres personas desaparecieron cerca del parque. La policía dice que se marcharon por voluntad propia. Miente. Encontré rastros en tres puntos del barrio, pero no puedo cubrirlos todos.', [
      { label: 'Los busco yo.', note: 'MISIÓN SECUNDARIA · 3 PISTAS', action: () => { state.jessica = 1; state.jessicaClues = 0; addXp(25); notify('Nueva misión: Las desaparecidas.', 'gold'); saveGame(); } },
      { label: '¿Qué clase de rastros?', action: () => showDialog('JESSICA JONES', 'JJ', 'Marcas de arrastre, ceniza fría y un olor a ozono. No es un secuestro normal. Si encuentras algo, no lo toques con las manos desnudas.', [{ label: 'Vale.' }]) },
      { label: 'Hoy no.', action: null }
    ]);
  } else if (state.jessica === 1) {
    const left = 3 - state.jessicaClues;
    showDialog('JESSICA JONES', 'JJ', left > 0 ? `Te faltan ${left} pista${left === 1 ? '' : 's'}. Los puntos están marcados en tu mapa. Muévete antes de que alguien más limpie la escena.` : 'Tienes las tres pistas. Vuelve a hablar conmigo.', [{ label: 'En camino.' }]);
  } else if (state.jessica === 2) {
    showDialog('JESSICA JONES', 'JJ', 'Con esto puedo tirar del hilo. No sé quién está detrás, pero sé que no es la primera vez. Toma tu parte y no te metas en lo que no puedas terminar.', [
      { label: 'Aceptar $120.', note: '+120 créditos · +70 XP', action: () => { state.jessica = 3; state.credits += 120; addXp(70); notify('Misión completada: Las desaparecidas. +$120', 'good'); saveGame(); } }
    ]);
  } else {
    showDialog('JESSICA JONES', 'JJ', 'Todavía estoy revisando los archivos. Cuando tenga un nombre, serás el primero en saberlo. O el segundo, si el primero está muerto.', [{ label: 'Qué tranquilizador.' }]);
  }
}

function lukeTalk() {
  if (state.luke === 0) {
    showDialog('LUKE CAGE', 'LC', 'Tres matones de Kingpin están usando el callejón como ring privado. Quieren dinero de protección a los comercios. Voy a cerrarles el negocio, pero necesito a alguien que aguante un par de golpes.', [
      { label: 'Cuenta conmigo.', note: 'MISIÓN SECUNDARIA · COMBATE', action: startLukeFight },
      { label: '¿Cuánto pagan?', action: () => showDialog('LUKE CAGE', 'LC', 'Lo suficiente para un mes de alquiler. Y la satisfacción de romperle la nariz a un matón. Eso no tiene precio.', [{ label: 'Acepto.' , action: startLukeFight }, { label: 'Lo pensaré.' }]) },
      { label: 'Ahora no.', action: null }
    ]);
  } else if (state.luke === 1) {
    showDialog('LUKE CAGE', 'LC', `Aún quedan ${Math.max(0, 3 - state.lukeKills)}. El callejón está al sur del parque, junto a la lavandería. No dejes que te rodeen.`, [{ label: 'Voy.' }]);
  } else if (state.luke === 2) {
    showDialog('LUKE CAGE', 'LC', 'Limpio. Esos tres no van a molestar a nadie más. Toma lo tuyo, te lo ganaste.', [
      { label: 'Aceptar $140.', note: '+140 créditos · +90 XP', action: () => { state.luke = 3; state.credits += 140; addXp(90); notify('Misión completada: Protección del barrio. +$140', 'good'); saveGame(); } }
    ]);
  } else {
    showDialog('LUKE CAGE', 'LC', 'Si buscas pelea, hay formas peores de encontrarla. Pero si buscas ayudar, aquí siempre hay trabajo.', [{ label: 'Lo tendré en cuenta.' }]);
  }
}

function deliTalk() {
  const buys = [];
  if (state.medkits < 5) buys.push({ label: 'Botiquín — $40', note: 'Restaura 45 de salud', action: () => {
    if (state.credits < 40) return notify('No tienes créditos suficientes.', 'bad');
    state.credits -= 40; state.medkits++; notify('Compraste un botiquín.', 'good'); saveGame();
  } });
  if (!state.armor) buys.push({ label: 'Chaleco reforzado — $180', note: '+20 salud máxima', action: () => {
    if (state.credits < 180) return notify('No tienes créditos suficientes.', 'bad');
    state.credits -= 180; state.armor = true; state.maxHp += 20; state.hp = state.maxHp;
    notify('Chaleco equipado. +20 salud máxima.', 'good'); saveGame();
  } });
  if (!state.gloves) buys.push({ label: 'Guantes de impacto — $220', note: '+8 daño cuerpo a cuerpo', action: () => {
    if (state.credits < 220) return notify('No tienes créditos suficientes.', 'bad');
    state.credits -= 220; state.gloves = true;
    notify('Guantes equipados. +8 daño.', 'good'); saveGame();
  } });
  if (state.shards > 0) buys.push({ label: 'Vender fragmento — $60', note: `Tienes ${state.shards}`, action: () => {
    state.shards--; state.credits += 60; notify('Fragmento vendido. +$60', 'good'); saveGame();
  } });
  buys.push({ label: 'Solo estoy mirando.', action: null });
  showDialog('DELI 24H · MOSTRADOR', 'D', 'Bienvenido. No pregunto de dónde vienes si tú no preguntas qué hay en la carne. ¿Qué necesitas?', buys);
}

function agentTalk() {
  if (!state.property) {
    showDialog('AGENTE RAMÍREZ', 'AR', 'Tengo un apartamento en Queens: dos habitaciones, vista al callejón y un vecino que nunca duerme. $450 y es tuyo. Alquiler garantizado si lo cuidas.', [
      { label: 'Comprar apartamento — $450', note: state.credits >= 450 ? 'INGRESOS PASIVOS' : 'CRÉDITOS INSUFICIENTES', action: () => {
        if (state.credits < 450) return notify('Necesitas $450. Vuelve cuando tengas el dinero.', 'bad');
        state.credits -= 450; state.property = true; state.rent = 0;
        notify('Propiedad adquirida: Apartamento en Queens.', 'good'); saveGame();
      } },
      { label: '¿Qué incluye?', action: () => showDialog('AGENTE RAMÍREZ', 'AR', 'Cama, nevera y una puerta que cierra. En esta ciudad eso ya es lujo. Los inquilinos pagan puntual porque el edificio tiene reputación.', [{ label: 'Interesante.' }]) },
      { label: 'No me interesa.', action: null }
    ]);
  } else {
    const ready = gameTime - state.rent > 90;
    showDialog('AGENTE RAMÍREZ', 'AR', ready ? 'Tu inquilino dejó el sobre de este turno. Puntual, como siempre.' : 'El apartamento está en orden. El próximo pago llegará pronto; vuelve en un par de minutos.', [
      { label: ready ? 'Cobrar alquiler — $45' : 'Volver más tarde', note: ready ? 'INGRESOS PASIVOS' : '', action: ready ? () => {
        state.credits += 45; state.rent = gameTime; notify('Alquiler cobrado. +$45', 'good'); saveGame();
      } : null },
      { label: 'Adiós.' }
    ]);
  }
}

/* ------------- combat ------------- */
function spawnThug(x, y, quest) {
  enemies.push({ x, y, hp: 48 + state.level * 4, maxHp: 48 + state.level * 4, quest, alive: true, speed: 64, phase: rand(0, 6), cd: 0, flash: 0, moving: true });
}
function startFight() {
  closeDialogue();
  if (state.quest !== 1) return;
  state.quest = 2; state.questKills = 0;
  spawnThug(tpx(63.5), tpx(45.6), 'main');
  spawnThug(tpx(63.5), tpx(49.4), 'main');
  spawnThug(tpx(58.5), tpx(45.6), 'main');
  notify('¡Emboscada! Tres intrusos bloquean el centro.', 'bad');
  cam.shake = 5; sfx('hurt'); saveGame();
}
function startLukeFight() {
  closeDialogue();
  state.luke = 1; state.lukeKills = 0;
  for (let i = 0; i < 3; i++) spawnThug(tpx(36.5) + i * 26, tpx(45.6), 'luke');
  notify('Combate de callejón iniciado. Derrota a los tres.', 'bad');
  cam.shake = 5; saveGame();
}

function attack() {
  if (state.mode !== 'city' || dialogOpen || player.attackCd > 0) return;
  player.attackCd = .42; player.attackAnim = 1;
  let hit = false;
  for (const e of enemies) {
    if (!e.alive) continue;
    if (dist(player.x, player.y, e.x, e.y) < 62) {
      e.hp -= attackDamage(); e.flash = 1; hit = true;
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      e.x += Math.cos(ang) * 12; e.y += Math.sin(ang) * 12;
      spawnParticles(e.x, e.y - 14, '#ffcf5c', 7);
      cam.shake = 2.6;
      if (e.hp <= 0) killEnemy(e);
    }
  }
  if (hit) sfx('hit'); else tone(190, .06, 'triangle', .02);
}

function killEnemy(e) {
  e.alive = false;
  spawnParticles(e.x, e.y - 12, '#ff8a6a', 16);
  spawnParticles(e.x, e.y - 12, '#ffffff', 5);
  const money = Math.round(rand(14, 32));
  state.credits += money; addXp(45);
  if (Math.random() < .22) { state.shards++; notify('Encontraste un fragmento extraño.', 'gold'); }
  notify('Matón derrotado. +$' + money + ' · +45 XP', 'good');
  if (e.quest === 'main') {
    state.questKills++;
    if (state.questKills >= 3 && state.quest === 2) {
      state.quest = 3;
      setTimeout(() => notify('Zona despejada. Habla con Peter Parker.', 'gold'), 700);
    }
  }
  if (e.quest === 'luke') {
    state.lukeKills++;
    if (state.lukeKills >= 3 && state.luke === 1) {
      state.luke = 2;
      setTimeout(() => notify('Combate ganado. Habla con Luke Cage.', 'gold'), 700);
    }
  }
  saveGame();
}

function useMedkit() {
  if (state.mode !== 'city') return;
  if (state.medkits <= 0) return notify('No tienes botiquines.', 'bad');
  if (state.hp >= state.maxHp) return notify('Tu salud ya está al máximo.', 'bad');
  state.medkits--; state.hp = Math.min(state.maxHp, state.hp + 45);
  sfx('pickup'); notify('Botiquín usado. +45 salud.', 'good'); saveGame();
}

function playerDeath() {
  if (respawning) return;
  respawning = true;
  state.hp = 0;
  sfx('hurt'); cam.shake = 8;
  $('#flash').style.background = '#ff5a4f';
  $('#flash').classList.add('on');
  setTimeout(() => {
    state.credits = Math.max(0, state.credits - 30);
    state.hp = Math.round(state.maxHp * .6); state.st = state.maxSt;
    player.x = 27.6 * TILE; player.y = 27.4 * TILE;
    cam.x = player.x; cam.y = player.y;
    enemies.length = 0;
    if (state.quest === 2) { state.quest = 1; state.questKills = 0; }
    if (state.luke === 1) { state.luke = 0; state.lukeKills = 0; }
    closeDialogue();
    $('#flash').classList.remove('on');
    setTimeout(() => { $('#flash').style.background = '#d9f7ff'; }, 400);
    notify('Te despiertas en la calle. Perdiste $30.', 'bad');
    saveGame();
    respawning = false;
  }, 500);
}

/* ------------- interaction registry ------------- */
function getInteractables() {
  const list = [];
  list.push({ id: 'peter', x: PETER.x, y: PETER.y, label: state.quest === 3 ? 'Informar a Peter' : 'Hablar con Peter Parker', action: peterTalk });
  list.push({ id: 'jessica', x: JESSICA.x, y: JESSICA.y, label: 'Hablar con Jessica Jones', action: jessicaTalk });
  list.push({ id: 'luke', x: LUKE.x, y: LUKE.y, label: 'Hablar con Luke Cage', action: lukeTalk });
  list.push({ id: 'deli', x: DELI.x, y: DELI.y, label: 'Entrar al Deli 24H', action: deliTalk });
  list.push({ id: 'agent', x: AGENT.x, y: AGENT.y, label: 'Hablar con el agente inmobiliario', action: agentTalk });
  if (state.quest === 1) list.push({ id: 'door', x: DOOR.x, y: DOOR.y, label: 'Investigar el centro comunitario', action: startFight });
  else if (state.quest === 2) list.push({ id: 'door', x: DOOR.x, y: DOOR.y, label: 'Derrota a los intrusos', action: () => notify('Los intrusos siguen en el callejón. ¡Golpéalos!', 'bad') });
  if (state.jessica === 1) {
    for (let i = state.jessicaClues; i < 3; i++) {
      list.push({ id: 'clue' + i, x: CLUES[i].x, y: CLUES[i].y, label: 'Examinar pista ' + (i + 1) + '/3', action: () => {
        state.jessicaClues++; sfx('pickup'); state.shards++;
        spawnParticles(CLUES[i].x, CLUES[i].y, '#74e4ff', 12);
        if (state.jessicaClues >= 3) { state.jessica = 2; notify('Todas las pistas reunidas. Vuelve con Jessica.', 'gold'); }
        else notify('Pista encontrada (' + state.jessicaClues + '/3).', 'good');
        saveGame();
      } });
    }
  }
  return list;
}

function interact() {
  if (state.mode !== 'city' || dialogOpen) return;
  if (!$('#modal').classList.contains('hidden')) return;
  const list = getInteractables();
  let best = null, bd = 64;
  for (const it of list) {
    const d = dist(player.x, player.y, it.x, it.y);
    if (d < bd) { bd = d; best = it; }
  }
  if (best) { sfx('ui'); best.action(); }
  else notify('No hay nada al alcance. Busca los marcadores dorados.', 'bad');
}

/* ------------- markers / ground fx ------------- */
function drawWorldMarkers(c) {
  const t = gameTime;
  const target = activeTarget();
  if (target) {
    const bob = Math.sin(t * 2.4) * 5;
    c.save();
    c.globalAlpha = .9;
    c.strokeStyle = '#ffcf5c'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(target.x, target.y + 2, 18 + Math.sin(t * 2) * 3, 7, 0, 0, 7); c.stroke();
    c.globalAlpha = .14; c.fillStyle = '#ffcf5c';
    c.beginPath(); c.ellipse(target.x, target.y + 2, 22, 9, 0, 0, 7); c.fill();
    const beam = c.createLinearGradient(target.x, target.y - 120, target.x, target.y);
    beam.addColorStop(0, 'rgba(255,207,92,0)');
    beam.addColorStop(1, 'rgba(255,207,92,.20)');
    c.fillStyle = beam; c.fillRect(target.x - 12, target.y - 120, 24, 120);
    c.globalAlpha = 1;
    c.fillStyle = '#ffcf5c';
    c.beginPath();
    c.moveTo(target.x, target.y - 78 + bob);
    c.lineTo(target.x + 7, target.y - 68 + bob);
    c.lineTo(target.x, target.y - 58 + bob);
    c.lineTo(target.x - 7, target.y - 68 + bob);
    c.closePath(); c.fill();
    c.fillStyle = '#2a1c04';
    c.font = '900 7px monospace'; c.textAlign = 'center';
    c.fillText('!', target.x, target.y - 66 + bob);
    c.textAlign = 'left';
    c.restore();
  }
  // available side quest markers
  const marks = [];
  if (state.quest >= 4 && state.jessica === 0) marks.push(JESSICA);
  if (state.quest >= 4 && state.luke === 0) marks.push(LUKE);
  for (const m of marks) {
    const d = dist(player.x, player.y, m.x, m.y);
    if (d > 260) continue;
    c.fillStyle = '#74e4ff';
    c.globalAlpha = .9;
    c.beginPath(); c.arc(m.x, m.y - 42 + Math.sin(t * 3) * 3, 7, 0, 7); c.fill();
    c.fillStyle = '#04202a'; c.font = '900 9px monospace'; c.textAlign = 'center';
    c.fillText('?', m.x, m.y - 39 + Math.sin(t * 3) * 3);
    c.textAlign = 'left'; c.globalAlpha = 1;
  }
}

function drawGroundEffects(c) {
  const t = gameTime;
  if (state.quest === 1 || state.quest === 2) {
    c.save();
    c.globalAlpha = .35 + Math.sin(t * 3) * .12;
    c.fillStyle = '#ffcf5c';
    c.beginPath(); c.ellipse(DOOR.x, DOOR.y, 20, 8, 0, 0, 7); c.fill();
    c.restore();
  }
  if (state.jessica === 1) {
    for (let i = state.jessicaClues; i < 3; i++) {
      const cl = CLUES[i];
      const pulse = 1 + Math.sin(t * 2.6 + i) * .2;
      c.save();
      c.strokeStyle = '#74e4ff'; c.globalAlpha = .75; c.lineWidth = 1.5;
      c.beginPath(); c.arc(cl.x, cl.y, 14 * pulse, 0, 7); c.stroke();
      c.globalAlpha = .13; c.fillStyle = '#74e4ff';
      c.beginPath(); c.arc(cl.x, cl.y, 18 * pulse, 0, 7); c.fill();
      c.restore();
    }
  }
}

/* ------------- per-frame city update ------------- */
function updateCity(dt) {
  gameTime += dt;
  state.playtime += dt;
  lightning = Math.max(0, lightning - dt * 1.6);

  // clock: 24h in ~20 real minutes
  state.cityTime = (state.cityTime + dt * (24 / 1200)) % 24;

  if (!dialogOpen) {
    let dx = 0, dy = 0;
    if (keys['a'] || keys['arrowleft']) dx -= 1;
    if (keys['d'] || keys['arrowright']) dx += 1;
    if (keys['w'] || keys['arrowup']) dy -= 1;
    if (keys['s'] || keys['arrowdown']) dy += 1;
    if (Math.abs(joy.dx) > .15 || Math.abs(joy.dy) > .15) { dx = joy.dx; dy = joy.dy; }
    const len = Math.hypot(dx, dy);
    if (len > .08) {
      dx /= len; dy /= len;
      const sprint = (keys['shift'] || Math.hypot(joy.dx, joy.dy) > .88) && state.st > 2;
      const spd = (state.speed + (state.armor ? 4 : 0)) * (sprint ? 1.5 : 1);
      moveEntity(player, dx * spd * dt, dy * spd * dt, 9);
      player.moving = true;
      player.walk += dt * (sprint ? 13 : 9);
      player.dir = dx < -.05 ? -1 : dx > .05 ? 1 : player.dir;
      if (sprint) state.st = Math.max(0, state.st - dt * 22);
    } else {
      player.moving = false;
      state.st = Math.min(state.maxSt, state.st + dt * 14);
    }
    if (player.attackCd > 0) player.attackCd -= dt;
    if (player.attackAnim > 0) player.attackAnim -= dt * 3.4;
    if (player.invuln > 0) player.invuln -= dt;
  } else {
    player.moving = false;
    if (player.attackCd > 0) player.attackCd -= dt;
  }

  // enemies
  for (const e of enemies) {
    if (!e.alive) continue;
    e.flash = Math.max(0, e.flash - dt * 3);
    e.cd = Math.max(0, e.cd - dt);
    const d = dist(e.x, e.y, player.x, player.y);
    if (d < 420) {
      const ang = Math.atan2(player.y - e.y, player.x - e.x);
      if (d > 30) {
        moveEntity(e, Math.cos(ang) * e.speed * dt, Math.sin(ang) * e.speed * dt, 8);
        e.moving = true; e.phase += dt * 8;
      } else e.moving = false;
      if (d < 36 && e.cd <= 0 && player.invuln <= 0 && !dialogOpen) {
        e.cd = 1.15;
        state.hp -= 7 + Math.floor(state.level * .6);
        player.invuln = .55; cam.shake = 4; sfx('hurt');
        spawnParticles(player.x, player.y - 12, '#ff645e', 6);
        const ka = Math.atan2(player.y - e.y, player.x - e.x);
        player.x += Math.cos(ka) * 14; player.y += Math.sin(ka) * 14;
        if (state.hp <= 0) { playerDeath(); return; }
      }
    } else { e.moving = false; }
  }
  for (let i = enemies.length - 1; i >= 0; i--) if (!enemies[i].alive) enemies.splice(i, 1);

  // interaction proximity
  nearby = null;
  let bd = 64;
  if (!dialogOpen) {
    for (const it of getInteractables()) {
      const d = dist(player.x, player.y, it.x, it.y);
      if (d < bd) { bd = d; nearby = it; }
    }
  }
  const prompt = $('#prompt');
  if (nearby) {
    prompt.classList.add('show');
    $('#promptText').textContent = nearby.label;
  } else prompt.classList.remove('show');

  updateAmbient(dt);
  updateParticles(dt);

  hudTick -= dt;
  if (hudTick <= 0) { hudTick = .2; updateQuestText(); }

  if (state.hp <= 0 && !dialogOpen) playerDeath();
}
