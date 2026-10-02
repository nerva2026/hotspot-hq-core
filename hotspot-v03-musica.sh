#!/usr/bin/env bash
# HOT SPOT S.L. · oficina v0.3 · SOLO PARA LA MÚSICA (Spotify). Sin esto la oficina funciona igual: la cabina dice «Falta conectar Spotify».
#
#   bash hotspot-v03-musica.sh             EN SECO: comprueba y cuenta qué haría. No pregunta nada ni cambia nada.
#   bash hotspot-v03-musica.sh --aplicar   Pide el Client ID y el Client secret de Spotify (el secreto se teclea sin que se vea),
#                                          los pone en el .env de tareas (con copia antes) y reinicia tareas. Se puede repetir.
#   bash hotspot-v03-musica.sh --aplicar --cambiar   Igual, aunque ya estén puestas (para cambiar de aplicación de Spotify).
#
# Este archivo NO lleva claves. Si ya están en el entorno (SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET) las usa en vez de preguntar.
# Antes, una sola vez y a mano, hay que crear la aplicación en https://developer.spotify.com/dashboard (los pasos salen al final).
set -u
umask 077

# ===== HUECOS: los rellena una persona. Aquí NO hay ningún valor ============================================
#   SPOTIFY_CLIENT_ID      «Client ID» de la aplicación de Spotify      → se pide al aplicar (o se pasa en el entorno)
#   SPOTIFY_CLIENT_SECRET  «Client secret» de la aplicación de Spotify  → se pide al aplicar, tecleado sin que se vea
#   SPOTIFY_REDIRECT_URI   solo si la oficina no está en la dirección de siempre (por defecto sale de TAREAS_URL del .env)
RUTA_TAREAS="${RUTA_TAREAS:-/opt/hotspot-tareas}"   # servicio «tareas»: docker-compose.yaml y .env
SERVICIO_TAREAS="${SERVICIO_TAREAS:-tareas}"        # nombre del servicio en su docker-compose.yaml
DOMINIO="${DOMINIO:-oficina.hot-spot.es}"
# ===========================================================================================================

MODO="en seco"
CAMBIAR=0
for arg in "$@"; do
  case "$arg" in
    --aplicar) MODO="aplicar" ;;
    --en-seco) MODO="en seco" ;;
    --cambiar) CAMBIAR=1 ;;
    -h | --help) sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "No entiendo «$arg». Usa --en-seco (lo normal) o --aplicar."; exit 2 ;;
  esac
done

AHORA="$(date +%Y%m%d-%H%M%S)"
N_OK=0; N_AVISO=0; N_FALLO=0
ok()     { N_OK=$((N_OK + 1));       printf '  [ok]     %s\n' "$*"; }
aviso()  { N_AVISO=$((N_AVISO + 1)); printf '  [AVISO]  %s\n' "$*"; }
falla()  { N_FALLO=$((N_FALLO + 1)); printf '  [FALLA]  %s\n' "$*"; }
hecho()  { printf '  [hecho]  %s\n' "$*"; }
haria()  { printf '  [haría]  %s\n' "$*"; }
titulo() { printf '\n== %s\n' "$*"; }
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
compose_de() { local f; for f in docker-compose.yaml docker-compose.yml compose.yaml compose.yml; do [ -f "$1/$f" ] && { echo "$1/$f"; return 0; }; done; return 1; }

ENV_T="$RUTA_TAREAS/.env"
echo "HOT SPOT S.L. · v0.3 · música (Spotify) · modo: $MODO"

# ---------------------------------------------------------------------------------------------------------
titulo "1. Lo que hay"
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then ok "docker compose está"; HAY_DOCKER=1; else falla "No encuentro «docker compose»."; HAY_DOCKER=0; fi
COMPOSE_T="$(compose_de "$RUTA_TAREAS")" && ok "servicio tareas: $COMPOSE_T" || { COMPOSE_T=""; falla "No encuentro el docker-compose.yaml de tareas en $RUTA_TAREAS"; }
if [ -f "$ENV_T" ]; then
  ok ".env de tareas: $ENV_T"
  modo_env="$(stat -c %a "$ENV_T")"
  [ "$modo_env" = "600" ] || aviso ".env tiene permisos $modo_env y debe tener 600 (lleva claves); el guion hotspot-v03-servidor.sh lo arregla"
