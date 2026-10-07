"use client"

// ============================================================================
// components/gerencia/tab-usuarios.tsx
// Panel de usuarios (solo admin maestro): crear, editar, activar/desactivar,
// asignar o restablecer clave y traspasar el cargo de admin maestro.
// ============================================================================

import { useState } from "react"
import useSWR from "swr"
import { Loader2, UserPlus, Search, X, KeyRound, Copy, Check, ShieldCheck, Lock, Power, Pencil, Crown } from "lucide-react"
import { fetcher } from "@/lib/fetcher"

type Rol = "asesor" | "supervisor" | "gerencia" | "entregador"

interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
  zona: string | null
  telefono: string | null
  activo: boolean
  es_admin_maestro: boolean
  supervisor_id: string | null
  supervisor_nombre: string | null
  tiene_clave: boolean
  clave_temporal: boolean
  bloqueado: boolean
  clientes: number
}

interface Cambio {
  id: number
  actor_nombre: string | null
  accion: string
  detalle: any
  creado_en: string
  objetivo_nombre: string | null
}

const ROL_LABEL: Record<Rol, string> = {
  gerencia: "Admin",
  supervisor: "Supervisor",
  asesor: "Asesor",
  entregador: "Entregador",
}

const FILTROS: { id: "todos" | Rol | "inactivos"; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "supervisor", label: "Supervisores" },
  { id: "asesor", label: "Asesores" },
  { id: "entregador", label: "Entregadores" },
  { id: "inactivos", label: "Inactivos" },
]

function iniciales(n: string) {
  return n.split(" ").map(p => p[0]).slice(0, 2).join("").toUpperCase()
}

function hace(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000)
  if (min < 1) return "ahora"
  if (min < 60) return `hace ${min} min`
  if (min < 1440) return `hace ${Math.round(min / 60)} h`
  return `hace ${Math.round(min / 1440)} d`
}

function describir(c: Cambio): string {
  const quien = c.objetivo_nombre || "un usuario"
  switch (c.accion) {
    case "crear_usuario": return `creó a ${quien} (${c.detalle?.rol ?? ""})`
    case "transferir_maestro": return `traspasó el cargo de admin maestro a ${quien}`
    case "editar_usuario": {
      const k = Object.keys(c.detalle || {})
      const partes: string[] = []
      if (c.detalle?.activo === false) partes.push("lo desactivó")
      else if (c.detalle?.activo === true) partes.push("lo reactivó")
      if (c.detalle?.clave === "restablecida") partes.push("restableció su clave")
      if (c.detalle?.clave === "quitada") partes.push("le quitó la clave")
      if (c.detalle?.rol) partes.push(`cambió su rol a ${c.detalle.rol}`)
      const otros = k.filter(x => !["activo", "clave", "rol"].includes(x))
      if (otros.length) partes.push(`editó ${otros.join(", ")}`)
      return `${partes.join(" y ") || "editó"} — ${quien}`
    }
    default: return `${c.accion} — ${quien}`
  }
}

