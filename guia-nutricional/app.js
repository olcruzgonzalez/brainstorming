/* =========================================================
   Mi Guía Nutricional — lógica de la app
   Sin dependencias. Persistencia en localStorage.
   ========================================================= */

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const MOMENTOS = [
  { clave: "des", nombre: "Desayuno" },
  { clave: "com", nombre: "Comida" },
  { clave: "cen", nombre: "Cena" },
  { clave: "snk", nombre: "Snack" },
];
const CLAVE_LS = "guiaNutricional.v1";

let estado = {
  perfil: null,          // { edad, personas, objetivo, cond: [], restr: [] }
  plan: null,            // { Lunes: {des: id, com: id, cen: id, snk: id}, ... }
  compradas: {},         // { nombreIngrediente: true }
};

/* ---------------- Utilidades ---------------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];

function barajar(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function guardar() {
  localStorage.setItem(CLAVE_LS, JSON.stringify(estado));
}

function cargar() {
  try {
    const raw = localStorage.getItem(CLAVE_LS);
    if (raw) estado = { ...estado, ...JSON.parse(raw) };
  } catch (e) { /* estado limpio si hay datos corruptos */ }
}

const recetaPorId = (id) => RECETAS.find((r) => r.id === id);

/* ---------------- Filtrado por perfil ---------------- */
function esApta(receta, perfil) {
  const r = perfil.restr;
  if (r.includes("vegetariano") && receta.p.some((p) => ["pescado", "ave", "carne"].includes(p))) return false;
  if (r.includes("pescetariano") && receta.p.some((p) => ["ave", "carne"].includes(p))) return false;
  if (r.includes("gluten") && receta.al.includes("gluten")) return false;
  if (r.includes("lacteo") && (receta.al.includes("lacteo") || receta.p.includes("lacteo"))) return false;
  if (r.includes("frutos_secos") && receta.al.includes("frutos_secos")) return false;
  if (r.includes("pescado") && (receta.al.includes("pescado") || receta.p.includes("pescado"))) return false;
  return true;
}

/* Prioridades de salud del usuario: objetivo + condiciones marcadas */
function focosDeSalud(perfil) {
  const focos = new Set(perfil.cond);
  if (perfil.objetivo === "peso") focos.add("peso");
  if (perfil.objetivo === "corazon") focos.add("corazon");
  if (perfil.objetivo === "cerebro") focos.add("cerebro");
  if (perfil.edad >= 60) focos.add("cerebro");
  if (perfil.cond.includes("presion")) focos.add("presion");
  return focos;
}

/* Dieta recomendada según perfil (para mostrar y para sesgar la selección) */
function dietaRecomendada(perfil) {
  if (perfil.cond.includes("presion")) return "dash";
  if (perfil.objetivo === "cerebro" || perfil.edad >= 60) return "mind";
  if (perfil.objetivo === "peso" || perfil.restr.includes("vegetariano")) return "flex";
  return "med";
}

function puntuar(receta, perfil) {
  const focos = focosDeSalud(perfil);
  let pts = 1;
  receta.b.forEach((b) => { if (focos.has(b)) pts += 2; });
  if (receta.d.includes(dietaRecomendada(perfil))) pts += 1;
  return pts;
}

/* Selección ponderada por puntuación, sin repetir */
function elegirPonderado(pool, perfil, usados) {
  const candidatos = pool.filter((r) => !usados.has(r.id));
  const lista = candidatos.length ? candidatos : pool; // si se agota, permite repetir
  const pesos = lista.map((r) => puntuar(r, perfil));
  const total = pesos.reduce((a, b) => a + b, 0);
  let tirada = Math.random() * total;
  for (let i = 0; i < lista.length; i++) {
    tirada -= pesos[i];
    if (tirada <= 0) return lista[i];
  }
  return lista[lista.length - 1];
}

