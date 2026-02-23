// app/api/sw-version/route.ts
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const version = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 8) 
    ?? process.env.VERCEL_DEPLOYMENT_ID?.slice(0, 8)
    ?? Date.now().toString()
  
  return NextResponse.json({ version })
}
