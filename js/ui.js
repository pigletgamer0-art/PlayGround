'use strict';
/* UI, menus, mobile controls and the main loop */
let menuOpen = false;
let selectedOrigin = 'queens';
let selectedPower = 'none';
let miniTick = 0, autosave = 0;

function applyOrigin(origin) {
  const o = ORIGINS[origin] || ORIGINS.queens;
  state.origin = origin;
  state.maxHp = 100 + (o.hp || 0);
  state.hp = state.maxHp;
  state.maxSt = 100 + (o.st || 0);
  state.st = state.maxSt;
  state.medkits = 2 + (o.medkits || 0);
  state.credits = 250 + (o.credits || 0);
  state.armor = !!o.armor;
  state.gloves = !!o.gloves;
  if (origin === 'citizen') state.credits = 300;
}
function resetNewGame() {
  state.level = 1; state.xp = 0;
  state.quest = 0; state.questKills = 0;
  state.jessica = 0; state.jessicaClues = 0;
  state.luke = 0; state.lukeKills = 0;
  state.property = false; state.rent = 0; state.shards = 0;
  state.cityTime = 19.4; state.playtime = 0;
  state.weather = 'clear'; state.rainTimer = 55;
  state.gloves = false; state.armor = false;
  state.speed = 152; state.powerLevel = 1;
  player.x = 27.6 * TILE; player.y = 27.4 * TILE;
  cam.x = player.x; cam.y = player.y;
  enemies.length = 0; particles.length = 0;
}

$$('#origins .origin').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#origins .origin').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel'); selectedOrigin = btn.dataset.origin;
    sfx('ui');
  });
});

$$('.creatorStep').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('.creatorStep').forEach(b => b.classList.toggle('active', b === btn));
    $$('.creatorPage').forEach(p => p.classList.toggle('active', p.dataset.page === btn.dataset.step));
    sfx('ui');
  });
});

$$('#powers .power').forEach(btn => {
  btn.addEventListener('click', () => {
    $$('#powers .power').forEach(b => b.classList.remove('sel'));
    btn.classList.add('sel'); selectedPower = btn.dataset.power;
    sfx('ui');
  });
});

$('#startBtn').addEventListener('click', () => {
  resetNewGame();
  state.name = ($('#heroName').value || 'Alex Ríos').trim().slice(0, 18) || 'Alex Ríos';
  state.look = $('#heroLook').value;
  state.color = $('#heroColor').value;
  state.trait = $('#heroTrait').value;
  state.moral = $('#heroMoral').value;
  state.motivation = ($('#heroMotivation').value || '').trim().slice(0, 120);
  state.power = selectedPower;
  applyOrigin(selectedOrigin);
  if (state.power === 'speed') state.speed = 170;
  state.started = true; state.mode = 'planet';
  $('#startScreen').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  showPlanetUI();
  selectLocation('nyc');
  updateHUD();
  saveGame();
  tone(392, .15, 'triangle', .05);
  setTimeout(() => tone(587, .25, 'triangle', .045), 120);
});

if (hasSave()) $('#continueBtn').classList.remove('hidden');
$('#continueBtn').addEventListener('click', () => {
  if (!loadGame()) return;
  $('#startScreen').classList.add('hidden');
  $('#hud').classList.remove('hidden');
  showPlanetUI();
  selectLocation('nyc');
  updateHUD();
  notify('Bienvenido de nuevo, ' + state.name.split(' ')[0] + '.', 'good');
});

function showPlanetUI() {
  state.mode = 'planet';
  $('#planetPanel').classList.remove('hidden');
  $('#planetHint').classList.remove('hidden');
  $('#uranium').classList.remove('hidden');
  $('#touch').classList.add('hidden');
  $('#prompt').classList.remove('show');
  $('#questPanel').classList.add('hidden');
  $('#vitals').classList.add('hidden');
  $('#minimapWrap').classList.add('hidden');
}
function showCityUI() {
  $('#planetPanel').classList.add('hidden');
  $('#planetHint').classList.add('hidden');
  $('#uranium').classList.add('hidden');
  $('#questPanel').classList.remove('hidden');
  $('#vitals').classList.remove('hidden');
  $('#minimapWrap').classList.remove('hidden');
  $('#touch').classList.remove('hidden');
  updateQuestText();
}