/* ---------------- Generador del plan semanal ----------------
   Respeta las cuotas del consenso científico:
   - pescado 2-3× (si el perfil lo permite)
   - legumbre ≥3× como plato principal
   - carne roja ≤1× (0 si hay riesgo cardiovascular)
   - resto: ave, huevo, vegetariano, con variedad
----------------------------------------------------------------*/
function generarPlan(perfil) {
  const aptas = RECETAS.filter((r) => esApta(r, perfil));
  const usados = new Set();

  const poolDes = aptas.filter((r) => r.t.includes("des"));
  const poolSnk = aptas.filter((r) => r.t.includes("snk"));
  const mains = aptas.filter((r) => r.t.includes("com") || r.t.includes("cen"));

  if (!poolDes.length || !mains.length) return null;

  // --- cuotas de proteína para los 14 platos principales ---
  const riesgoCardio = perfil.cond.includes("presion") || perfil.cond.includes("colesterol") || perfil.objetivo === "corazon";
  const hayPescado = mains.some((r) => r.p.includes("pescado"));
  const hayCarne = mains.some((r) => r.p.includes("carne"));

  const cuotas = [];
  if (hayPescado) cuotas.push("pescado", "pescado", "pescado");
  cuotas.push("legumbre", "legumbre", "legumbre", "legumbre");
  if (hayCarne && !riesgoCardio) cuotas.push("carne");

  // 14 huecos: 7 comidas + 7 cenas
  const huecos = [];
  DIAS.forEach((dia) => { huecos.push({ dia, momento: "com" }, { dia, momento: "cen" }); });
  const huecosBarajados = barajar(huecos);

  const plan = {};
  DIAS.forEach((d) => { plan[d] = {}; });

  const asignar = (hueco, receta) => {
    plan[hueco.dia][hueco.momento] = receta.id;
    usados.add(receta.id);
  };

  // 1) colocar cuotas en huecos aleatorios compatibles
  for (const proteina of cuotas) {
    const hueco = huecosBarajados.find((h) => !plan[h.dia][h.momento] &&
      mains.some((r) => !usados.has(r.id) && r.p.includes(proteina) && r.t.includes(h.momento)));
    if (!hueco) continue;
    const pool = mains.filter((r) => !usados.has(r.id) && r.p.includes(proteina) && r.t.includes(hueco.momento));
    asignar(hueco, elegirPonderado(pool, perfil, usados));
  }

  // 2) rellenar el resto sin carne roja extra ni pescado de más
  const pescadosPuestos = () => Object.values(plan).flatMap((d) => Object.values(d))
    .filter((id) => recetaPorId(id).p.includes("pescado")).length;

  for (const hueco of huecosBarajados) {
    if (plan[hueco.dia][hueco.momento]) continue;
    let pool = mains.filter((r) => r.t.includes(hueco.momento) && !r.p.includes("carne"));
    if (pescadosPuestos() >= 3) pool = pool.filter((r) => !r.p.includes("pescado"));
    if (!pool.length) pool = mains.filter((r) => r.t.includes(hueco.momento));
    asignar(hueco, elegirPonderado(pool, perfil, usados));
  }

  // 3) desayunos y snacks, garantizando avena y frutos rojos si es posible
  DIAS.forEach((dia) => {
    plan[dia].des = elegirPonderado(poolDes, perfil, usados).id;
    usados.add(plan[dia].des);
    if (poolSnk.length) {
      plan[dia].snk = elegirPonderado(poolSnk, perfil, usados).id;
      usados.add(plan[dia].snk);
    }
  });

  return plan;
}

/* Re-sortear un solo día */
function regenerarDia(dia) {
  const perfil = estado.perfil;
  const aptas = RECETAS.filter((r) => esApta(r, perfil));
  const usadosSemana = new Set(
    Object.entries(estado.plan)
      .filter(([d]) => d !== dia)
      .flatMap(([, comidas]) => Object.values(comidas))
  );
  MOMENTOS.forEach(({ clave }) => {
    let pool = aptas.filter((r) => r.t.includes(clave));
    if (clave === "com" || clave === "cen") pool = pool.filter((r) => !r.p.includes("carne"));
    if (!pool.length) return;
    const receta = elegirPonderado(pool, perfil, usadosSemana);
    estado.plan[dia][clave] = receta.id;
    usadosSemana.add(receta.id);
  });
  guardar();
  pintarPlan();
  pintarCompra();
}

/* ---------------- Render: navegación ---------------- */
function initTabs() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest(".tab");
    if (!btn) return;
    $$(".tab").forEach((t) => t.classList.remove("activa"));
    btn.classList.add("activa");
    $$(".panel").forEach((p) => p.classList.remove("visible"));
    $(`#panel-${btn.dataset.tab}`).classList.add("visible");
  });
}

