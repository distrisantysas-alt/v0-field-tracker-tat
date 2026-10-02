// ============================================================================
// lib/pos-devoluciones.ts
// Lee el CSV de ventas exportado del POS y extrae solo las devoluciones
// (notas credito / anulaciones: documentos con total negativo o prefijo NC).
// El CSV trae una fila por producto; aqui se deduplica por "ID de Venta".
// Corre en el navegador: el archivo (~4 MB) nunca se sube completo al servidor.
// ============================================================================

export type DevolucionPOS = {
  idVenta: string
  prefijo: string
  numero: string
  fecha: string // AAAA-MM-DD
  asesorPos: string
  cliente: string
  nit: string
  valor: number
}

function decodificar(buffer: ArrayBuffer): string {
  let texto = new TextDecoder("utf-8").decode(buffer)
  if (texto.includes("�")) texto = new TextDecoder("windows-1252").decode(buffer)
  return texto.replace(/^﻿/, "")
}

function parsearCSV(texto: string, delim = ";"): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ""
  let entreComillas = false
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++ } else entreComillas = false
      } else campo += c
      continue
    }
    if (c === '"') entreComillas = true
    else if (c === delim) { fila.push(campo); campo = "" }
    else if (c === "\r") continue
    else if (c === "\n") { fila.push(campo); filas.push(fila); fila = []; campo = "" }
    else campo += c
  }
  if (campo.length || fila.length) { fila.push(campo); filas.push(fila) }
  return filas
}

function sinTildes(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

function valorPesos(s: string | undefined): number {
  if (!s) return 0
  let t = s.replace(/\$/g, "").replace(/&#8209;/g, "-").trim()
  let negativo = false
  if (t.startsWith("-")) { negativo = true; t = t.slice(1) }
  const n = parseFloat(t.replace(/\./g, "").replace(/,/g, ".")) || 0
  return negativo ? -n : n
}

// "01-09-2026-04:43 pm" -> "2026-09-01"
function fechaISO(s: string): string | null {
  const m = s.match(/^(\d{2})-(\d{2})-(\d{4})/)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

export function leerDevolucionesPOS(buffer: ArrayBuffer): { devoluciones: DevolucionPOS[]; facturas: number } {
  const filas = parsearCSV(decodificar(buffer))
  const encabezado = (filas.shift() ?? []).map(sinTildes)

  const col = (nombre: string) => encabezado.indexOf(nombre)
  const iId = col("id de venta")
  const iPref = col("prefijo")
  const iNum = col("numero de factura")
  const iFecha = col("fecha")
  const iVend = col("vendido por")
  const iCli = col("vendido a")
  const iNit = encabezado.findIndex(h => h.startsWith("identificacion/nit"))
  const iTotal = encabezado.lastIndexOf("totales") // el total de la factura, no el de la linea

  if ([iId, iPref, iFecha, iVend, iCli, iTotal].some(i => i < 0)) {
    throw new Error("El archivo no tiene el formato del POS (faltan columnas como ID de Venta, Prefijo, Fecha o Vendido por).")
  }

  const vistas = new Set<string>()
  const devoluciones: DevolucionPOS[] = []

  for (const f of filas) {
    if (f.length <= iTotal) continue
    const id = (f[iId] ?? "").trim()
    if (!id || vistas.has(id)) continue
    vistas.add(id)

    const total = valorPesos(f[iTotal])
    const prefijo = (f[iPref] ?? "").trim()
    if (total >= 0 && prefijo.toUpperCase() !== "NC") continue

    const fecha = fechaISO((f[iFecha] ?? "").trim())
    if (!fecha) continue

    const partes = (f[iVend] ?? "").split("/")
    devoluciones.push({
      idVenta: id,
      prefijo,
      numero: (f[iNum] ?? "").trim(),
      fecha,
      asesorPos: partes[partes.length - 1].trim().replace(/\s+/g, " "),
      cliente: (f[iCli] ?? "").trim(),
      nit: iNit >= 0 ? (f[iNit] ?? "").trim() : "",
      valor: total,
    })
  }

  return { devoluciones, facturas: vistas.size }
}
