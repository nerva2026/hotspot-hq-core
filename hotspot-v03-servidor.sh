#!/usr/bin/env bash
# HOT SPOT S.L. · oficina v0.3 · lo IMPRESCINDIBLE en el servidor (servicio «tareas», su carpeta de datos y la subida del archivo).
#
#   bash hotspot-v03-servidor.sh             EN SECO: solo comprueba y cuenta qué haría. No cambia nada.
#   bash hotspot-v03-servidor.sh --aplicar   Lo hace. Se puede repetir: lo que ya está hecho se salta.
#
# No lleva contraseñas ni claves. Antes de cambiar un archivo hace una copia «<archivo>.antes-<fecha>».
set -u

# ===== HUECOS: lo que puede cambiar una persona (aquí están los valores del servidor de siempre) ============
RUTA_TAREAS="${RUTA_TAREAS:-/opt/hotspot-tareas}"   # servicio «tareas»: docker-compose.yaml, .env y datos/
RUTA_WA="${RUTA_WA:-/opt/workadventure}"            # WorkAdventure (docker-compose.yaml con Traefik)
DOMINIO="${DOMINIO:-oficina.hot-spot.es}"           # para las comprobaciones desde fuera
ORIGEN_WEB="${ORIGEN_WEB:-https://$DOMINIO}"        # (solo para probar este guion fuera del servidor)
SERVICIO_TAREAS="${SERVICIO_TAREAS:-tareas}"        # nombre del servicio en su docker-compose.yaml
SERVICIO_PLAY="${SERVICIO_PLAY:-play}"              # nombre del servicio «play» en el de WorkAdventure
LIMITE_SUBIDA_MB="${LIMITE_SUBIDA_MB:-30}"          # lo que debe dejar pasar Traefik (el archivo admite 25 MB por documento)
ESPACIO_MINIMO_GB="${ESPACIO_MINIMO_GB:-2}"         # libre en datos/ (el archivo puede crecer hasta 1 GB entre todos)
COMPROBAR_RED="${COMPROBAR_RED:-1}"                 # 0 = no pedir páginas a la web (para probar sin red)
REINICIAR="${REINICIAR:-1}"                         # 0 = al aplicar, no descargar ni reiniciar (ya lo hace el cron de cada 5 minutos)
# ===========================================================================================================

MODO="en seco"
for arg in "$@"; do
  case "$arg" in
    --aplicar) MODO="aplicar" ;;
    --en-seco) MODO="en seco" ;;
    -h | --help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "No entiendo «$arg». Usa --en-seco (lo normal) o --aplicar."; exit 2 ;;
  esac
done

N_OK=0; N_AVISO=0; N_FALLO=0
ok()     { N_OK=$((N_OK + 1));       printf '  [ok]     %s\n' "$*"; }
aviso()  { N_AVISO=$((N_AVISO + 1)); printf '  [AVISO]  %s\n' "$*"; }
falla()  { N_FALLO=$((N_FALLO + 1)); printf '  [FALLA]  %s\n' "$*"; }
hecho()  { printf '  [hecho]  %s\n' "$*"; }
haria()  { printf '  [haría]  %s\n' "$*"; }
titulo() { printf '\n== %s\n' "$*"; }

# accion "qué hace" orden…  → al aplicar la ejecuta; en seco solo dice que la haría
accion() {
  local texto="$1"
  shift
  if [ "$MODO" = "aplicar" ]; then
    if "$@"; then hecho "$texto"; else falla "$texto (ha fallado)"; fi
  else
    haria "$texto"
  fi
}

dc_tareas() { (cd "$RUTA_TAREAS" && docker compose "$@"); }
dc_wa() { (cd "$RUTA_WA" && docker compose "$@"); }
compose_de() { local f; for f in docker-compose.yaml docker-compose.yml compose.yaml compose.yml; do [ -f "$1/$f" ] && { echo "$1/$f"; return 0; }; done; return 1; }

echo "HOT SPOT S.L. · v0.3 · servidor · modo: $MODO"

# ---------------------------------------------------------------------------------------------------------
titulo "1. Lo que hay en el servidor"
[ "$(id -u)" = "0" ] || aviso "No eres root: algunas comprobaciones (permisos, docker) pueden fallar. Usa «sudo bash …»."
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
  ok "docker compose está"
  HAY_DOCKER=1
else
  falla "No encuentro «docker compose»."
  HAY_DOCKER=0