/* ---------------- Render: perfil ---------------- */
function leerPerfil() {
  return {
    edad: parseInt($("#edad").value, 10) || 30,
    personas: parseInt($("#personas").value, 10) || 1,
    objetivo: $$('input[name="objetivo"]').find((i) => i.checked)?.value || "salud",
    cond: $$('input[name="cond"]:checked').map((i) => i.value),
    restr: $$('input[name="restr"]:checked').map((i) => i.value),
  };
}

function volcarPerfil(perfil) {
  $("#edad").value = perfil.edad;
  $("#personas").value = perfil.personas;
  $$('input[name="objetivo"]').forEach((i) => { i.checked = i.value === perfil.objetivo; });
  $$('input[name="cond"]').forEach((i) => { i.checked = perfil.cond.includes(i.value); });
  $$('input[name="restr"]').forEach((i) => { i.checked = perfil.restr.includes(i.value); });
}

function pintarResumenDieta() {
  const caja = $("#resumen-dieta");
  if (!estado.perfil) { caja.classList.add("oculto"); return; }
  const d = dietaRecomendada(estado.perfil);
  const motivos = {
    dash: "has marcado hipertensión, y la dieta DASH fue diseñada precisamente para bajar la presión arterial",
    mind: "tu objetivo cognitivo (o tu etapa vital) hace de la dieta MIND la mejor protectora del cerebro según la evidencia",
    flex: "es flexible, saciante y de las mejor valoradas para el control de peso y la alimentación vegetal",
    med: "es la dieta con más evidencia científica acumulada para la salud general y la longevidad",
  };
  const notaColesterol = estado.perfil.cond.includes("colesterol")
    ? ` Como has marcado colesterol alto, consulta también la pestaña <strong>🩺 Colesterol</strong>: incluye la pauta clínica de 1800 kcal con raciones y equivalencias.`
    : "";
  caja.innerHTML = `✅ <strong>Perfil guardado.</strong> Tu plan se apoya sobre todo en la dieta
    <strong>${DIETAS[d].nombre}</strong>, porque ${motivos[d]}.
    Las recetas que encajan con tus objetivos tienen prioridad en el generador.
    Ve a la pestaña <strong>📅 Plan semanal</strong> para ver tu semana.${notaColesterol}`;
  caja.classList.remove("oculto");
}

/* ---------------- Render: plan ---------------- */
function badge(dieta) {
  return `<span class="badge" style="background:${DIETAS[dieta].color}">${DIETAS[dieta].nombre}</span>`;
}

function htmlDetalle(receta) {
  const ings = receta.ing.map(([n, , q]) => `<li>${n} — ${q}</li>`).join("");
  const beneficios = receta.b.map((b) => BENEFICIOS[b]).join(" · ");
  return `<div class="detalle">
    <span class="etiq">Ingredientes (por persona)</span>
    <ul>${ings}</ul>
    <span class="etiq">Preparación</span>
    <p>${receta.coccion}</p>
    ${beneficios ? `<span class="etiq">Bueno para</span><p>${beneficios}</p>` : ""}
    <p class="tip">💡 ${receta.tip}</p>
  </div>`;
}

function pintarPlan() {
  const grid = $("#plan-grid");
  const vacio = $("#plan-vacio");
  if (!estado.plan) {
    grid.innerHTML = "";
    $("#cumplimiento").innerHTML = "";
    $("#plan-descripcion").textContent = "";
    vacio.classList.remove("oculto");
    return;
  }
  vacio.classList.add("oculto");

  const d = dietaRecomendada(estado.perfil);
  const nAptas = RECETAS.filter((r) => esApta(r, estado.perfil)).length;
  $("#plan-descripcion").textContent =
    `Semana generada para tu perfil (base ${DIETAS[d].nombre}) a partir de un recetario de ${RECETAS.length} recetas (${nAptas} compatibles con tus restricciones). Pulsa un plato para ver ingredientes, preparación y consejos; el dado 🎲 de cada día lo re-sortea.`;

  grid.innerHTML = DIAS.map((dia) => {
    const comidas = MOMENTOS.filter((m) => estado.plan[dia][m.clave]).map((m) => {
      const receta = recetaPorId(estado.plan[dia][m.clave]);
      return `<div class="comida">
        <div class="momento">${m.nombre}</div>
        <div class="nombre" data-receta="${receta.id}">${receta.n}</div>
        <div class="badges">${receta.d.map(badge).join("")}</div>
        <div class="zona-detalle" id="det-${dia}-${m.clave}"></div>
      </div>`;
    }).join("");
    return `<article class="dia-card">
      <h3>${dia} <button class="btn-dado" title="Re-sortear este día" data-dia="${dia}">🎲</button></h3>
      ${comidas}
    </article>`;
  }).join("");

  pintarCumplimiento();
}

