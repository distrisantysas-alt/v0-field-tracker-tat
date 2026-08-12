// ============================================================================
// app/api/upload-foto/route.ts — Sube foto a Cloudinary
// ============================================================================

import { NextRequest, NextResponse } from "next/server"
import { v2 as cloudinary } from "cloudinary"
import { requireSesion } from "@/lib/auth"

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
})

export async function POST(req: NextRequest) {
  try {
    const auth = await requireSesion(req)
    if (auth instanceof NextResponse) return auth

    const { foto_base64 } = await req.json()
    if (!foto_base64) return NextResponse.json({ error: "Sin imagen" }, { status: 400 })

    const result = await cloudinary.uploader.upload(foto_base64, {
      folder:         "dsroute/visitas",
      transformation: [{ width: 800, height: 800, crop: "limit", quality: 70, fetch_format: "auto" }],
    })

    return NextResponse.json({ url: result.secure_url })
  } catch (e) {
    console.error("Cloudinary error:", e)
    return NextResponse.json({ error: "Error subiendo imagen" }, { status: 500 })
  }
}
