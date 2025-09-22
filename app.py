# Framework web, render de plantilla y utilidades HTTP/JSON.
# Con jsonify convierte diccionarios Python en JSON para responder al cliente
from flask import Flask, render_template, request, jsonify
from datetime import datetime, timezone
import threading

# Creando la appweb con flask
aplicacion = Flask(__name__)

# ESTADO EN MEMORIA (simple)
candado_estado = threading.Lock()
tiempo_inicio = None            # datetime UTC cuando se inició el cronómetro
lista_registros = []            # registros capturados
siguiente_id = 1                # consecutivo para id_registro
en_marcha= False                # (bandera del cronómetro)


# UTILIDADES
# RETORNAR "UTC" (objeto datetime consciente de zona)
def ahora_utc():
    return datetime.now(timezone.utc)

def formatear_milisegundos(ms: int) -> str:
    # CONVERTIR ms -> "02:03.456" (mm:ss.mmm)
    """
    Convierte milisegundos a texto mm:ss.mmm
    """
    total_segundos = ms // 1000
    minutos = total_segundos // 60
    segundos = total_segundos % 60
    milis = ms % 1000
    return f"{minutos:02d}:{segundos:02d}.{milis:03d}"

def calcular_transcurrido_ms(inicio: datetime, actual: datetime) -> int:
    # DIFERENCIA EN MS ENTRE DOS DATETIME (UTC)
    """
    Diferencia en milisegundos entre dos tiempos (UTC).
    """
    delta = actual - inicio
    return int(delta.total_seconds() * 1000)

# RUTA DE LA PAGINA A EJECUTAR
@aplicacion.get("/")
def pagina_inicio():
    return render_template("inicio.html")

# API: ESTADO DEL CRONÓMETRO
@aplicacion.get("/api/estado")
def api_estado():
    with candado_estado:
        return jsonify({
            "en_marcha": en_marcha,
            "tiempo_inicio": tiempo_inicio.isoformat() if tiempo_inicio else None,
            # hora_servidor se usa para comparar cliente <-> servidor
            "hora_servidor": ahora_utc().isoformat()
        })

# API: INICIAR / REINICIAR
@aplicacion.post("/api/iniciar")
def api_iniciar():
    global en_marcha, tiempo_inicio
    with candado_estado:
        en_marcha = True
        tiempo_inicio = ahora_utc()
    return jsonify({
        "iniciado_ahora": True,
        # Guardar hora de inicio 
        "tiempo_inicio": tiempo_inicio.isoformat(),
        "hora_servidor": ahora_utc().isoformat()
    })


@aplicacion.post("/api/reiniciar")
def api_reiniciar():
    global en_marcha, tiempo_inicio, lista_registros, siguiente_id
    with candado_estado:
        # Detiene cronometro
        en_marcha = False
        tiempo_inicio = None
        lista_registros = []
        # Para Reiniciar contador de id
        siguiente_id = 1
    return jsonify({"ok": True})

# API: REGISTRAR TIEMPO (FOLIO)
@aplicacion.post("/api/registrar")
def api_registrar():
    """
    Registra el tiempo actual para un folio sin detener el cronómetro.
    Cuerpo JSON: {"folio": "1234", "tiempo_ms": 12345, "tiempo_texto": "00:12.345"}
    """
    global lista_registros, siguiente_id
    datos = request.get_json(silent=True) or {}
    folio = str(datos.get("folio", "")).strip()
    tiempo_ms = datos.get("tiempo_ms")
    tiempo_texto = datos.get("tiempo_texto")

    if not folio:
        return jsonify({"error": "Folio requerido"}), 400
    if tiempo_ms is None or tiempo_texto is None:
        return jsonify({"error": "Tiempo no enviado por el cliente"}), 400

    with candado_estado:
        registro = {
            "id_registro": siguiente_id,
            "folio": folio,
            "tiempo_milisegundos": tiempo_ms,
            "tiempo_texto": tiempo_texto,
            "capturado_en": ahora_utc().isoformat()
        }
        lista_registros.append(registro)
        siguiente_id += 1

    return jsonify({"ok": True, "registro": registro})


# API: LISTAR REGISTROS
@aplicacion.get("/api/registros")
def api_registros():
    """
    Listar los registros, soporta filtro por ?q= (contenido del folio).
    """
    # Obtener el filtro q:
    consulta = (request.args.get("q") or "").strip().lower() # En la URL llamamos /api/registros?q=123, se busca el folio "123"
   
    with candado_estado:
        if consulta:
            filtrados = [r for r in lista_registros if consulta in r["folio"].lower()]
        else:
            filtrados = list(lista_registros)
            
    # Ordenamiento por id_registro
    # Es un ordenamiento visto como fortmato JSON
    filtrados.sort(key=lambda r: r["id_registro"])
    
    return jsonify({"registros": filtrados})

if __name__ == "__main__":
    # Desarrollo: http://127.0.0.1:5000
    aplicacion.run(debug=True, host="0.0.0.0", port=5000)