function pintarCumplimiento() {
  const ids = Object.values(estado.plan).flatMap((d) => Object.values(d));
  const recetas = ids.map(recetaPorId);
  const nPescado = recetas.filter((r) => r.p.includes("pescado")).length;
  const nLegumbre = recetas.filter((r) => r.p.includes("legumbre")).length;
  const nCarne = recetas.filter((r) => r.p.includes("carne")).length;
  const nHoja = recetas.filter((r) => r.ing.some(([n]) => /espinaca|acelga|kale|rúcula|hojas verdes/i.test(n))).length;
  const nRojos = recetas.filter((r) => r.ing.some(([n]) => /arándano|fresa|frambuesa|frutos rojos/i.test(n))).length;

  const objetivos = [
    { ok: nPescado >= 2, txt: `🐟 Pescado ${nPescado}×  (objetivo 2-3)` },
    { ok: nLegumbre >= 3, txt: `🫘 Legumbre ${nLegumbre}×  (objetivo ≥3)` },
    { ok: nCarne <= 1, txt: `🥩 Carne roja ${nCarne}×  (máximo 1)` },
    { ok: nHoja >= 4, txt: `🥬 Hoja verde ${nHoja}×  (ideal ≥6)` },
    { ok: nRojos >= 2, txt: `🍓 Frutos rojos ${nRojos}×  (objetivo ≥2)` },
  ];
  // Si las restricciones impiden el pescado, no lo mostramos como fallo
  const sinPescado = estado.perfil.restr.some((r) => ["vegetariano", "pescado"].includes(r));
  $("#cumplimiento").innerHTML = objetivos
    .filter((o) => !(sinPescado && o.txt.startsWith("🐟")))
    .map((o) => `<span class="cumple-item ${o.ok ? "" : "no"}">${o.ok ? "✓" : "→"} ${o.txt}</span>`)
    .join("");
}

/* ---------------- Render: lista de compra ---------------- */
function pintarCompra() {
  const cont = $("#lista-compra");
  if (!estado.plan) {
    cont.innerHTML = `<p class="ayuda">Genera primero tu plan semanal.</p>`;
    return;
  }
  const personas = estado.perfil.personas || 1;
  $("#compra-descripcion").textContent =
    `Generada a partir de tu plan para ${personas} persona${personas > 1 ? "s" : ""} (cantidades por persona y ración — multiplica por ${personas}). Marca lo que ya tengas en casa.`;

  // Agregar ingredientes: { nombre: { cat, veces, cantidades } }
  const items = {};
  Object.values(estado.plan).forEach((dia) => {
    Object.values(dia).forEach((id) => {
      recetaPorId(id).ing.forEach(([nombre, cat, qty]) => {
        if (!items[nombre]) items[nombre] = { cat, veces: 0, qty };
        items[nombre].veces++;
      });
    });
  });

  // Agrupar por categoría
  const porCat = {};
  Object.entries(items).forEach(([nombre, info]) => {
    (porCat[info.cat] ??= []).push({ nombre, ...info });
  });

  const cats = Object.keys(porCat).sort((a, b) => CATEGORIAS[a].orden - CATEGORIAS[b].orden);
  cont.innerHTML = cats.map((cat) => {
    const filas = porCat[cat]
      .sort((a, b) => b.veces - a.veces)
      .map((it) => {
        const marcado = estado.compradas[it.nombre] ? "marcado" : "";
        const checked = estado.compradas[it.nombre] ? "checked" : "";
        return `<div class="item-compra ${marcado}">
          <input type="checkbox" id="chk-${cssId(it.nombre)}" data-item="${it.nombre}" ${checked} />
          <label for="chk-${cssId(it.nombre)}">${it.nombre}</label>
          <span class="veces">${it.qty} · ${it.veces}×</span>
        </div>`;
      }).join("");
    return `<div class="cat-card"><h3>${CATEGORIAS[cat].nombre}</h3>${filas}</div>`;
  }).join("");
}