function enterCity() {
  $('#flash').classList.add('on');
  setTimeout(() => {
    state.mode = 'city';
    state.started = true;
    cam.x = player.x; cam.y = player.y;
    $('#startScreen').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    showCityUI();
    updateHUD();
    saveGame();
    setTimeout(() => { $('#flash').classList.remove('on'); }, 120);
    setTimeout(() => notify('Queens, Nueva York. La ciudad respira despacio.', 'good'), 500);
    setTimeout(() => notify('Muévete con WASD o el joystick. E para interactuar.', 'gold'), 2100);
  }, 380);
}

/* ------------- HUD ------------- */
function updateHUD() {
  const h = Math.floor(state.cityTime);
  const m = Math.floor((state.cityTime - h) * 60);
  $('#clock').textContent = String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
  $('#weather').textContent = state.weather === 'rain' ? 'LLUVIA' : 'DESPEJADO';
  $('#credits').textContent = '$' + state.credits;
  $('#creditsSmall').textContent = '$' + state.credits;
  $('#level').textContent = state.level;
  $('#hpFill').style.width = clamp(state.hp / state.maxHp * 100, 0, 100) + '%';
  $('#stFill').style.width = clamp(state.st / state.maxSt * 100, 0, 100) + '%';
  $('#xpFill').style.width = clamp(state.xp / xpNeed() * 100, 0, 100) + '%';
  const o = ORIGINS[state.origin] || ORIGINS.queens;
  $('#heroLabel').textContent = state.name.toUpperCase() + ' · ' + o.short;
  const t = activeTarget();
  if (t && state.mode === 'city') {
    const d = Math.round(dist(player.x, player.y, t.x, t.y) / 32);
    $('#questDist').textContent = t.label.toUpperCase() + ' · ' + d + ' m';
  }
  const btn = $('#pEnter');
  if (btn && state.mode === 'planet') {
    const loc = LOCATIONS.find(l => l.id === selectedLoc);
    if (loc) btn.disabled = !loc.unlocked || state.level < loc.level;
  }
}

/* ------------- modal / tabs ------------- */
function setTab(tab) {
  $$('#tabs .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  renderModal(tab);
}
$$('#tabs .tab').forEach(b => b.addEventListener('click', () => { sfx('ui'); setTab(b.dataset.tab); }));
$('#menuBtn').addEventListener('click', () => openMenu('char'));
$('#modalClose').addEventListener('click', closeMenu);
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeMenu(); });
$('#minimapWrap').addEventListener('click', () => openMenu('map'));

function openMenu(tab) {
  if (!state.started) return;
  menuOpen = true;
  $('#modal').classList.remove('hidden');
  setTab(tab || 'char');
  sfx('ui');
}
function closeMenu() { menuOpen = false; $('#modal').classList.add('hidden'); }

