#!/usr/bin/env bash
# HOT SPOT S.L. · oficina v0.3.1 · LAS CONVERSACIONES: a qué distancia se forma un corro, cuánto mide y cuánta gente cabe en él.
#
#   bash hotspot-v031-conversaciones.sh              EN SECO: solo comprueba y cuenta qué haría. No cambia nada.
#   bash hotspot-v031-conversaciones.sh --aplicar    Lo hace. Se puede repetir: lo que ya está hecho se salta.
#   bash hotspot-v031-conversaciones.sh --deshacer   VUELVE a los valores de serie de WorkAdventure (64, 48 y 4). Lo hace de verdad.
#   bash hotspot-v031-conversaciones.sh --deshacer --en-seco    Cuenta qué haría al deshacer, sin cambiar nada.
#
# Con otros valores, sin tocar este archivo (los más prudentes):
#   MINIMUM_DISTANCE=96 GROUP_RADIUS=96 MAX_PER_GROUP=6 bash hotspot-v031-conversaciones.sh --aplicar
#
# Qué toca: tres líneas del .env de WorkAdventure (antes hace una copia «.env.antes-<fecha>») y vuelve a crear SOLO los
# contenedores «back» y «play», que son los que las leen. Quien esté dentro de la oficina se reconecta solo en un momento, pero
# la llamada que tuviera se corta: mejor a una hora tranquila. No lleva contraseñas ni claves, y del .env solo enseña esas tres líneas.
set -u
umask 077

VALORES_DADOS="${MINIMUM_DISTANCE:+MINIMUM_DISTANCE=$MINIMUM_DISTANCE }${GROUP_RADIUS:+GROUP_RADIUS=$GROUP_RADIUS }${MAX_PER_GROUP:+MAX_PER_GROUP=$MAX_PER_GROUP }"   # lo que se haya pasado al llamar

# ===== HUECOS: lo que puede cambiar una persona (aquí están los valores recomendados y el servidor de siempre) ==============
# Las tres medidas van en píxeles del mapa (una casilla son 32):
MINIMUM_DISTANCE="${MINIMUM_DISTANCE:-120}"   # al pararse a esta distancia o menos de otra persona libre, se forma un corro (y es el radio del aro que se dibuja)
GROUP_RADIUS="${GROUP_RADIUS:-112}"           # se entra en un corro al pararse a esta distancia o menos de su centro; se sale al alejarse más
MAX_PER_GROUP="${MAX_PER_GROUP:-8}"           # personas como mucho en un corro (sin LiveKit, cada navegador se conecta con todos los demás)
RUTA_WA="${RUTA_WA:-/opt/workadventure}"      # WorkAdventure: docker-compose.yaml y .env
SERVICIO_BACK="${SERVICIO_BACK:-back}"        # nombre del servicio «back» en ese docker-compose.yaml (lee las tres)
SERVICIO_PLAY="${SERVICIO_PLAY:-play}"        # nombre del servicio «play» (lee MINIMUM_DISTANCE y MAX_PER_GROUP: el dibujo del corro)
DOMINIO="${DOMINIO:-oficina.hot-spot.es}"     # para comprobar al final que la oficina responde
ORIGEN_WEB="${ORIGEN_WEB:-https://$DOMINIO}"  # (solo para probar este guion fuera del servidor)
COMPROBAR_RED="${COMPROBAR_RED:-1}"           # 0 = no pedir páginas a la web (para probar sin red)
REINICIAR="${REINICIAR:-1}"                   # 0 = cambiar el .env y NO reiniciar (los contenedores siguen con lo de antes hasta que alguien los vuelva a crear)
ESPERA_S="${ESPERA_S:-120}"                   # segundos que se espera, como mucho, a que arranquen y a que la oficina conteste
PAUSA_S="${PAUSA_S:-3}"                       # segundos entre mirada y mirada mientras se espera
# ===========================================================================================================================
# Los valores de serie de WorkAdventure (back/src/Enum/EnvironmentVariableValidator.ts): a los que vuelve --deshacer.
SERIE_DISTANCIA=64
SERIE_RADIO=48
SERIE_MAXIMO=4

MODO="en seco"
DESHACER=0
EN_SECO_PEDIDO=0
for arg in "$@"; do
  case "$arg" in
    --aplicar) MODO="aplicar" ;;
    --en-seco) EN_SECO_PEDIDO=1 ;;
    --deshacer) DESHACER=1; MODO="aplicar" ;;
    -h | --help) sed -n '2,14p' "$0"; exit 0 ;;
    *) echo "No entiendo «$arg». Usa --en-seco (lo normal), --aplicar o --deshacer."; exit 2 ;;
  esac
done
[ "$EN_SECO_PEDIDO" = "1" ] && MODO="en seco"   # --en-seco gana siempre: con él no se cambia nada

if [ "$DESHACER" = "1" ]; then
  V_DISTANCIA="$SERIE_DISTANCIA"; V_RADIO="$SERIE_RADIO"; V_MAXIMO="$SERIE_MAXIMO"