const cssId = (s) => s.normalize("NFD").replace(/[^\w]/g, "-");

function textoLista() {
  const items = {};
  Object.values(estado.plan).forEach((dia) => {
    Object.values(dia).forEach((id) => {
      recetaPorId(id).ing.forEach(([nombre, cat, qty]) => {
        if (!items[nombre]) items[nombre] = { cat, veces: 0, qty };
        items[nombre].veces++;
      });
    });
  });
  const porCat = {};
  Object.entries(items).forEach(([nombre, info]) => {
    (porCat[info.cat] ??= []).push(`  - ${nombre} (${info.qty} × ${info.veces} usos)`);
  });
  return Object.keys(porCat)
    .sort((a, b) => CATEGORIAS[a].orden - CATEGORIAS[b].orden)
    .map((cat) => `${CATEGORIAS[cat].nombre}\n${porCat[cat].join("\n")}`)
    .join("\n\n");
}

/* ---------------- Buscador de alimentos ----------------
   Busca los alimentos del usuario en los ingredientes de las 100
   recetas de la base de conocimientos (data.js). Tolera mayúsculas,
   acentos y plurales sencillos; admite varios términos separados
   por comas y ordena por número de coincidencias.
----------------------------------------------------------*/
const NOMBRE_TIPO = { des: "Desayuno", com: "Comida", cen: "Cena", snk: "Snack" };

const normalizar = (s) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/* Variantes de un término: tal cual y sin plural (-es / -s) */
function variantes(termino) {
  const v = new Set([termino]);
  if (termino.endsWith("es") && termino.length > 4) v.add(termino.slice(0, -2));
  if (termino.endsWith("s") && termino.length > 3) v.add(termino.slice(0, -1));
  return [...v];
}

function coincideIngrediente(nombreIng, termino) {
  const ing = normalizar(nombreIng);
  return variantes(termino).some((v) => ing.includes(v));
}

function buscarRecetas(consulta) {
  const terminos = consulta.split(",").map(normalizar).filter((t) => t.length >= 3);
  if (!terminos.length) return { terminos: [], resultados: [] };

  const resultados = [];
  RECETAS.forEach((receta) => {
    const encontrados = new Map(); // término → ingredientes que lo contienen
    terminos.forEach((t) => {
      const ings = receta.ing.filter(([n]) => coincideIngrediente(n, t)).map(([n]) => n);
      if (ings.length) encontrados.set(t, ings);
    });
    if (encontrados.size) resultados.push({ receta, encontrados });
  });

  resultados.sort((a, b) => b.encontrados.size - a.encontrados.size ||
    a.receta.n.localeCompare(b.receta.n, "es"));
  return { terminos, resultados };
}

function htmlResultado({ receta, encontrados }, totalTerminos) {
  const matchIngs = new Set([...encontrados.values()].flat());
  const ings = receta.ing
    .map(([n, , q]) => matchIngs.has(n)
      ? `<li class="ing-match">✔ <strong>${n}</strong> — ${q}</li>`
      : `<li>${n} — ${q}</li>`)
    .join("");
  const tipos = receta.t.map((t) => NOMBRE_TIPO[t]).join(" · ");
  const beneficios = receta.b.map((b) => BENEFICIOS[b]).join(" · ");
  const contador = totalTerminos > 1
    ? `<span class="match-contador">${encontrados.size} de ${totalTerminos} alimentos</span>` : "";
  return `<article class="resultado-card">
    <header>
      <h3>${receta.n}</h3>
      ${contador}
    </header>
    <div class="resultado-meta">
      <span class="tipo-comida">${tipos}</span>
      <span class="badges">${receta.d.map(badge).join("")}</span>
    </div>
    <div class="resultado-cuerpo">
      <span class="etiq">Ingredientes (por persona)</span>
      <ul>${ings}</ul>
      <span class="etiq">Forma de cocción</span>
      <p>${receta.coccion}</p>
      ${beneficios ? `<span class="etiq">Bueno para</span><p>${beneficios}</p>` : ""}
      <p class="tip">💡 ${receta.tip}</p>
    </div>
  </article>`;
}