fi
COMPOSE_T="$(compose_de "$RUTA_TAREAS")" && ok "servicio tareas: $COMPOSE_T" || { COMPOSE_T=""; falla "No encuentro el docker-compose.yaml del servicio tareas en $RUTA_TAREAS"; }
COMPOSE_WA="$(compose_de "$RUTA_WA")" && ok "WorkAdventure: $COMPOSE_WA" || { COMPOSE_WA=""; falla "No encuentro el docker-compose.yaml de WorkAdventure en $RUTA_WA"; }
ENV_T="$RUTA_TAREAS/.env"
DATOS="$RUTA_TAREAS/datos"
[ -f "$ENV_T" ] && ok ".env de tareas: $ENV_T" || falla "Falta $ENV_T"
[ -d "$DATOS" ] && ok "carpeta de datos: $DATOS" || falla "Falta la carpeta de datos $DATOS"
if [ -f "$ENV_T" ]; then
  modo_env="$(stat -c %a "$ENV_T")"
  if [ "$modo_env" = "600" ]; then
    ok ".env con permisos 600 (lleva claves)"
  else
    aviso ".env tiene permisos $modo_env y debe tener 600 (lleva claves)"
    accion "poner permisos 600 al .env" chmod 600 "$ENV_T"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
titulo "2. Carpeta de datos (cumpleaños, personajes, pizarra, archivo, música y tiques se guardan ahí)"
UID_C=1000; GID_C=1000   # el usuario «node» de la imagen de tareas
EN_MARCHA=""
[ "$HAY_DOCKER" = "1" ] && [ -n "$COMPOSE_T" ] && EN_MARCHA="$(dc_tareas ps -q "$SERVICIO_TAREAS" 2> /dev/null)"
if [ -n "$EN_MARCHA" ]; then
  u="$(dc_tareas exec -T "$SERVICIO_TAREAS" id -u 2> /dev/null | tr -d '\r')"
  g="$(dc_tareas exec -T "$SERVICIO_TAREAS" id -g 2> /dev/null | tr -d '\r')"
  [ -n "$u" ] && UID_C="$u"
  [ -n "$g" ] && GID_C="$g"
  if dc_tareas exec -T "$SERVICIO_TAREAS" sh -c 'test -w /datos' > /dev/null 2>&1; then
    ok "el contenedor (usuario $UID_C:$GID_C) puede escribir en /datos"
  else
    falla "el contenedor (usuario $UID_C:$GID_C) NO puede escribir en /datos: el archivo, la pizarra y la música no podrían guardar nada"
    [ -d "$DATOS" ] && accion "dar la carpeta de datos a $UID_C:$GID_C (chown -R)" chown -R "$UID_C:$GID_C" "$DATOS"
  fi
else
  aviso "tareas no está en marcha ahora: no puedo preguntarle con qué usuario escribe; cuento con el «node» de su imagen ($UID_C:$GID_C)"
  if [ -d "$DATOS" ]; then
    dueno="$(stat -c %u:%g "$DATOS")"
    if [ "$dueno" = "$UID_C:$GID_C" ]; then
      ok "datos/ es de $dueno"
    else
      aviso "datos/ es de $dueno y el contenedor corre como $UID_C:$GID_C: si no puede escribir, ejecuta esto con el servicio en marcha"
    fi
  fi
fi
# Las subcarpetas las crea el propio servicio al arrancar; crearlas ya, con su dueño, evita sorpresas (no pisa nada).
if [ -d "$DATOS" ]; then
  for sub in archivo archivo/archivos archivo/copias pizarra tiques; do
    if [ -d "$DATOS/$sub" ]; then
      ok "datos/$sub ya existe"
    else
      accion "crear datos/$sub (dueño $UID_C:$GID_C)" install -d -m 755 -o "$UID_C" -g "$GID_C" "$DATOS/$sub"
    fi
  done
  libre_gb=$(($(df -Pk "$DATOS" | awk 'NR==2 {print $4}') / 1024 / 1024))
  if [ "$libre_gb" -ge "$ESPACIO_MINIMO_GB" ]; then
    ok "espacio libre en el disco de datos/: unos $libre_gb GB (el archivo admite hasta 1 GB entre todos los documentos)"
  else
    aviso "solo quedan unos $libre_gb GB libres en el disco de datos/ (mínimo recomendado: $ESPACIO_MINIMO_GB GB)"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