else
  V_DISTANCIA="$MINIMUM_DISTANCE"; V_RADIO="$GROUP_RADIUS"; V_MAXIMO="$MAX_PER_GROUP"
fi
# Importante: si estas tres siguieran en el entorno, «docker compose» las preferiría a las del .env y el contenedor podría
# quedarse con un valor distinto del que se escribe. Desde aquí solo existen V_DISTANCIA, V_RADIO y V_MAXIMO.
unset MINIMUM_DISTANCE GROUP_RADIUS MAX_PER_GROUP

AHORA="$(date +%Y%m%d-%H%M%S)"
N_OK=0; N_AVISO=0; N_FALLO=0
PUEDE=1   # 0 = hay algo que impide cambiar nada (se cuenta y no se toca)
ok()     { N_OK=$((N_OK + 1));       printf '  [ok]     %s\n' "$*"; }
aviso()  { N_AVISO=$((N_AVISO + 1)); printf '  [AVISO]  %s\n' "$*"; }
falla()  { N_FALLO=$((N_FALLO + 1)); printf '  [FALLA]  %s\n' "$*"; }
impide() { PUEDE=0; falla "$@"; }
hecho()  { printf '  [hecho]  %s\n' "$*"; }
haria()  { printf '  [haría]  %s\n' "$*"; }
titulo() { printf '\n== %s\n' "$*"; }

dc_wa() { (cd "$RUTA_WA" && docker compose "$@"); }
compose_de() { local f; for f in docker-compose.yaml docker-compose.yml compose.yaml compose.yml; do [ -f "$1/$f" ] && { echo "$1/$f"; return 0; }; done; return 1; }

NOMBRES="MINIMUM_DISTANCE GROUP_RADIUS MAX_PER_GROUP"
casillas() { echo "$(($1 / 32)),$((($1 % 32) * 100 / 32 / 10))$((($1 % 32) * 100 / 32 % 10))"; }   # píxeles → casillas, con dos decimales
quiere() { case "$1" in MINIMUM_DISTANCE) echo "$V_DISTANCIA" ;; GROUP_RADIUS) echo "$V_RADIO" ;; MAX_PER_GROUP) echo "$V_MAXIMO" ;; esac; }
serie()  { case "$1" in MINIMUM_DISTANCE) echo "$SERIE_DISTANCIA" ;; GROUP_RADIUS) echo "$SERIE_RADIO" ;; MAX_PER_GROUP) echo "$SERIE_MAXIMO" ;; esac; }
# Una línea del .env que pone la variable (no una comentada con #)
patron() { printf '^[[:space:]]*(export[[:space:]]+)?%s[[:space:]]*=' "$1"; }
PATRON_LAS_TRES='^[[:space:]]*(export[[:space:]]+)?(MINIMUM_DISTANCE|GROUP_RADIUS|MAX_PER_GROUP)[[:space:]]*='
# Los valores que tiene una variable en un .env, uno por línea que la pone (sin comillas, sin comentario detrás, sin retorno de carro)
valores_en() { grep -E "$(patron "$2")" "$1" 2> /dev/null | sed -E "s/^[^=]*=//; s/\r\$//; s/[[:space:]]+#.*\$//; s/^[[:space:]]+//; s/[[:space:]]+\$//; s/^\"(.*)\"\$/\1/; s/^'(.*)'\$/\1/"; }
# ¿Está ya puesta, y solo con ese valor?
ya_esta_en() { local v; v="$(valores_en "$1" "$2" | sort -u)"; [ -n "$v" ] && [ "$v" = "$3" ]; }

if [ "$DESHACER" = "1" ]; then
  echo "HOT SPOT S.L. · v0.3.1 · conversaciones · DESHACER (volver a los valores de serie) · modo: $MODO"
else
  echo "HOT SPOT S.L. · v0.3.1 · conversaciones · modo: $MODO"
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "1. Lo que hay en el servidor"
[ "$(id -u)" = "0" ] || aviso "No eres root: puede que no se pueda leer el .env ni hablar con docker. Usa «sudo bash …»."
if command -v docker > /dev/null 2>&1 && docker compose version > /dev/null 2>&1; then
  ok "docker compose está"
  HAY_DOCKER=1
else
  impide "No encuentro «docker compose»: sin él no se puede reiniciar nada (y no se cambia nada)."
  HAY_DOCKER=0
fi
if COMPOSE_WA="$(compose_de "$RUTA_WA")"; then
  ok "WorkAdventure: $COMPOSE_WA"
else
  COMPOSE_WA=""
  impide "No encuentro el docker-compose.yaml de WorkAdventure en $RUTA_WA"
fi
ENV_WA="$RUTA_WA/.env"
ENV_LEIBLE=0
if [ ! -f "$ENV_WA" ]; then
  impide "Falta $ENV_WA"
elif [ ! -r "$ENV_WA" ]; then
  impide "No puedo leer $ENV_WA (permisos): ejecútalo con «sudo bash …»"