function statCards() {
  const o = ORIGINS[state.origin] || ORIGINS.queens;
  const q = questInfo();
  return `<div class="grid">
    <div class="card"><h4>IDENTIDAD</h4><div class="bigNum">${state.name}</div>
      <p style="margin-top:6px">${o.label}</p><p class="small">${o.desc}</p>
      <div class="pillRow"><span class="pill">NIVEL ${state.level}</span><span class="pill">${o.bonus}</span></div>
      <p class="small">Apariencia: ${state.look} · Personalidad: ${state.trait} · Moralidad: ${state.moral}</p>
      <p class="small">Don: ${state.power === 'none' ? 'Sin poderes' : state.power} · Nivel ${state.powerLevel}</p>
      <p class="small">Motivación: ${state.motivation || 'Por definir'}</p>
      <div class="barLg"><i style="width:${clamp(state.xp / xpNeed() * 100, 0, 100)}%"></i></div>
      <p class="small">${state.xp} / ${xpNeed()} XP para el siguiente nivel</p></div>
    <div class="card"><h4>ESTADO</h4>
      <div class="listRow"><span>Salud</span><b>${Math.ceil(state.hp)} / ${state.maxHp}</b></div>
      <div class="listRow"><span>Resistencia</span><b>${Math.ceil(state.st)} / ${state.maxSt}</b></div>
      <div class="listRow"><span>Ataque</span><b>${attackDamage()} daño</b></div>
      <div class="listRow"><span>Créditos</span><b>$${state.credits}</b></div>
      <div class="listRow"><span>Tiempo jugado</span><b>${Math.floor(state.playtime / 60)} min</b></div></div>
    <div class="card"><h4>OBJETIVO ACTUAL</h4><p><b style="color:#fff">${q.title}</b><br/>${q.desc}</p>
      <p class="small" style="margin-top:8px">Explora libremente. Las misiones secundarias aparecen en el mapa con un signo de interrogación.</p></div>
    <div class="card"><h4>PROGRESO DE QUEENS</h4>
      <div class="listRow"><span>Misión principal</span><b>${state.quest >= 4 ? 'Completada' : 'En curso'}</b></div>
      <div class="listRow"><span>Jessica Jones</span><b>${['Sin empezar', 'En curso', 'Lista para informar', 'Completada'][state.jessica] || '—'}</b></div>
      <div class="listRow"><span>Luke Cage</span><b>${['Sin empezar', 'En curso', 'Lista para informar', 'Completada'][state.luke] || '—'}</b></div>
      <div class="listRow"><span>Propiedad</span><b>${state.property ? 'Apartamento' : 'Ninguna'}</b></div></div>
  </div>`;
}
function questCards() {
  const q = questInfo();
  return `<div class="grid">
    <div class="card" style="border-color:#4b4327"><h4>MISIÓN PRINCIPAL</h4><p><b style="color:#fff">${q.title}</b></p>
      <p style="margin-top:6px">${q.desc}</p><div class="pillRow"><span class="pill" style="color:#ffcf5c">${state.quest >= 4 ? 'COMPLETADA' : 'ACTIVA'}</span></div></div>
    <div class="card"><h4>JESSICA JONES — LAS DESAPARECIDAS</h4>
      <p>${state.jessica === 0 ? 'Habla con Jessica cerca del parque para empezar.' : state.jessica === 1 ? 'Pistas encontradas: ' + state.jessicaClues + ' / 3.' : state.jessica === 2 ? 'Vuelve a hablar con Jessica.' : 'Misión completada.'}</p>
      <div class="pillRow"><span class="pill">${state.jessica === 0 ? 'DISPONIBLE' : state.jessica === 3 ? 'COMPLETADA' : 'EN CURSO'}</span></div></div>
    <div class="card"><h4>LUKE CAGE — PROTECCIÓN DEL BARRIO</h4>
      <p>${state.luke === 0 ? 'Luke busca ayuda en el callejón del sur.' : state.luke === 1 ? 'Matones derrotados: ' + state.lukeKills + ' / 3.' : state.luke === 2 ? 'Habla con Luke para cobrar.' : 'Misión completada.'}</p>
      <div class="pillRow"><span class="pill">${state.luke === 0 ? 'DISPONIBLE' : state.luke === 3 ? 'COMPLETADA' : 'EN CURSO'}</span></div></div>
    <div class="card"><h4>NOTAS DE CAMPO</h4><p class="small">
      · Los marcadores dorados señalan la misión activa.<br/>
      · Los signos de interrogación indican secundarias.<br/>
      · Los enemigos sueltan créditos y fragmentos.<br/>
      · Descansa comprando o mejora tu equipo en el Deli.</p></div>
  </div>`;
}
function invCards() {
  return `<div class="grid">
    <div class="card"><h4>MUNICIÓN Y SALUD</h4>
      <div class="listRow"><span>Botiquines</span><b>${state.medkits} / 5</b></div>
      <div class="listRow"><span>Fragmentos extraños</span><b>${state.shards}</b></div>
      <button class="btn gold" data-use-med ${state.medkits <= 0 ? 'disabled' : ''} style="margin-top:12px">USAR BOTIQUÍN (+45 HP)</button>
      <p class="small" style="margin-top:8px">El botiquín se consume. Compra más en el Deli 24H por $40.</p></div>
    <div class="card"><h4>EQUIPAMIENTO</h4>
      <div class="listRow"><span>Chaleco reforzado</span><b>${state.armor ? 'EQUIPADO' : 'NO'}</b></div>
      <div class="listRow"><span>Guantes de impacto</span><b>${state.gloves ? 'EQUIPADO' : 'NO'}</b></div>
      <div class="listRow"><span>Daño actual</span><b>${attackDamage()}</b></div>
      <div class="listRow"><span>Propiedad</span><b>${state.property ? 'Apartamento en Queens' : '—'}</b></div>
      <p class="small" style="margin-top:8px">Mejora tu equipo en el Deli o completa misiones para recibir recompensas.</p></div>
  </div>`;
}
function mapCard() {
  return `<div class="grid" style="grid-template-columns:1.4fr 1fr">
    <div><canvas id="menuMap" width="600" height="400"></canvas>
      <div class="legend"><span><i style="background:#fff"></i>Tú</span><span><i style="background:#ffcf5c"></i>Objetivo</span><span><i style="background:#74e4ff"></i>NPC</span><span><i style="background:#2b4149"></i>Edificios</span></div></div>
    <div><div class="card"><h4>DISTRITO</h4><p style="color:#fff"><b>QUEENS, NUEVA YORK</b></p>
      <p class="small" style="margin-top:6px">Un barrio de calles amplias, azoteas bajas y demasiados secretos. La comisaría del distrito no responde a los informes después de medianoche.</p>
      <div class="listRow"><span>Centro comunitario</span><b>Este</b></div>
      <div class="listRow"><span>Deli 24H</span><b>Sur</b></div>
      <div class="listRow"><span>Parque</span><b>Centro</b></div>
      <div class="listRow"><span>Apartamentos</span><b>Noreste</b></div></div>
      <div class="card" style="margin-top:10px"><h4>CONTROLES</h4><p class="small">WASD / flechas: mover<br/>Shift: correr · Espacio: golpear<br/>E: interactuar · H: botiquín<br/>M: mapa · Esc: menú</p></div></div>
  </div>`;
}
function sysCard() {
  return `<div class="grid">
    <div class="card"><h4>PARTIDA</h4>
      <p class="small">La partida se guarda automáticamente al completar acciones importantes y cada 15 segundos.</p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        <button class="btn" data-save>GUARDAR AHORA</button>
        <button class="btn gold" data-sound>SONIDO: ${state.sound ? 'ON' : 'OFF'}</button>
        <button class="btn danger" data-reset>REINICIAR HISTORIA</button>
      </div></div>
    <div class="card"><h4>CRÉDITOS</h4><p class="small">MARVEL: ORIGINS es una demo jugable original construida con HTML, CSS, JavaScript y Canvas. Homenaje no oficial al universo Marvel. Todos los personajes pertenecen a sus respectivos titulares.</p>
      <p class="small" style="margin-top:8px">Sin recursos externos: planeta, texturas, sprites, iluminación y sonido se generan en tiempo real.</p></div>
    <div class="card"><h4>CONTROLES TÁCTILES</h4><p class="small">Joystick izquierdo para moverte. Mantén el joystick al máximo para correr. Botón GOLPE para atacar y USAR para interactuar. El botón ☰ abre este expediente.</p></div>
    <div class="card"><h4>CONSEJO</h4><p class="small">Si te superan en número, retrocede y golpea en el momento justo. La resistencia se recupera al caminar y la salud solo con botiquines.</p></div>
  </div>`;
}
function renderModal(tab) {
  const titles = { char: 'EXPEDIENTE DE PERSONAJE', quests: 'REGISTRO DE MISIONES', inv: 'INVENTARIO Y EQUIPO', map: 'MAPA DEL DISTRITO', sys: 'SISTEMA Y AJUSTES' };
  $('#modalTitle').textContent = titles[tab] || 'EXPEDIENTE';
  const body = $('#modalBody');
  if (tab === 'char') body.innerHTML = statCards();
  else if (tab === 'quests') body.innerHTML = questCards();
  else if (tab === 'inv') body.innerHTML = invCards();
  else if (tab === 'map') { body.innerHTML = mapCard(); const mc = $('#menuMap'); if (mc) drawMini(mc); }
  else body.innerHTML = sysCard();
  body.querySelector('[data-use-med]')?.addEventListener('click', () => { useMedkit(); setTab('inv'); });
  body.querySelector('[data-save]')?.addEventListener('click', () => { saveGame(); notify('Partida guardada.', 'good'); });
  body.querySelector('[data-sound]')?.addEventListener('click', () => { state.sound = !state.sound; sfx('ui'); saveGame(); setTab('sys'); });
  body.querySelector('[data-reset]')?.addEventListener('click', () => {
    if (confirm('¿Reiniciar la historia? Se borrará la partida guardada.')) { localStorage.removeItem(SAVE_KEY); location.reload(); }
  });
}