else
  falla "Falta $ENV_T"
fi
tiene() { [ -f "$ENV_T" ] && grep -qE "^$1=.+" "$ENV_T"; }
valor_de() { [ -f "$ENV_T" ] && grep -E "^$1=" "$ENV_T" | tail -n 1 | cut -d= -f2- | tr -d '"'"'"; }

# ---------------------------------------------------------------------------------------------------------
titulo "2. La dirección de vuelta que hay que dar de alta en Spotify"
URL_BASE="$(valor_de TAREAS_URL)"
[ -n "$URL_BASE" ] || { URL_BASE="https://$DOMINIO/tareas/"; aviso "TAREAS_URL no está en el .env: cuento con $URL_BASE"; }
REDIRECT="${SPOTIFY_REDIRECT_URI:-$(valor_de SPOTIFY_REDIRECT_URI)}"
[ -n "$REDIRECT" ] || REDIRECT="${URL_BASE%/}/api/musica/vuelta"
echo "  En Spotify («Redirect URIs») tiene que estar EXACTAMENTE esta, sin nada más:"
echo "      $REDIRECT"

# ---------------------------------------------------------------------------------------------------------
titulo "3. Las claves en el .env de tareas"
YA=0
if tiene SPOTIFY_CLIENT_ID && tiene SPOTIFY_CLIENT_SECRET; then YA=1; fi
if [ "$YA" = "1" ] && [ "$CAMBIAR" = "0" ]; then
  ok "SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET ya están en el .env: no hay nada que escribir (para cambiarlas: --aplicar --cambiar)"
else
  [ "$YA" = "1" ] && aviso "ya hay claves en el .env y se van a sustituir (--cambiar)"
  pedir() { # pedir NOMBRE «texto» secreto(0/1): usa lo que haya en el entorno; si no, pregunta
    local nombre="$1" texto="$2" secreto="$3" v=""
    [ -n "${!nombre:-}" ] && return 0
    [ -r /dev/tty ] || { falla "no hay terminal para preguntar $nombre: pásala en el entorno (export $nombre=…)"; return 1; }
    if [ "$secreto" = "1" ]; then read -rs -p "  $texto: " v < /dev/tty; echo; else read -r -p "  $texto: " v < /dev/tty; fi
    printf -v "$nombre" '%s' "$v"
  }
  parece_valido() { printf '%s' "$1" | grep -qE '^[A-Za-z0-9_-]{16,128}$'; }
  escribir_env() {
    local nuevo="$ENV_T.nuevo-$AHORA"
    cp -p "$ENV_T" "$ENV_T.antes-$AHORA" || return 1
    {
      grep -vE '^(SPOTIFY_CLIENT_ID|SPOTIFY_CLIENT_SECRET)=' "$ENV_T"
      printf 'SPOTIFY_CLIENT_ID=%s\n' "$SPOTIFY_CLIENT_ID"
      printf 'SPOTIFY_CLIENT_SECRET=%s\n' "$SPOTIFY_CLIENT_SECRET"
    } > "$nuevo" || return 1
    chmod --reference="$ENV_T" "$nuevo" && chown --reference="$ENV_T" "$nuevo" && mv "$nuevo" "$ENV_T"
  }
  if [ "$MODO" = "aplicar" ] && [ -f "$ENV_T" ]; then
    pedir SPOTIFY_CLIENT_ID "Client ID de Spotify" 0 && pedir SPOTIFY_CLIENT_SECRET "Client secret de Spotify (no se ve al teclear)" 1
    if [ -z "${SPOTIFY_CLIENT_ID:-}" ] || [ -z "${SPOTIFY_CLIENT_SECRET:-}" ]; then
      falla "faltan el Client ID o el Client secret: no se escribe nada"
    elif ! parece_valido "$SPOTIFY_CLIENT_ID" || ! parece_valido "$SPOTIFY_CLIENT_SECRET"; then
      falla "el Client ID o el Client secret no tienen pinta de serlo (letras y números, unos 32 caracteres, sin espacios ni comillas): revisa lo que has copiado. No se escribe nada"
    else
      accion "escribir SPOTIFY_CLIENT_ID y SPOTIFY_CLIENT_SECRET en $ENV_T (copia antes: $ENV_T.antes-$AHORA)" escribir_env
    fi
  else
    haria "pedir el Client ID y el Client secret de Spotify (el secreto sin que se vea) y escribirlos en $ENV_T con copia antes ($ENV_T.antes-<fecha>); no pregunto nada en seco"
  fi