else
  ENV_LEIBLE=1
  ENV_REAL="$(readlink -f "$ENV_WA")"   # por si fuera un enlace: se cambia el archivo de verdad
  ok ".env de WorkAdventure: $ENV_WA (no se enseña: solo las tres líneas de las conversaciones)"
  if [ ! -w "$ENV_REAL" ] || [ ! -w "$(dirname "$ENV_REAL")" ] || [ ! -w "$RUTA_WA" ]; then
    if [ "$MODO" = "aplicar" ]; then
      impide "No tengo permiso para escribir en $ENV_WA o en su carpeta: ejecútalo con «sudo bash …». No se cambia nada."
    else
      aviso "Sin permiso para escribir en $ENV_WA o en su carpeta: al aplicar hará falta «sudo bash …»."
    fi
  fi
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "2. Los valores"
VALORES_BIEN=1
entero_entre() { # entero_entre NOMBRE valor mínimo máximo
  if ! printf '%s' "$2" | grep -qE '^[1-9][0-9]{0,3}$'; then
    impide "$1=«$2» no vale: tiene que ser un número entero mayor que cero (sin comillas, sin decimales, sin «px»). No se cambia nada."; VALORES_BIEN=0
  elif [ "$2" -lt "$3" ] || [ "$2" -gt "$4" ]; then
    impide "$1=$2 se sale de lo razonable (entre $3 y $4). No se cambia nada."; VALORES_BIEN=0
  fi
}
entero_entre MINIMUM_DISTANCE "$V_DISTANCIA" 32 320
entero_entre GROUP_RADIUS "$V_RADIO" 32 320
entero_entre MAX_PER_GROUP "$V_MAXIMO" 2 20
if [ "$DESHACER" = "1" ] && [ -n "$VALORES_DADOS" ]; then
  aviso "Con --deshacer no se usan los valores pasados al llamar (${VALORES_DADOS% }): se vuelve a los de serie."
fi
printf '  %-17s %9s %14s   %s\n' "" "de serie" "se va a poner" "en casillas"
for n in $NOMBRES; do
  q="$(quiere "$n")"
  case "$n" in
    MAX_PER_GROUP) nota="personas por corro" ;;
    *) if [ "$VALORES_BIEN" = "1" ]; then nota="$(casillas "$q") casillas"; else nota=""; fi ;;
  esac
  printf '  %-17s %9s %14s   %s\n' "$n" "$(serie "$n")" "$q" "$nota"
done
if [ "$VALORES_BIEN" = "1" ]; then
  ok "los tres valores son números enteros razonables"
  [ "$V_MAXIMO" -gt 8 ] && aviso "MAX_PER_GROUP=$V_MAXIMO: sin LiveKit cada navegador mantiene $((V_MAXIMO - 1)) conexiones a la vez en un corro lleno ($((V_MAXIMO * (V_MAXIMO - 1) / 2)) entre todos). Con cámaras encendidas puede ir a tirones."
  [ "$V_RADIO" -gt 128 ] && aviso "GROUP_RADIUS=$V_RADIO: para dejar de hablar con alguien habrá que alejarse más de $(casillas $((V_RADIO * 2))) casillas, y los corros alcanzan a la sala de al lado."
  [ "$V_DISTANCIA" -gt 128 ] && aviso "MINIMUM_DISTANCE=$V_DISTANCIA: pararse a $(casillas "$V_DISTANCIA") casillas de alguien ya abre llamada, también con una pared de por medio."
  echo "  Con estos valores: una pareja deja de hablar al separarse más de $((V_RADIO * 2)) px ($(casillas $((V_RADIO * 2))) casillas); en un corro lleno cada"
  echo "  navegador mantiene $((V_MAXIMO - 1)) conexiones; el aro que se dibuja mide $((V_DISTANCIA * 2)) px de ancho ($(casillas $((V_DISTANCIA * 2))) casillas)."
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "3. El .env ahora (solo estas tres líneas)"
HAY_QUE_ESCRIBIR=0
if [ "$ENV_LEIBLE" = "1" ]; then
  for n in $NOMBRES; do
    q="$(quiere "$n")"
    cuantas="$(grep -cE "$(patron "$n")" "$ENV_WA")"
    comentadas="$(grep -cE "^[[:space:]]*#+[[:space:]]*(export[[:space:]]+)?$n[[:space:]]*=" "$ENV_WA")"
    while IFS= read -r linea; do
      [ -n "$linea" ] && printf '      línea %s\n' "$(printf '%s' "$linea" | tr -d '\r' | sed -E 's/^([0-9]+):[[:space:]]*/\1: /')"
    done < <(grep -nE "$(patron "$n")" "$ENV_WA")
    [ "$comentadas" -gt 0 ] && echo "      ($n aparece además en $comentadas línea(s) comentada(s) con #: no cuentan y no se tocan)"
    if [ "$cuantas" -eq 0 ]; then
      HAY_QUE_ESCRIBIR=1
      aviso "$n no está en el .env (WorkAdventure usa el valor de serie, $(serie "$n")): se añadirá «$n=$q» al final"
    elif ya_esta_en "$ENV_WA" "$n" "$q"; then
      ok "$n ya vale $q"
      [ "$cuantas" -gt 1 ] && aviso "$n está repetida en $cuantas líneas, todas con $q: se deja como está"
    else
      HAY_QUE_ESCRIBIR=1
      if [ "$cuantas" -gt 1 ]; then
        aviso "$n está repetida en $cuantas líneas ($(valores_en "$ENV_WA" "$n" | tr '\n' ' ' | sed 's/ $//')): se pondrá $q en todas, para que no haya duda de cuál manda"
      else
        echo "      $n: $(valores_en "$ENV_WA" "$n") → $q"
      fi
    fi
  done