export function TabUsuarios() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/usuarios", fetcher)
  const [filtro, setFiltro] = useState<"todos" | Rol | "inactivos">("todos")
  const [buscar, setBuscar] = useState("")
  const [modal, setModal] = useState<{ modo: "nuevo" } | { modo: "editar"; usuario: Usuario } | null>(null)
  const [claveMostrada, setClaveMostrada] = useState<{ nombre: string; clave: string } | null>(null)
  const [confirmar, setConfirmar] = useState<{ tipo: "maestro" | "desactivar"; usuario: Usuario } | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  if (isLoading) return <div className="flex h-48 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-navy-accent" /></div>
  if (error || data?.error) {
    return (
      <div className="p-4">
        <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-gray-300">
          <p className="font-semibold text-white mb-1">Esta sección es solo para el administrador maestro.</p>
          <p className="text-xs text-gray-400">{data?.error || "No se pudo cargar la lista de usuarios."}</p>
        </div>
      </div>
    )
  }

  const usuarios: Usuario[] = data?.usuarios ?? []
  const cambios: Cambio[] = data?.cambios ?? []
  const supervisores = usuarios.filter(u => u.rol === "supervisor" && u.activo)

  const visibles = usuarios.filter(u => {
    if (filtro === "inactivos" ? u.activo : filtro !== "todos" ? u.rol !== filtro || !u.activo : false) return false
    const q = buscar.trim().toLowerCase()
    return !q || u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q) || (u.zona || "").toLowerCase().includes(q)
  })

  async function enviar(metodo: "POST" | "PATCH", cuerpo: object): Promise<any | null> {
    setTrabajando(true)
    setAviso(null)
    try {
      const res = await fetch("/api/admin/usuarios", { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setAviso(json.error || "No se pudo completar la acción"); return null }
      await mutate()
      return json
    } catch {
      setAviso("Error de conexión. Intenta de nuevo.")
      return null
    } finally {
      setTrabajando(false)
    }
  }

  async function restablecerClave(u: Usuario) {
    const r = await enviar("PATCH", { id: u.id, generar_clave: true })
    if (r?.clave_temporal) setClaveMostrada({ nombre: u.nombre, clave: r.clave_temporal })
  }

  async function ejecutarConfirmacion() {
    if (!confirmar) return
    const { tipo, usuario } = confirmar
    const r = tipo === "maestro"
      ? await enviar("POST", { accion: "transferir_maestro", nuevo_id: usuario.id })
      : await enviar("PATCH", { id: usuario.id, activo: false })
    setConfirmar(null)
    if (r && tipo === "maestro") window.location.reload()
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="Buscar por nombre, correo o zona"
            className="w-full rounded-xl border border-white/10 bg-dark-surface pl-9 pr-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none" />
        </div>
        <button onClick={() => { setAviso(null); setModal({ modo: "nuevo" }) }}
          className="flex shrink-0 items-center gap-1.5 rounded-xl bg-navy-accent px-3 py-2.5 text-xs font-semibold text-white active:scale-[0.97]">
          <UserPlus className="h-4 w-4" /> Nuevo usuario
        </button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {FILTROS.map(f => (
          <button key={f.id} onClick={() => setFiltro(f.id)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${filtro === f.id ? "bg-navy-accent text-white" : "bg-dark-surface text-gray-400 border border-white/10"}`}>
            {f.label}
          </button>
        ))}
      </div>

      {aviso && !modal && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{aviso}</p>}

      {claveMostrada && <ClaveEntregada datos={claveMostrada} onCerrar={() => setClaveMostrada(null)} />}

      <div className="space-y-2">
        {visibles.length === 0 && <p className="py-8 text-center text-xs text-gray-500">No hay usuarios con ese filtro.</p>}
        {visibles.map(u => (
          <div key={u.id} className={`rounded-xl border border-white/10 bg-dark-surface p-3 ${u.activo ? "" : "opacity-60"}`}>
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-navy-accent/20 text-xs font-bold text-navy-accent">{iniciales(u.nombre)}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="truncate text-sm font-semibold text-white">{u.nombre}</p>
                  {u.es_admin_maestro && <span className="flex items-center gap-1 rounded-full bg-warning/20 px-2 py-0.5 text-[10px] font-semibold text-warning"><Crown className="h-3 w-3" />Admin maestro</span>}
                  {!u.es_admin_maestro && <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-gray-300">{ROL_LABEL[u.rol]}</span>}
                  {!u.activo && <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] text-danger">Inactivo</span>}
                  {u.bloqueado && <span className="rounded-full bg-danger/20 px-2 py-0.5 text-[10px] text-danger">Bloqueado</span>}
                </div>
                <p className="truncate text-xs text-gray-400">{u.email}</p>
                <p className="mt-0.5 text-[11px] text-gray-500">
                  {[u.zona, u.rol === "asesor" ? `${u.clientes} clientes` : null, u.supervisor_nombre ? `Supervisor: ${u.supervisor_nombre}` : null].filter(Boolean).join(" · ") || "Sin zona"}
                </p>
                <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${u.tiene_clave ? (u.clave_temporal ? "text-warning" : "text-success") : "text-gray-500"}`}>
                  <Lock className="h-3 w-3" />
                  {u.tiene_clave ? (u.clave_temporal ? "Clave temporal (debe cambiarla)" : "Con clave") : "Sin clave: entra solo con su correo"}
                </p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-white/5 pt-2.5">
              <button onClick={() => { setAviso(null); setModal({ modo: "editar", usuario: u }) }} className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-gray-300 hover:text-white"><Pencil className="h-3 w-3" />Editar</button>
              <button onClick={() => restablecerClave(u)} disabled={trabajando} className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-gray-300 hover:text-white disabled:opacity-50"><KeyRound className="h-3 w-3" />{u.tiene_clave ? "Restablecer clave" : "Asignar clave"}</button>
              {u.bloqueado && <button onClick={() => enviar("PATCH", { id: u.id, desbloquear: true })} className="rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-gray-300 hover:text-white">Desbloquear</button>}
              {!u.es_admin_maestro && u.activo && u.rol !== "entregador" && (
                <button onClick={() => setConfirmar({ tipo: "maestro", usuario: u })} className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1.5 text-[11px] text-gray-300 hover:text-white"><ShieldCheck className="h-3 w-3" />Hacer admin maestro</button>
              )}
              {!u.es_admin_maestro && (u.activo
                ? <button onClick={() => setConfirmar({ tipo: "desactivar", usuario: u })} className="flex items-center gap-1 rounded-lg bg-danger/10 px-2.5 py-1.5 text-[11px] text-danger"><Power className="h-3 w-3" />Desactivar</button>
                : <button onClick={() => enviar("PATCH", { id: u.id, activo: true })} className="flex items-center gap-1 rounded-lg bg-success/10 px-2.5 py-1.5 text-[11px] text-success"><Power className="h-3 w-3" />Reactivar</button>)}
            </div>
          </div>
        ))}
      </div>

      {cambios.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-dark-surface p-3">
          <p className="mb-2 text-xs font-semibold text-white">Últimos cambios</p>
          <ul className="space-y-1.5">
            {cambios.slice(0, 10).map(c => (
              <li key={c.id} className="text-[11px] text-gray-400"><span className="text-gray-300">{c.actor_nombre || "Sistema"}</span> {describir(c)} · {hace(c.creado_en)}</li>
            ))}
          </ul>
        </div>
      )}

      {confirmar && (
        <Fondo onCerrar={() => setConfirmar(null)}>
          <h3 className="text-base font-bold text-white">{confirmar.tipo === "maestro" ? "¿Traspasar el cargo de admin maestro?" : `¿Desactivar a ${confirmar.usuario.nombre}?`}</h3>
          <p className="mt-2 text-sm text-gray-400">
            {confirmar.tipo === "maestro"
              ? `${confirmar.usuario.nombre} pasará a ser el único admin maestro y tú quedarás como supervisor. Esta página se recargará.`
              : confirmar.usuario.rol === "asesor" && confirmar.usuario.clientes > 0
                ? `Tiene ${confirmar.usuario.clientes} clientes asignados. Al desactivarlo no podrá ingresar; sus clientes siguen en la base y puedes reasignarlos desde Asesores.`
                : "No podrá ingresar a la app. Su historial se conserva y puedes reactivarlo cuando quieras."}
          </p>
          {aviso && <p className="mt-2 text-xs text-danger">{aviso}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={() => setConfirmar(null)} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300">Cancelar</button>
            <button onClick={ejecutarConfirmacion} disabled={trabajando} className="flex-1 rounded-xl bg-navy-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50">{trabajando ? "Procesando..." : "Confirmar"}</button>
          </div>
        </Fondo>
      )}

      {modal && (
        <FormularioUsuario
          modo={modal.modo}
          usuario={modal.modo === "editar" ? modal.usuario : undefined}
          supervisores={supervisores}
          aviso={aviso}
          trabajando={trabajando}
          onCerrar={() => { setModal(null); setAviso(null) }}
          onGuardar={async (cuerpo) => {
            const r = await enviar(modal.modo === "nuevo" ? "POST" : "PATCH", cuerpo)
            if (r) {
              const nombre = String(cuerpo && (cuerpo as any).nombre || (modal.modo === "editar" ? modal.usuario.nombre : "el usuario"))
              if (r.clave_temporal) setClaveMostrada({ nombre, clave: r.clave_temporal })
              setModal(null)
            }
          }}
        />
      )}
    </div>
  )
}