titulo "3. Límite de subida: el archivo admite 25 MB por documento (aquí se pide dejar pasar $LIMITE_SUBIDA_MB MB)"
LIMITE_B=$((LIMITE_SUBIDA_MB * 1024 * 1024))
hallados=0
for carpeta in "$RUTA_WA" "$RUTA_TAREAS"; do
  [ -d "$carpeta" ] || continue
  while IFS= read -r f; do
    while IFS= read -r linea; do
      [ -n "$linea" ] || continue
      hallados=$((hallados + 1))
      numero="$(printf '%s' "$linea" | grep -oiE 'maxRequestBodyBytes[^0-9]*[0-9]+' | grep -oE '[0-9]+$' | head -n 1)"
      if [ -z "$numero" ]; then
        aviso "$f: «$(printf '%s' "$linea" | sed 's/^ *//')» ¿limita el tamaño de lo que se sube? Míralo"
      elif [ "$numero" -ge "$LIMITE_B" ]; then
        ok "$f: Traefik deja pasar hasta $((numero / 1024 / 1024)) MB"
      elif [ "$carpeta" = "$RUTA_TAREAS" ] || printf '%s' "$linea" | grep -qi tareas; then
        falla "$f: Traefik solo deja pasar $((numero / 1024 / 1024)) MB en tareas. Cambia ese número a $LIMITE_B ($LIMITE_SUBIDA_MB MB) y ejecuta «docker compose up -d» en la carpeta de ese archivo (a mano: depende de dónde esté la etiqueta)"
      else
        aviso "$f: un middleware limita la subida a $((numero / 1024 / 1024)) MB. Si lo usa la ruta /tareas, cambia ese número a $LIMITE_B ($LIMITE_SUBIDA_MB MB) y ejecuta «docker compose up -d» en la carpeta de ese archivo; si es de otra cosa, déjalo"
      fi
    done < <(grep -nE 'maxRequestBodyBytes|middlewares\..*buffering' "$f" 2> /dev/null)
    while IFS= read -r linea; do
      [ -n "$linea" ] && aviso "$f: pone un tiempo máximo de lectura («$(printf '%s' "$linea" | sed 's/^ *//')»): con mala conexión, una subida de 25 MB podría cortarse"
    done < <(grep -nE 'readTimeout' "$f" 2> /dev/null)
  done < <(find "$carpeta" -maxdepth 3 \( -name '*.yaml' -o -name '*.yml' -o -name '*.toml' \) -not -path '*/datos/*' 2> /dev/null)
done
if [ "$hallados" -eq 0 ]; then
  ok "Traefik no limita lo que se sube (no hay ningún middleware «buffering» con tamaño máximo)"
fi
echo "  (Si delante de Traefik hubiera otro proxy, como Cloudflare, su límite también cuenta: el gratuito deja 100 MB, de sobra.)"

# ---------------------------------------------------------------------------------------------------------
titulo "4. Variables del .env de tareas (solo se mira qué nombres hay; los valores no se enseñan)"
tiene() { [ -f "$ENV_T" ] && grep -qE "^$1=.+" "$ENV_T"; }
for v in GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET OIDC_SECRETO TAREAS_URL; do
  if tiene "$v"; then ok "$v puesta"; else aviso "$v no está en el .env (ya hacía falta antes de la v0.3: si Google funciona, quizá la lleve el compose directamente)"; fi
done
if tiene TAREAS_ZONA; then ok "TAREAS_ZONA puesta"; else ok "TAREAS_ZONA sin poner: «hoy» y los cumpleaños cuentan en Europe/Madrid (lo normal)"; fi
if tiene ARCHIVO_MAXIMO_MB; then ok "ARCHIVO_MAXIMO_MB puesta"; else ok "ARCHIVO_MAXIMO_MB sin poner: el archivo admite hasta 1024 MB entre todos los documentos (lo normal)"; fi
if tiene SPOTIFY_CLIENT_ID && tiene SPOTIFY_CLIENT_SECRET; then
  ok "SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET puestas"
else
  aviso "Spotify sin configurar: la cabina dirá «Falta conectar Spotify». No impide publicar: es lo único que falta para la música (guion hotspot-v03-musica.sh)"