fi

# ---------------------------------------------------------------------------------------------------------------------------
if [ -n "$COMPOSE_WA" ]; then NOMBRE_COMPOSE="$(basename "$COMPOSE_WA")"; else NOMBRE_COMPOSE="docker-compose.yaml"; fi
titulo "4. Cómo llegan al contenedor ($NOMBRE_COMPOSE)"
# declarada archivo servicio VARIABLE → escribe una palabra:
#   entorno       está en «environment:» del servicio y coge el valor del .env («- VAR», «- VAR=${VAR}», «VAR: ${VAR:-64}»…)
#   env_file      el servicio lee el .env entero (env_file)
#   fija:<valor>  está en «environment:» pero con un valor escrito a mano: el .env no manda
#   no            el servicio existe y no la recibe
#   nose          no se puede saber leyendo el archivo (usa anclas de YAML o «<<»)
#   sin-servicio  no hay un servicio con ese nombre
declarada() {
  awk -v servicio="$2" -v variable="$3" '
    function sangria(l,   n) { n = match(l, /[^ ]/); return n ? n - 1 : length(l) }
    function limpia(v) {
      sub(/[ ]+#.*$/, "", v); sub(/^[ ]+/, "", v); sub(/[ ]+$/, "", v)
      if ((v ~ /^".*"$/) || (v ~ /^\047.*\047$/)) v = substr(v, 2, length(v) - 2)
      return v
    }
    BEGIN { res = "sin-servicio"; nivel = -1 }
    { sub(/\r$/, ""); gsub(/\t/, "  ") }
    /^[ ]*(#.*)?$/ { next }
    {
      s = sangria($0)
      if (s == 0) { en_servicios = ($0 ~ /^services:[ ]*(#.*)?$/); en = 0; en_env = 0; en_file = 0; nivel = -1; next }
      if (!en_servicios) next
      if (nivel < 0) nivel = s
      linea = $0; sub(/^[ ]+/, "", linea)
      if (s == nivel) {
        nombre = linea; sub(/[ ]*:.*$/, "", nombre); gsub(/["\047]/, "", nombre)
        en = (nombre == servicio); en_env = 0; en_file = 0
        if (en && res == "sin-servicio") res = "no"
        if (en && linea ~ /:[ ]*[*&<]/) alias = 1
        next
      }
      if (!en) next
      if (en_env && !(s > s_env || (s == s_env && linea ~ /^- /))) en_env = 0
      if (en_file && !(s > s_file || (s == s_file && linea ~ /^- /))) en_file = 0
      if (!en_env && !en_file) {
        if (linea ~ /^<<[ ]*:/) alias = 1
        if (linea ~ /^environment[ ]*:/) {
          en_env = 1; s_env = s
          resto = linea; sub(/^environment[ ]*:[ ]*/, "", resto); resto = limpia(resto)
          if (resto != "") alias = 1     # «environment: *ancla» o un mapa en la misma línea: no se sabe leyendo
        } else if (linea ~ /^env_file[ ]*:/) {
          en_file = 1; s_file = s
          resto = linea; sub(/^env_file[ ]*:[ ]*/, "", resto); resto = limpia(resto)
          if (resto ~ /(^|\/)\.env$/) fichero = 1
        }
        next
      }
      if (en_file) {
        v = linea; sub(/^- [ ]*/, "", v); sub(/^path[ ]*:[ ]*/, "", v); v = limpia(v)
        if (v ~ /(^|\/)\.env$/) fichero = 1
        next
      }
      if (linea ~ /^<<[ ]*:/) { alias = 1; next }
      v = linea
      if (v ~ /^- /) {
        sub(/^- [ ]*/, "", v); v = limpia(v)
        p = index(v, "=")
        clave = p ? substr(v, 1, p - 1) : v
        valor = p ? substr(v, p + 1) : ""
        tiene = (p > 0)
      } else {
        p = index(v, ":")
        if (!p) next
        clave = limpia(substr(v, 1, p - 1)); valor = limpia(substr(v, p + 1))
        tiene = (valor != "" && valor != "null" && valor != "~")
      }
      if (clave != variable) next
      if (!tiene) res = "entorno"
      else if (valor == ("$" variable) || valor ~ ("^[$][{]" variable "([-:?][^}]*)?[}]$")) res = "entorno"
      else res = "fija:" valor
    }
    END {
      if (res == "no" && fichero) res = "env_file"
      else if (res == "no" && alias) res = "nose"
      print res
    }
  ' "$1"
}
# Lo mismo, contando con docker-compose.override.yaml si lo hay (docker compose lo suma solo)
llega() { # llega servicio VARIABLE
  local r="" o f
  r="$(declarada "$COMPOSE_WA" "$1" "$2")"
  for f in docker-compose.override.yaml docker-compose.override.yml compose.override.yaml compose.override.yml; do
    [ -f "$RUTA_WA/$f" ] || continue
    o="$(declarada "$RUTA_WA/$f" "$1" "$2")"
    case "$o" in sin-servicio | no) ;; *) r="$o" ;; esac
  done
  printf '%s' "$r"
}
linea_que_falta() { echo "            - $1=\${$1}        (o, si ahí van como «NOMBRE: valor»:   $1: \${$1})"; }
LEE_BACK="MINIMUM_DISTANCE GROUP_RADIUS MAX_PER_GROUP"   # back decide quién habla con quién
LEE_PLAY="MINIMUM_DISTANCE MAX_PER_GROUP"                 # play solo las usa para dibujar el aro y el candado de «corro lleno»
LLEGAN_BACK=""; LLEGAN_PLAY=""   # las que de verdad le llegan a cada uno (según el archivo): las que se vigilan después
if [ -n "$COMPOSE_WA" ]; then
  for par in "$SERVICIO_BACK:$LEE_BACK" "$SERVICIO_PLAY:$LEE_PLAY"; do
    servicio="${par%%:*}"
    for n in ${par#*:}; do
      como="$(llega "$servicio" "$n")"
      case "$como" in
        entorno | env_file | nose) if [ "$servicio" = "$SERVICIO_BACK" ]; then LLEGAN_BACK="$LLEGAN_BACK $n"; else LLEGAN_PLAY="$LLEGAN_PLAY $n"; fi ;;
      esac
      case "$como" in
        entorno) ok "$servicio recibe $n del .env" ;;
        env_file) ok "$servicio lee el .env entero (env_file): $n le llega" ;;
        sin-servicio)
          impide "En $COMPOSE_WA no hay un servicio que se llame «$servicio» (¿otro nombre? pásalo con SERVICIO_BACK=… o SERVICIO_PLAY=…). No se cambia nada."
          break
          ;;
        nose)
          aviso "No puedo saber leyendo el archivo si $servicio recibe $n (usa anclas de YAML): se comprobará después de reiniciar, mirando dentro del contenedor."
          ;;
        fija:*)
          if [ "$servicio" = "$SERVICIO_BACK" ]; then
            impide "En el $NOMBRE_COMPOSE, $servicio lleva $n con un valor escrito a mano («${como#fija:}»): el .env no manda y cambiarlo no serviría de nada. Cambia esa línea por esta y repite (no se cambia nada):"
          else
            aviso "En el $NOMBRE_COMPOSE, $servicio lleva $n con un valor escrito a mano («${como#fija:}»): el aro se seguirá dibujando con ese valor. Hablar funcionará igual. Para arreglarlo, cambia esa línea por:"
          fi
          linea_que_falta "$n"
          ;;
        no)
          if [ "$servicio" = "$SERVICIO_BACK" ]; then
            impide "El $NOMBRE_COMPOSE NO le pasa $n al servicio «$servicio»: aunque se cambie el .env, el contenedor no se enteraría. Añade esta línea dentro de «environment:» de $servicio (con la misma sangría que las de al lado) y repite (no se cambia nada):"
          else
            aviso "El $NOMBRE_COMPOSE no le pasa $n al servicio «$servicio»: hablar funcionará con los valores nuevos, pero el aro del corro (o el candado de «lleno») se dibujará como antes. Para arreglarlo, añade dentro de «environment:» de $servicio:"
          fi
          linea_que_falta "$n"
          ;;
      esac
    done
  done
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "5. Lo que tienen ahora los contenedores"
# dentro servicio VARIABLE → el valor con el que corre el contenedor; «-» si no la tiene (WorkAdventure usa el de serie);
# «?» si no se le puede preguntar (parado, reiniciándose…). Solo se le pregunta por esa variable: nada más sale de ahí.
dentro() {
  local r
  r="$(dc_wa exec -T "$1" sh -c "printf 'valor=%s\\n' \"\${$2-}\"" 2> /dev/null | tr -d '\r' | grep '^valor=' | head -n 1)"
  case "$r" in
    valor=) echo "-" ;;
    valor=*) echo "${r#valor=}" ;;
    *) echo "?" ;;
  esac
}
# vale servicio VARIABLE → con qué valor trabaja de verdad (el de serie si no la tiene; «?» si no se sabe)
vale() { local t; t="$(dentro "$1" "$2")"; if [ "$t" = "-" ]; then serie "$2"; else echo "$t"; fi; }
como_esta() { local t; t="$(dentro "$1" "$2")"; case "$t" in -) echo "$(serie "$2") (sin poner: el de serie)" ;; \?) echo "(no contesta)" ;; *) echo "$t" ;; esac; }
en_marcha() { [ -n "$(dc_wa ps -q "$1" 2> /dev/null | head -n 1)" ]; }
# le_falta servicio "VARIABLES" → 0 si el contenedor NO corre ya con los valores que se quieren
le_falta() {
  local n
  en_marcha "$1" || return 0
  for n in $2; do
    [ "$(vale "$1" "$n")" = "$(quiere "$n")" ] || return 0
  done
  return 1
}
contar_contenedor() { # contar_contenedor servicio "VARIABLES"
  local n texto=""
  if ! en_marcha "$1"; then
    aviso "$1 no está en marcha ahora mismo"
    return
  fi
  for n in $2; do
    texto="$texto $n=$(como_esta "$1" "$n");"
  done
  if le_falta "$1" "$2"; then echo "      $1 corre con:${texto%;}"; else ok "$1 ya corre con:${texto%;}"; fi
}
FALTA_REINICIAR=0
if [ "$HAY_DOCKER" = "1" ] && [ -n "$COMPOSE_WA" ]; then
  contar_contenedor "$SERVICIO_BACK" "$LEE_BACK"
  contar_contenedor "$SERVICIO_PLAY" "$LEE_PLAY"
  if [ "$VALORES_BIEN" = "1" ]; then   # solo cuentan las variables que el compose le pasa a cada uno: las otras no cambiarían al reiniciar
    le_falta "$SERVICIO_BACK" "$LLEGAN_BACK" && FALTA_REINICIAR=1
    le_falta "$SERVICIO_PLAY" "$LLEGAN_PLAY" && FALTA_REINICIAR=1
  fi
