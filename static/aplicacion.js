// ======= UTILIDADES =======
// pad2 CONVIERTE UN NUMERO A 2 DIGITOS 2 -> 02
function pad2(n){return n.toString().padStart(2,"0")}
//pad3 CONVIERTE UN NUMERO A 3 DIGITOS 2 -> 002
function pad3(n){return n.toString().padStart(3,"0")}
// transforma un tiempo en milisegundos a formato
function aTexto(ms){
  const s = Math.floor(ms/1000), m = Math.floor(s/60);
  return `${pad2(m)}:${pad2(s%60)}.${pad3(ms%1000)}`
}

// ======= ESTADO =======
let en_marcha = false;
// Marca inicio del cronometro (sincronización con servidor)
let tiempo_inicio_utc = null;       // ya no lo usamos para pintar, pero lo mantenemos por si lo quieres registrar
// referencia al requestAnimationFrame
let raf = null;

// base local para medir tiempo sin saltos
let baseClienteMs = null;           // Date.now() en el momento de iniciar
let tiempo_acumulado_ms = 0;        // tiempo acumulado al pausar/reanudar

// ======= ELEMENTOS (IDs deben existir en el HTML) =======
const txtReloj = document.getElementById("texto_reloj");
const txtEstado = document.getElementById("texto_estado");
const btnIniciar = document.getElementById("boton_iniciar");
const btnDetener = document.getElementById("boton_detener");
const btnReiniciar = document.getElementById("boton_reiniciar");
const inputFolio = document.getElementById("entrada_folio");
const btnAgregar = document.getElementById("boton_agregar");
const cuerpo = document.getElementById("cuerpo_registros");

// Constante para evento en tiempo real
// const evtSource = new EventSource("/stream");

// ======= FUNCIONES =======
// Actualiza el estado en la interfaz: mensaje de estado y boton iniciar
function renderEstado(){
  txtEstado.textContent = en_marcha ? "Cronómetro en marcha" : "Listo";
  btnIniciar.textContent = en_marcha ? "Iniciado" : "Iniciar";
  btnIniciar.disabled = en_marcha;
}

// Evento para hacerlo en tiempo real
/*
  const evtSource = new EventSource("/stream");
evtSource.onmessage = function(e) {
    const data = JSON.parse(e.data);
    if (data.evento === "iniciar") {
        iniciarCronometro(data.tiempo_inicio);
    }
};
*/

//Calcula los milisegundos transcurridos.
//Si está pausado devuele lo acumulado, si está corriendo suma lo actual.
function msTranscurridos(){
  if (!en_marcha) return tiempo_acumulado_ms;
  return tiempo_acumulado_ms + (Date.now() - baseClienteMs);
}

// en iniciar:
baseCliente = Date.now();

//Actualiza el reloj en pantalla usando el requestAnimationFrame
function loop(){
  txtReloj.textContent = aTexto(msTranscurridos());
  raf = requestAnimationFrame(loop);
}

//Aranca la animación del reloj (y cancela si había otra corriendo)
function iniciarAnim(){
  if (raf) cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}


// ======= CARGA INICIAL =======
async function cargarEstado(){
  const r = await fetch("/api/estado");
  const d = await r.json();

  // Aunque el server diga en_marcha, no arranca visualmente hasta que se presione Iniciar.
  en_marcha = false;
  tiempo_inicio_utc = null;
  tiempo_acumulado_ms = 0;
  renderEstado();
}

//Carga la tabla de registros desde el servidor y se agrega en HTML
async function cargarRegistros(q=""){
  const url = q ? `/api/registros?q=${encodeURIComponent(q)}` : "/api/registros";
  const r = await fetch(url);
  const d = await r.json();
  cuerpo.innerHTML = "";
  for(const reg of d.registros || []){
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${reg.id_registro}</td>
      <td class="fw-semibold">${reg.folio}</td>
      <td><span class="badge bg-primary-subtle text-primary-emphasis">${reg.tiempo_texto}</span></td>
      <td><small class="text-muted">${new Date(reg.capturado_en).toLocaleTimeString()}</small></td>`;
    cuerpo.appendChild(tr);
  }
}

// ======= EVENTOS =======
btnIniciar.addEventListener("click", async () => {
  try {
    //Llamar al backend para iniciar cronometro
    const r = await fetch("/api/iniciar", { method: "POST" });
    if (!r.ok) { alert("Error al iniciar ("+r.status+")"); return; }
    const d = await r.json();

    // ANCLA LOCAL: empezamos a contar desde el reloj del cliente
    baseClienteMs = Date.now();
    en_marcha = true;

    // (opcional) guarda por si te sirve la marca del server
    if (d.tiempo_inicio) tiempo_inicio_utc = new Date(d.tiempo_inicio);

    renderEstado();
    iniciarAnim();
  } catch (e) {
    console.error(e);
    alert("No se pudo contactar al servidor.");
  }
});

btnDetener.addEventListener("click", () => {
  if (!en_marcha) return;
  // acumula lo transcurrido hasta ahora
  tiempo_acumulado_ms = msTranscurridos();
  en_marcha = false;
  baseClienteMs = null;
  if (raf) cancelAnimationFrame(raf);
  renderEstado();
});


btnReiniciar.addEventListener("click", async ()=>{
  //False para que dar clic al reiniciar aparezca como "si no hubiera iniciado"
  en_marcha = false;
  baseClienteMs = null;
  tiempo_acumulado_ms = 0;
  tiempo_inicio_utc = null;
  renderEstado();
  txtReloj.textContent="00:00.000";
  cargarRegistros();
});


btnAgregar.addEventListener("click", async ()=>{
  //Toma el folio escrito en el input
  const folio = (inputFolio.value||"").trim();
  if(!folio){ inputFolio.focus(); return; }

  // tomar el tiempo que ve el usuario en el cronómetro
  const ms = msTranscurridos();
  const tiempo_texto = aTexto(ms);
  
  //Para registrar el tiempo actual en el servidor
  const r = await fetch("/api/registrar", {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ folio, tiempo_ms: ms, tiempo_texto })
  });
  //Refrescar la tabla
  const d = await r.json();
  if(d.error){ alert(d.error); return; }
  inputFolio.select();
  cargarRegistros();
});


inputFolio.addEventListener("keydown", (e)=>{
  if(e.key==="Enter"){ e.preventDefault(); btnAgregar.click(); }
});

//DOCUMENTO EN FORMATO CSV
document.getElementById("boton_csv").addEventListener("click", function () {
    fetch("/api/registros")
        .then(response => response.json())
        .then(data => {
            const registros = data.registros || [];

            if (registros.length === 0) {
                alert("No hay registros para exportar.");
                return;
            }

            // Encabezados del CSV
            let csv = "ID,Folio,Tiempo,Capturado\n";

            // Recorremos los registros
            registros.forEach(r => {
                csv += `${r.id_registro},${r.folio},${r.tiempo_texto},${r.capturado_en}\n`;
            });

            // Crear blob CSV
            const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
            const url = URL.createObjectURL(blob);

            // Crear enlace de descarga
            const link = document.createElement("a");
            link.setAttribute("href", url);
            link.setAttribute("download", "registros.csv");
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        })
        .catch(err => {
            console.error("Error al generar CSV:", err);
        });
});


// ======= ARRANQUE =======
(async function(){
  await cargarEstado();
  await cargarRegistros();
})();