fi
if [ -n "$COMPOSE_T" ]; then
  if grep -qE '^[[:space:]]*env_file[[:space:]]*:' "$COMPOSE_T"; then
    ok "el compose lee el .env entero (env_file): las variables que se añadan llegan solas"
  elif grep -qE '^[[:space:]]*environment[[:space:]]*:' "$COMPOSE_T"; then
    aviso "el compose lista las variables una a una (environment:): ARCHIVO_MAXIMO_MB, TAREAS_ZONA y SPOTIFY_* solo llegarían al servicio si se añaden también ahí"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
titulo "5. Imágenes nuevas y reinicio (el cron de cada 5 minutos ya lo hace solo; esto solo lo adelanta)"
reiniciar_tareas() { dc_tareas pull "$SERVICIO_TAREAS" && dc_tareas up -d; }
reiniciar_play() { dc_wa pull "$SERVICIO_PLAY" && dc_wa up -d "$SERVICIO_PLAY"; }
if [ "$REINICIAR" = "1" ] && [ "$HAY_DOCKER" = "1" ]; then
  [ -n "$COMPOSE_T" ] && accion "descargar la imagen de tareas y reiniciarlo: cd $RUTA_TAREAS && docker compose pull $SERVICIO_TAREAS && docker compose up -d" reiniciar_tareas
  [ -n "$COMPOSE_WA" ] && accion "descargar la imagen de play y reiniciarlo: cd $RUTA_WA && docker compose pull $SERVICIO_PLAY && docker compose up -d $SERVICIO_PLAY (quien esté dentro de la oficina se reconecta solo)" reiniciar_play
else
  echo "  (no se descarga ni se reinicia nada: REINICIAR=$REINICIAR)"
fi
if [ "$MODO" = "aplicar" ] && [ "$REINICIAR" = "1" ] && [ "$HAY_DOCKER" = "1" ] && [ -n "$COMPOSE_T" ]; then
  sano=""
  for _ in $(seq 1 30); do
    id_c="$(dc_tareas ps -q "$SERVICIO_TAREAS" 2> /dev/null)"
    [ -n "$id_c" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$id_c" 2> /dev/null)" = "healthy" ] && { sano=1; break; }
    sleep 2
  done
  if [ -n "$sano" ]; then ok "tareas está sano (healthy)"; else aviso "tareas no ha llegado a «healthy» en 1 minuto: mira «cd $RUTA_TAREAS && docker compose logs --tail 50 $SERVICIO_TAREAS»"; fi
fi

# ---------------------------------------------------------------------------------------------------------
titulo "6. Comprobar desde fuera ($ORIGEN_WEB): lo que contesta ya, sin entrar con cuenta"
if [ "$COMPROBAR_RED" = "1" ] && command -v curl > /dev/null 2>&1; then
  esperado() { # esperado ruta código «qué dice si es otro»
    local c
    c="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$ORIGEN_WEB$1" 2> /dev/null)" || c="000"
    if [ "$c" = "$2" ]; then ok "$1 → $c"; else aviso "$1 → $c (se esperaba $2: $3)"; fi
  }
  esperado /tareas/salud 200 "el servicio tareas no contesta"
  esperado /tareas/api/yo/personaje 401 "401 es lo normal sin sesión; 404 = todavía la imagen antigua de tareas (parche 10 y cumpleaños)"
  esperado /tareas/api/archivo 401 "401 es lo normal sin sesión; 404 = todavía la imagen antigua (sin archivo)"
  esperado /tareas/api/musica 401 "401 es lo normal sin sesión; 404 = todavía la imagen antigua (sin música)"
  esperado /tareas/musica/mini/ 200 "el reproductor pequeño del botón «Música»"
  esperado /tareas/oficina/ 200 "el puente invisible del botón «Tareas» y los cumpleaños"
  esperado /tareas/pizarra/ 200 "la pizarra de reuniones"
  esperado /tareas/archivo/ 200 "el archivo"
  esperado /iframe_api.js 200 "lo sirve la oficina (play) y lo necesita el puente"
else
  echo "  (no se comprueba nada por la red)"
fi

# ---------------------------------------------------------------------------------------------------------
titulo "Resumen ($MODO)"
echo "  bien: $N_OK · avisos: $N_AVISO · fallos: $N_FALLO"
if [ "$MODO" != "aplicar" ]; then
  echo "  Esto ha sido EN SECO: no se ha cambiado nada. Si lo ves bien, repite con: bash $0 --aplicar"
fi
[ "$N_FALLO" -eq 0 ]