else
  echo "  (sin docker no se puede mirar)"
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "6. Cambiar el .env"
COPIA="$RUTA_WA/.env.antes-$AHORA"
ESCRITO=0
escribir_env() {
  local nuevo="$ENV_REAL.nuevo-$AHORA" n
  [ -e "$COPIA" ] && COPIA="$COPIA-$$"
  cp -p "$ENV_REAL" "$COPIA" || return 1
  awk -v d="$V_DISTANCIA" -v r="$V_RADIO" -v m="$V_MAXIMO" '
    BEGIN { valor["MINIMUM_DISTANCE"] = d; valor["GROUP_RADIUS"] = r; valor["MAX_PER_GROUP"] = m }
    {
      cr = ""
      if (sub(/\r$/, "")) { cr = "\r"; crlf = 1 }
      for (n in valor) {
        if ($0 ~ ("^[ \t]*(export[ \t]+)?" n "[ \t]*=")) { sub(/=.*$/, "=" valor[n]); visto[n] = 1; break }
      }
      print $0 cr
    }
    END {
      fin = crlf ? "\r" : ""
      if (!visto["MINIMUM_DISTANCE"]) print "MINIMUM_DISTANCE=" d fin
      if (!visto["GROUP_RADIUS"]) print "GROUP_RADIUS=" r fin
      if (!visto["MAX_PER_GROUP"]) print "MAX_PER_GROUP=" m fin
    }
  ' "$ENV_REAL" > "$nuevo" || { rm -f "$nuevo"; return 1; }
  # Antes de dar el cambiazo: las tres tienen que valer lo pedido y TODO lo demás tiene que estar igual, línea por línea
  for n in $NOMBRES; do
    ya_esta_en "$nuevo" "$n" "$(quiere "$n")" || { rm -f "$nuevo"; return 1; }
  done
  if [ "$(grep -vE "$PATRON_LAS_TRES" "$ENV_REAL" | cksum)" != "$(grep -vE "$PATRON_LAS_TRES" "$nuevo" | cksum)" ]; then
    rm -f "$nuevo"
    return 1
  fi
  if chmod --reference="$ENV_REAL" "$nuevo" && chown --reference="$ENV_REAL" "$nuevo" && mv "$nuevo" "$ENV_REAL"; then
    return 0
  fi
  rm -f "$nuevo"
  return 1
}
if [ "$ENV_LEIBLE" != "1" ]; then
  echo "  (sin poder leer el .env no hay nada que hacer aquí)"