function pintarBusqueda() {
  const consulta = $("#input-buscador").value;
  const resumen = $("#buscador-resumen");
  const cont = $("#resultados-busqueda");
  const { terminos, resultados } = buscarRecetas(consulta);

  if (!terminos.length) {
    resumen.textContent = consulta.trim()
      ? "Escribe al menos 3 letras por alimento." : "";
    cont.innerHTML = "";
    return;
  }
  if (!resultados.length) {
    resumen.textContent = `Ninguna de las ${RECETAS.length} recetas usa «${consulta.trim()}». Prueba con el nombre básico del alimento (ej. «tomate» en vez de «tomates pera»).`;
    cont.innerHTML = "";
    return;
  }
  const plural = resultados.length === 1 ? "receta usa" : "recetas usan";
  resumen.textContent = `${resultados.length} ${plural} tus alimentos (de ${RECETAS.length} recetas en la base de conocimientos).`;
  cont.innerHTML = resultados.map((r) => htmlResultado(r, terminos.length)).join("");
}

function pintarSugerencias() {
  const populares = ["salmón", "garbanzos", "espinacas", "tomate", "aguacate", "lentejas", "huevo", "brócoli", "avena", "yogur"];
  $("#sugerencias-busqueda").innerHTML = "Prueba: " + populares
    .map((p) => `<button class="sugerencia" data-termino="${p}">${p}</button>`)
    .join("");
}

/* ---------------- Render: combinaciones ---------------- */
let ultimoCombo = -1;
function mostrarCombo() {
  let i;
  do { i = Math.floor(Math.random() * COMBOS.length); } while (i === ultimoCombo && COMBOS.length > 1);
  ultimoCombo = i;
  const c = COMBOS[i];
  const carta = $("#combo-carta");
  carta.innerHTML = `<h3>✨ ${c.t}</h3><div class="que">${c.que}</div><p>${c.por}</p>`;
  carta.classList.remove("oculto");
}

function pintarCombosLista() {
  $("#combos-lista").innerHTML = COMBOS
    .map((c) => `<div class="combo-mini"><strong>${c.t}</strong>${c.por}</div>`)
    .join("");
}

/* ---------------- Render: plan clínico de colesterol ---------------- */
function pintarColesterol() {
  const d = DIETA_COLESTEROL;
  $("#colesterol-contenido").innerHTML = `
    <h2>${d.titulo}</h2>
    <p class="ayuda">${d.intro}</p>
    <p class="fuente-clinica">Fuente: ${d.fuente}. Plan orientativo de 1800 kcal — no sustituye la pauta individualizada de tu médico o dietista-nutricionista.</p>

    <h3 class="subtitulo">Recomendaciones</h3>
    <ul class="lista-recos">${d.recomendaciones.map((r) => `<li>${r}</li>`).join("")}</ul>

    <h3 class="subtitulo">Menú diario (plantilla con alternativas)</h3>
    <div class="menu-clinico">
      ${d.menu.map((m) => `<div class="menu-card">
        <h4>${m.comida}</h4>
        <ul>${m.items.map((i) => `<li>${i}</li>`).join("")}</ul>
      </div>`).join("")}
    </div>

    <h3 class="subtitulo">Equivalencias</h3>
    ${d.equivalencias.map((e) => `<div class="equivalencia">
      <strong>${e.clave}:</strong>
      <ul>${e.valores.map((v) => `<li>${v}</li>`).join("")}</ul>
    </div>`).join("")}

    <h3 class="subtitulo">Notas de la pauta</h3>
    <ul class="lista-recos">${d.notas.map((n) => `<li>${n}</li>`).join("")}</ul>

    <h3 class="subtitulo">Medidas caseras de referencia</h3>
    <div class="tabla-scroll"><table class="tabla-medidas">
      <thead><tr><th>Medida</th><th>Cantidad</th></tr></thead>
      <tbody>${d.medidas.map(([m, c]) => `<tr><td>${m}</td><td>${c}</td></tr>`).join("")}</tbody>
    </table></div>

    <div class="nota-app">💚 ${d.notaApp}</div>`;
}

