// Las personas que se pueden elegir en una tarea: el crew de ahora y, además, quien ya ha salido del crew pero sigue
// puesto en ella. Antes los menús «Para quién» y «Pedido por» solo listaban a los de ahora, así que a quien había
// salido no se le podía quitar de una tarea (ni se veía su tarea al agrupar por persona).
//
// Lógica sola, sin página, para poder probarla en Node: pruebas/tablon.mjs.

// El crew de ahora y, detrás, quien ha salido («baja») y está en «ids» (los responsables de la tarea, o quien la pidió).
export function paraElegir(usuarios, ...ids) {
    const puestos = new Set(ids.flat().filter(Boolean));
    return [...usuarios.filter((u) => !u.baja), ...usuarios.filter((u) => u.baja && puestos.has(u.id))];
}

// El crew de ahora y, detrás, quien ha salido pero sigue siendo responsable de alguna de esas tareas: para agrupar o
// filtrar por persona sin que esas tareas se queden sin sitio.
export function conTareas(usuarios, tareas) {
    return [...usuarios.filter((u) => !u.baja), ...usuarios.filter((u) => u.baja && tareas.some((t) => t.responsables.includes(u.id)))];
}

// El botón de abajo del menú «Para quién»: «Todos» (o «Los dos») pone a todo el crew de ahora y deja como estén a
// quienes han salido; cuando ya están todos, es «Nadie» y quita a todos, también a quien ha salido.
// Devuelve { texto, alPulsar(): los ids elegidos después } o null si no hay botón (un crew de una sola persona).
export function botonTodos(usuarios, elegidos) {
    const deAhora = usuarios.filter((u) => !u.baja);
    if (deAhora.length < 2) return null;
    const estanTodos = deAhora.every((u) => elegidos.has(u.id));
    return {
        texto: estanTodos ? "Nadie" : deAhora.length === 2 ? "Los dos" : "Todos",
        alPulsar: () => (estanTodos ? [] : [...new Set([...elegidos, ...deAhora.map((u) => u.id)])]),
    };
}
