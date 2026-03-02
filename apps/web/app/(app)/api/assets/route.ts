import { NextRequest, NextResponse } from "next/server"
import { connectSandbox } from "@/lib/sandbox-connect"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sandboxId = searchParams.get("sandboxId")

  if (!sandboxId) {
    return NextResponse.json({ error: "sandboxId is required" }, { status: 400 })
  }

  try {
    const sandbox = await connectSandbox(sandboxId)

    // Read manifest file
    const manifestPath = "/home/user/app/assets/manifest.json"
    let assets: Array<{ name: string; path: string; type: "image" | "font" | "other"; blobUrl?: string; size?: number }> = []

    try {
      const manifestData = await sandbox.files.read(manifestPath)
      const manifest = JSON.parse(manifestData.toString())

      // Convert manifest object to array and filter to only include assets with blob mappings
      const allAssets: Array<{ name: string; path: string; type: "image" | "font" | "other"; blobUrl?: string; size?: number }> = Object.values(manifest)
      assets = allAssets.filter(asset => asset.blobUrl)
    } catch (err) {
      console.log("No manifest file found, returning empty assets list")
      // No fallback to directory listing - only show assets with blob mappings
    }

    return NextResponse.json({ assets })
  } catch (error) {
    console.error("Error fetching assets:", error)
    return NextResponse.json(
      { error: "Failed to fetch assets" },
      { status: 500 }
    )
  }
}