fi
if [ -n "$COMPOSE_T" ]; then
  if grep -qE '^[[:space:]]*env_file[[:space:]]*:' "$COMPOSE_T"; then
    ok "el compose lee el .env entero (env_file): las claves llegan al servicio"
  elif grep -qE '^[[:space:]]*environment[[:space:]]*:' "$COMPOSE_T"; then
    aviso "el compose lista las variables una a una (environment:): añade estas dos líneas debajo, con la misma sangría que las otras, y repite: «- SPOTIFY_CLIENT_ID=\${SPOTIFY_CLIENT_ID}» y «- SPOTIFY_CLIENT_SECRET=\${SPOTIFY_CLIENT_SECRET}»"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
titulo "4. Reiniciar tareas para que lea las claves"
if [ "$HAY_DOCKER" = "1" ] && [ -n "$COMPOSE_T" ]; then
  accion "reiniciar tareas: cd $RUTA_TAREAS && docker compose up -d (solo lo vuelve a crear si algo ha cambiado)" dc_tareas up -d
  if [ "$MODO" = "aplicar" ]; then
    sano=""
    for _ in $(seq 1 30); do
      id_c="$(dc_tareas ps -q "$SERVICIO_TAREAS" 2> /dev/null)"
      [ -n "$id_c" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$id_c" 2> /dev/null)" = "healthy" ] && { sano=1; break; }
      sleep 2
    done
    [ -n "$sano" ] && ok "tareas está sano (healthy)" || aviso "tareas no ha llegado a «healthy» en 1 minuto: mira «cd $RUTA_TAREAS && docker compose logs --tail 50 $SERVICIO_TAREAS»"
  fi
  if [ -n "$(dc_tareas ps -q "$SERVICIO_TAREAS" 2> /dev/null)" ]; then
    if dc_tareas exec -T "$SERVICIO_TAREAS" sh -c 'test -n "$SPOTIFY_CLIENT_ID" && test -n "$SPOTIFY_CLIENT_SECRET"' > /dev/null 2>&1; then
      ok "el servicio tareas tiene las dos variables de Spotify (no se enseñan los valores)"
    else
      aviso "el servicio tareas todavía NO tiene las dos variables de Spotify (normal en seco o antes de ponerlas)"
    fi
  fi
fi

# ---------------------------------------------------------------------------------------------------------
titulo "Resumen ($MODO)"
echo "  bien: $N_OK · avisos: $N_AVISO · fallos: $N_FALLO"
[ "$MODO" = "aplicar" ] || echo "  Esto ha sido EN SECO: no se ha cambiado nada. Si lo ves bien, repite con: bash $0 --aplicar"
cat << TEXTO

Lo que NO se puede hacer desde aquí (a mano, una sola vez):
  1. https://developer.spotify.com/dashboard → «Create app» (nombre y descripción) y marca «Web API».
  2. En «Redirect URIs» pon exactamente: $REDIRECT
  3. En «User Management» añade el nombre y el correo de Spotify de cada persona del crew que vaya a pinchar
     (mientras la aplicación esté en modo de desarrollo, Spotify solo deja conectar esas cuentas y limita cuántas;
     para escuchar no hace falta estar dada de alta).
  4. Copia el «Client ID» y el «Client secret» de esa aplicación: son los que pide este guion.
  5. Cada persona que vaya a pinchar abre https://$DOMINIO/tareas/musica/ y pulsa «Conectar mi Spotify» una vez
     (se abre en una pestaña nueva).
TEXTO
[ "$N_FALLO" -eq 0 ]