elif [ "$HAY_QUE_ESCRIBIR" = "0" ]; then
  ok "el .env ya tiene los tres valores: no se toca (ni se hace copia)"
elif [ "$PUEDE" != "1" ]; then
  echo "  No se cambia el .env: antes hay que arreglar lo que está marcado con [FALLA] más arriba."
elif [ "$MODO" != "aplicar" ]; then
  haria "copiar $ENV_WA a $RUTA_WA/.env.antes-<fecha> y cambiar (o añadir) solo las líneas de MINIMUM_DISTANCE, GROUP_RADIUS y MAX_PER_GROUP: $V_DISTANCIA, $V_RADIO y $V_MAXIMO"
else
  if escribir_env; then
    ESCRITO=1
    hecho "copia de antes: $COPIA (lleva las mismas claves que el .env: mismos permisos)"
    hecho "el .env tiene ahora:"
    grep -nE "$PATRON_LAS_TRES" "$ENV_WA" | tr -d '\r' | sed -E 's/^([0-9]+):[[:space:]]*/      línea \1: /'
  else
    impide "No se ha podido cambiar el .env (se queda como estaba; si se llegó a hacer, la copia es $COPIA)"
  fi
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "7. Volver a crear «$SERVICIO_BACK» y «$SERVICIO_PLAY» para que lean los valores (los demás servicios no se tocan)"
# «docker compose restart» NO vale: arranca el mismo contenedor con las variables viejas. «up -d» lo vuelve a crear solo si
# algo suyo ha cambiado; --no-deps: sin tocar los servicios de los que dependen.
recrear() { dc_wa up -d --no-deps "$SERVICIO_BACK" "$SERVICIO_PLAY"; }
ORDEN="cd $RUTA_WA && docker compose up -d --no-deps $SERVICIO_BACK $SERVICIO_PLAY"
RECREADO=0
if [ "$PUEDE" != "1" ]; then
  echo "  No se reinicia nada: antes hay que arreglar lo que está marcado con [FALLA] más arriba."