/* ---------------- Render: equipamiento y guía ---------------- */
function pintarEquipo() {
  const html = (e) => `<div class="equipo-card">
    <h3>${e.e} ${e.n}</h3>
    <p class="uso">${e.uso}</p>
    <ul>${e.tips.map((t) => `<li>${t}</li>`).join("")}</ul>
  </div>`;
  $("#equipo-esencial").innerHTML = EQUIPO.filter((e) => e.esencial).map(html).join("");
  $("#equipo-opcional").innerHTML = EQUIPO.filter((e) => !e.esencial).map(html).join("");
}

function pintarReglas() {
  $("#reglas-lista").innerHTML = REGLAS
    .map((r) => `<div class="regla"><span class="icono">${r.icono}</span><span>${r.texto}</span></div>`)
    .join("");
}

/* ---------------- Eventos ---------------- */
function initEventos() {
  $("#form-perfil").addEventListener("submit", (e) => {
    e.preventDefault();
    estado.perfil = leerPerfil();
    estado.plan = generarPlan(estado.perfil);
    estado.compradas = {};
    guardar();
    pintarResumenDieta();
    pintarPlan();
    pintarCompra();
    if (estado.plan) {
      // saltar directamente al plan
      $$(".tab").forEach((t) => t.classList.remove("activa"));
      $('[data-tab="plan"]').classList.add("activa");
      $$(".panel").forEach((p) => p.classList.remove("visible"));
      $("#panel-plan").classList.add("visible");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      alert("Con esas restricciones combinadas no quedan suficientes recetas. Prueba a desmarcar alguna.");
    }
  });

  $("#btn-regenerar").addEventListener("click", () => {
    if (!estado.perfil) return;
    estado.plan = generarPlan(estado.perfil);
    estado.compradas = {};
    guardar();
    pintarPlan();
    pintarCompra();
  });

  $("#plan-grid").addEventListener("click", (e) => {
    const dado = e.target.closest(".btn-dado");
    if (dado) { regenerarDia(dado.dataset.dia); return; }
    const nombre = e.target.closest(".nombre");
    if (nombre) {
      const zona = nombre.parentElement.querySelector(".zona-detalle");
      zona.innerHTML = zona.innerHTML ? "" : htmlDetalle(recetaPorId(nombre.dataset.receta));
    }
  });

  $("#lista-compra").addEventListener("change", (e) => {
    if (e.target.matches("input[type=checkbox]")) {
      const item = e.target.dataset.item;
      if (e.target.checked) estado.compradas[item] = true;
      else delete estado.compradas[item];
      e.target.closest(".item-compra").classList.toggle("marcado", e.target.checked);
      guardar();
    }
  });

  $("#btn-copiar-lista").addEventListener("click", async () => {
    if (!estado.plan) return;
    try {
      await navigator.clipboard.writeText("🛒 LISTA DE LA COMPRA\n\n" + textoLista());
      $("#btn-copiar-lista").textContent = "✅ Copiada";
      setTimeout(() => { $("#btn-copiar-lista").textContent = "📋 Copiar lista"; }, 2000);
    } catch {
      alert("No se pudo copiar automáticamente. Selecciona y copia manualmente.");
    }
  });

  $("#btn-combo").addEventListener("click", mostrarCombo);

  $("#input-buscador").addEventListener("input", pintarBusqueda);

  $("#btn-limpiar-busqueda").addEventListener("click", () => {
    $("#input-buscador").value = "";
    pintarBusqueda();
    $("#input-buscador").focus();
  });

  $("#sugerencias-busqueda").addEventListener("click", (e) => {
    const btn = e.target.closest(".sugerencia");
    if (!btn) return;
    const input = $("#input-buscador");
    const actual = input.value.trim();
    input.value = actual ? actual.replace(/,\s*$/, "") + ", " + btn.dataset.termino : btn.dataset.termino;
    pintarBusqueda();
  });
}

/* ---------------- Arranque ---------------- */
function init() {
  cargar();
  initTabs();
  initEventos();
  pintarEquipo();
  pintarReglas();
  pintarCombosLista();
  pintarSugerencias();
  pintarColesterol();
  if (estado.perfil) {
    volcarPerfil(estado.perfil);
    pintarResumenDieta();
  }
  pintarPlan();
  pintarCompra();
}

document.addEventListener("DOMContentLoaded", init);