function Fondo({ children, onCerrar }: { children: React.ReactNode; onCerrar: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onCerrar}>
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-dark-surface p-5" onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  )
}

function ClaveEntregada({ datos, onCerrar }: { datos: { nombre: string; clave: string }; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false)
  const copiar = async () => {
    try { await navigator.clipboard.writeText(datos.clave); setCopiado(true); setTimeout(() => setCopiado(false), 1500) } catch {}
  }
  return (
    <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-gray-300">Clave temporal de <b className="text-white">{datos.nombre}</b>. Entrégasela ahora: <b>no se vuelve a mostrar</b>. Al ingresar deberá crear la suya.</p>
        <button onClick={onCerrar} aria-label="Cerrar" className="text-gray-500 hover:text-white"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <code className="rounded-lg bg-dark-bg px-4 py-2 font-mono text-2xl tracking-[0.3em] text-white">{datos.clave}</code>
        <button onClick={copiar} className="flex items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs text-white">{copiado ? <><Check className="h-3.5 w-3.5" />Copiada</> : <><Copy className="h-3.5 w-3.5" />Copiar</>}</button>
      </div>
    </div>
  )
}

function FormularioUsuario({ modo, usuario, supervisores, aviso, trabajando, onCerrar, onGuardar }: {
  modo: "nuevo" | "editar"
  usuario?: Usuario
  supervisores: Usuario[]
  aviso: string | null
  trabajando: boolean
  onCerrar: () => void
  onGuardar: (cuerpo: object) => void
}) {
  const [nombre, setNombre] = useState(usuario?.nombre ?? "")
  const [email, setEmail] = useState(usuario?.email ?? "")
  const [rol, setRol] = useState<"asesor" | "supervisor" | "entregador">(usuario && usuario.rol !== "gerencia" ? usuario.rol : "asesor")
  const [zona, setZona] = useState(usuario?.zona ?? "")
  const [telefono, setTelefono] = useState(usuario?.telefono ?? "")
  const [supervisorId, setSupervisorId] = useState(usuario?.supervisor_id ?? "")
  const [clave, setClave] = useState<"ninguna" | "generar" | "definir">("ninguna")
  const [claveManual, setClaveManual] = useState("")
  const [error, setError] = useState("")
  const esMaestro = !!usuario?.es_admin_maestro

  const campo = "w-full rounded-xl border border-white/10 bg-dark-bg px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:border-navy-accent focus:outline-none"
  const etiqueta = "mb-1 block text-xs text-gray-400"

  function guardar() {
    if (nombre.trim().length < 2) return setError("Escribe el nombre")
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError("El correo no es válido")
    if (clave === "definir" && claveManual.length < 6) return setError("La clave debe tener al menos 6 caracteres")
    setError("")
    const base: Record<string, unknown> = { nombre, email, zona, telefono }
    if (!esMaestro) base.rol = rol
    if (rol === "asesor") base.supervisor_id = supervisorId || null
    if (clave === "generar") base.generar_clave = true
    if (clave === "definir") base.clave = claveManual
    if (modo === "editar" && usuario) base.id = usuario.id
    onGuardar(base)
  }

  return (
    <Fondo onCerrar={onCerrar}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-bold text-white">{modo === "nuevo" ? "Nuevo usuario" : "Editar usuario"}</h3>
        <button onClick={onCerrar} aria-label="Cerrar" className="text-gray-500 hover:text-white"><X className="h-5 w-5" /></button>
      </div>
      <div className="space-y-3">
        <div><label className={etiqueta} htmlFor="u-nombre">Nombre</label><input id="u-nombre" className={campo} value={nombre} onChange={e => setNombre(e.target.value)} /></div>
        <div><label className={etiqueta} htmlFor="u-email">Correo (con el que ingresa)</label><input id="u-email" type="email" className={campo} value={email} onChange={e => setEmail(e.target.value)} /></div>
        {!esMaestro && (
          <div>
            <label className={etiqueta} htmlFor="u-rol">Rol</label>
            <select id="u-rol" className={campo} value={rol} onChange={e => setRol(e.target.value as any)}>
              <option value="asesor">Asesor</option>
              <option value="supervisor">Supervisor</option>
              <option value="entregador">Entregador</option>
            </select>
            <p className="mt-1 text-[11px] text-gray-500">Solo hay un admin maestro. Para cambiarlo usa "Hacer admin maestro" en la lista.</p>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className={etiqueta} htmlFor="u-zona">Zona</label><input id="u-zona" className={campo} value={zona} onChange={e => setZona(e.target.value)} placeholder="Ej: Norte" /></div>
          <div><label className={etiqueta} htmlFor="u-tel">Teléfono</label><input id="u-tel" className={campo} value={telefono} onChange={e => setTelefono(e.target.value)} inputMode="tel" /></div>
        </div>
        {rol === "asesor" && !esMaestro && (
          <div>
            <label className={etiqueta} htmlFor="u-sup">Supervisor</label>
            <select id="u-sup" className={campo} value={supervisorId} onChange={e => setSupervisorId(e.target.value)}>
              <option value="">{supervisores.length === 1 ? `${supervisores[0].nombre} (automático)` : "Sin supervisor"}</option>
              {supervisores.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
            </select>
          </div>
        )}
        <div>
          <p className={etiqueta}>Clave de ingreso</p>
          <div className="space-y-1.5">
            {([
              ["ninguna", modo === "nuevo" ? "Sin clave por ahora (entra solo con su correo)" : "No cambiar la clave"],
              ["generar", "Generar una clave temporal (la verás una sola vez)"],
              ["definir", "Definir una clave yo mismo"],
            ] as const).map(([v, t]) => (
              <label key={v} className="flex cursor-pointer items-center gap-2 text-xs text-gray-300">
                <input type="radio" name="clave" checked={clave === v} onChange={() => setClave(v)} /> {t}
              </label>
            ))}
          </div>
          {clave === "definir" && <input type="text" className={`${campo} mt-2 font-mono`} value={claveManual} onChange={e => setClaveManual(e.target.value)} placeholder="Mínimo 6 caracteres" />}
        </div>
        {(error || aviso) && <p className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-xs text-danger">{error || aviso}</p>}
        <div className="flex gap-2 pt-1">
          <button onClick={onCerrar} className="flex-1 rounded-xl border border-white/10 py-2.5 text-sm text-gray-300">Cancelar</button>
          <button onClick={guardar} disabled={trabajando} className="flex-1 rounded-xl bg-navy-accent py-2.5 text-sm font-semibold text-white disabled:opacity-50">{trabajando ? "Guardando..." : modo === "nuevo" ? "Crear usuario" : "Guardar cambios"}</button>
        </div>
      </div>
    </Fondo>
  )
}