elif [ "$REINICIAR" != "1" ]; then
  if [ "$ESCRITO" = "1" ] || [ "$FALTA_REINICIAR" = "1" ] || [ "$HAY_QUE_ESCRIBIR" = "1" ]; then
    aviso "REINICIAR=$REINICIAR: no se reinicia nada. Los contenedores siguen con los valores de antes hasta que alguien ejecute «$ORDEN». Ojo: si la actualización automática vuelve a crear «$SERVICIO_PLAY» antes, el aro se dibujará con los valores nuevos y se hablará con los viejos."
  else
    echo "  (nada que reiniciar)"
  fi
elif [ "$HAY_QUE_ESCRIBIR" = "0" ] && [ "$FALTA_REINICIAR" = "0" ]; then
  ok "los dos contenedores ya corren con esos valores: no se reinicia nada"
elif [ "$MODO" != "aplicar" ]; then
  haria "$ORDEN (quien esté dentro de la oficina se reconecta solo; la llamada que tuviera se corta)"
elif recrear; then
  RECREADO=1
  hecho "$ORDEN"
else
  falla "$ORDEN ha fallado. El .env ya tiene los valores nuevos; mira «cd $RUTA_WA && docker compose ps» y «docker compose logs --tail 50 $SERVICIO_BACK»."
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "8. Comprobar"
estado_de() { # estado_de servicio → «running», «running/healthy», «restarting», «(no existe)»…
  local id e s
  id="$(dc_wa ps -q "$1" 2> /dev/null | head -n 1)"
  [ -n "$id" ] || { echo "(no está)"; return; }
  e="$(docker inspect --format '{{.State.Status}}' "$id" 2> /dev/null)"
  s="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$id" 2> /dev/null)"
  echo "${e:-desconocido}${s:+/$s}"
}
arrancado() { case "$(estado_de "$1")" in running | running/healthy) return 0 ;; *) return 1 ;; esac; }
los_dos_arrancados() { arrancado "$SERVICIO_BACK" && arrancado "$SERVICIO_PLAY"; }
if [ "$HAY_DOCKER" = "1" ] && [ -n "$COMPOSE_WA" ]; then
  if [ "$RECREADO" = "1" ]; then
    # Dos miradas buenas seguidas: un contenedor que arranca y se cae a los dos segundos no cuenta como arrancado
    limite=$((SECONDS + ESPERA_S)); seguidas=0
    while [ "$seguidas" -lt 2 ] && [ "$SECONDS" -lt "$limite" ]; do
      if los_dos_arrancados; then seguidas=$((seguidas + 1)); else seguidas=0; fi
      [ "$seguidas" -lt 2 ] && sleep "$PAUSA_S"
    done
  fi
  for servicio in "$SERVICIO_BACK" "$SERVICIO_PLAY"; do
    if arrancado "$servicio"; then
      ok "$servicio está en marcha ($(estado_de "$servicio"))"
    elif [ "$RECREADO" = "1" ]; then
      falla "$servicio NO ha arrancado en $ESPERA_S s (está: $(estado_de "$servicio")). Mira «cd $RUTA_WA && docker compose logs --tail 50 $servicio». Para volver atrás: bash $0 --deshacer"
    else
      aviso "$servicio no está en marcha (está: $(estado_de "$servicio"))"
    fi
  done
  if [ "$RECREADO" = "1" ]; then
    for par in "$SERVICIO_BACK:$LEE_BACK" "$SERVICIO_PLAY:$LEE_PLAY"; do
      servicio="${par%%:*}"
      arrancado "$servicio" || continue
      for n in ${par#*:}; do
        t="$(vale "$servicio" "$n")"
        if [ "$t" = "$(quiere "$n")" ]; then
          ok "$servicio corre con $n=$t"
        elif [ "$t" = "?" ]; then
          aviso "No he podido preguntarle a $servicio con qué $n corre (el contenedor no contesta a «docker compose exec»): no puedo confirmar que lo haya leído. Prueba en la oficina."
        elif [ "$servicio" = "$SERVICIO_BACK" ]; then
          falla "$servicio sigue con $n=$(como_esta "$servicio" "$n") y no con $(quiere "$n"): el $NOMBRE_COMPOSE no le pasa esa variable. NO ha funcionado. Añade en «environment:» de $servicio:"
          linea_que_falta "$n"
        else
          aviso "$servicio sigue con $n=$(como_esta "$servicio" "$n") y no con $(quiere "$n"): se habla con los valores nuevos, pero el aro se dibuja como antes. Añade en «environment:» de $servicio:"
          linea_que_falta "$n"
        fi
      done
    done
  fi
else
  echo "  (sin docker no se puede mirar si están en marcha)"
fi
if [ "$COMPROBAR_RED" = "1" ] && command -v curl > /dev/null 2>&1; then
  codigo() { local c; c="$(curl -s -o /dev/null -m 10 -w '%{http_code}' "$ORIGEN_WEB$1" 2> /dev/null)" || c="000"; echo "${c:-000}"; }
  # responde ruta «qué es»: espera (solo si se acaba de reiniciar) a que conteste 200
  responde() {
    local c limite=$((SECONDS + ESPERA_S))
    c="$(codigo "$1")"
    while [ "$RECREADO" = "1" ] && [ "$c" != "200" ] && [ "$SECONDS" -lt "$limite" ]; do
      sleep "$PAUSA_S"
      c="$(codigo "$1")"
    done
    echo "$c"
  }
  c="$(responde /iframe_api.js)"
  if [ "$c" = "200" ]; then
    ok "$ORIGEN_WEB/iframe_api.js → 200 (la oficina, «$SERVICIO_PLAY», responde)"
  elif [ "$RECREADO" = "1" ]; then
    falla "$ORIGEN_WEB/iframe_api.js → $c: la oficina NO responde después de reiniciar. Mira «cd $RUTA_WA && docker compose logs --tail 50 $SERVICIO_PLAY». Para volver atrás: bash $0 --deshacer"
  else
    aviso "$ORIGEN_WEB/iframe_api.js → $c (se esperaba 200: la oficina no responde ahora mismo, y no es por este guion, que no ha tocado nada)"
  fi
  c="$(responde /ping-backs)"
  case "$c" in
    200) ok "$ORIGEN_WEB/ping-backs → 200 («$SERVICIO_PLAY» llega a «$SERVICIO_BACK»)" ;;
    503)
      if [ "$RECREADO" = "1" ]; then
        falla "$ORIGEN_WEB/ping-backs → 503: «$SERVICIO_PLAY» NO llega a «$SERVICIO_BACK» después de reiniciar. Mira «cd $RUTA_WA && docker compose logs --tail 50 $SERVICIO_BACK». Para volver atrás: bash $0 --deshacer"
      else
        aviso "$ORIGEN_WEB/ping-backs → 503: «$SERVICIO_PLAY» no llega a «$SERVICIO_BACK» ahora mismo (y no es por este guion, que no ha tocado nada)"
      fi
      ;;
    *) aviso "$ORIGEN_WEB/ping-backs → $c: por aquí no se puede saber si «$SERVICIO_PLAY» llega a «$SERVICIO_BACK» (se esperaba 200). Entra en la oficina y mira que se ve a los demás." ;;
  esac