/* ------------- touch controls ------------- */
const joyEl = $('#joy'), knob = $('#knob');
let joyId = null;
function joyStart(e) {
  e.preventDefault();
  joyId = e.pointerId;
  joyEl.setPointerCapture(e.pointerId);
  joyMove(e);
}
function joyMove(e) {
  if (e.pointerId !== joyId) return;
  const r = joyEl.getBoundingClientRect();
  let x = e.clientX - (r.left + r.width / 2);
  let y = e.clientY - (r.top + r.height / 2);
  const max = r.width * .31;
  const len = Math.hypot(x, y);
  if (len > max) { x = x / len * max; y = y / len * max; }
  knob.style.transform = `translate(${x}px,${y}px)`;
  joy.dx = x / max; joy.dy = y / max; joy.active = true;
}
function joyEnd(e) {
  if (e && e.pointerId !== joyId) return;
  joyId = null; joy.dx = 0; joy.dy = 0; joy.active = false;
  knob.style.transform = '';
}
joyEl.addEventListener('pointerdown', joyStart);
joyEl.addEventListener('pointermove', joyMove);
joyEl.addEventListener('pointerup', joyEnd);
joyEl.addEventListener('pointercancel', joyEnd);
$('#btnAttack').addEventListener('pointerdown', (e) => { e.preventDefault(); attack(); });
$('#btnUse').addEventListener('pointerdown', (e) => { e.preventDefault(); interact(); });

/* ------------- loop ------------- */
function loop(now) {
  const dt = Math.min(.05, (now - lastFrame) / 1000);
  lastFrame = now;
  if (state.mode === 'city') {
    if (!menuOpen) updateCity(dt);
    drawCity(dt);
    hudTick = .2;
    updateHUD();
    miniTick -= dt;
    if (miniTick <= 0) { miniTick = .18; const mm = $('#minimap'); if (mm) drawMini(mm); }
    autosave += dt;
    if (autosave > 15) { autosave = 0; saveGame(); }
  } else {
    drawPlanet(dt);
    updateHUD();
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.addEventListener('visibilitychange', () => { if (document.hidden && state.started) saveGame(); });
window.addEventListener('beforeunload', () => { if (state.started) saveGame(); });
window.addEventListener('resize', () => {
  if (menuOpen && $('#tabs .tab.active')?.dataset.tab === 'map') {
    const mc = $('#menuMap'); if (mc) drawMini(mc);
  }
});