else
  echo "  (no se comprueba nada por la red)"
fi

# ---------------------------------------------------------------------------------------------------------------------------
titulo "Resumen ($MODO)"
echo "  bien: $N_OK · avisos: $N_AVISO · fallos: $N_FALLO"
if [ "$PUEDE" = "1" ] && [ "$HAY_QUE_ESCRIBIR" = "0" ] && [ "$FALTA_REINICIAR" = "0" ]; then
  echo "  Ya estaba todo así (MINIMUM_DISTANCE=$V_DISTANCIA, GROUP_RADIUS=$V_RADIO, MAX_PER_GROUP=$V_MAXIMO): no se ha cambiado nada."
elif [ "$MODO" != "aplicar" ]; then
  if [ "$DESHACER" = "1" ]; then
    echo "  Esto ha sido EN SECO: no se ha cambiado nada. Para volver de verdad a los valores de serie: bash $0 --deshacer"
  else
    echo "  Esto ha sido EN SECO: no se ha cambiado nada. Si lo ves bien, repite con: bash $0 --aplicar"
  fi
elif [ "$RECREADO" = "1" ] && [ "$N_FALLO" -eq 0 ]; then
  cat << TEXTO
  Hecho: MINIMUM_DISTANCE=$V_DISTANCIA, GROUP_RADIUS=$V_RADIO y MAX_PER_GROUP=$V_MAXIMO.
  Quien estuviera dentro se ha reconectado solo. Que cada persona recargue la página una vez (F5): hasta entonces su
  navegador dibuja el aro del corro con el tamaño de antes (hablar ya va con los valores nuevos).
  Cómo notar si va mal: dos personas quietas, una al lado de la otra, que NO se oyen; o gente de salas distintas que se oye
  sin querer. $([ "$DESHACER" = "1" ] && echo "Para volver a poner los valores nuevos:  bash $0 --aplicar" || echo "Para volver a como estaba:  bash $0 --deshacer")
TEXTO
fi
[ "$N_FALLO" -eq 0 ]
