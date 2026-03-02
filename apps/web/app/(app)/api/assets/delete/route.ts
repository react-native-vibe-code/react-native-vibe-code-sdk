import { NextRequest, NextResponse } from "next/server"
import { connectSandbox } from "@/lib/sandbox-connect"
import { auth } from "@/lib/auth/config"
import { headers } from "next/headers"
import { del } from "@vercel/blob"

export async function DELETE(request: NextRequest) {
  // Check authentication
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { sandboxId, path } = body

    if (!sandboxId) {
      return NextResponse.json({ error: "sandboxId is required" }, { status: 400 })
    }

    if (!path) {
      return NextResponse.json({ error: "path is required" }, { status: 400 })
    }

    // Validate path is within assets directory (security check)
    if (!path.startsWith("/home/user/app/assets/")) {
      return NextResponse.json(
        { error: "Invalid path. Can only delete files in assets directory." },
        { status: 400 }
      )
    }

    // Connect to sandbox
    const sandbox = await connectSandbox(sandboxId)

    // Read manifest to get blob URL
    const manifestPath = "/home/user/app/assets/manifest.json"
    let manifest: Record<string, any> = {}
    let blobUrl: string | null = null

    try {
      const manifestData = await sandbox.files.read(manifestPath)
      manifest = JSON.parse(manifestData.toString())

      // Get the blob URL from manifest
      if (manifest[path] && manifest[path].blobUrl) {
        blobUrl = manifest[path].blobUrl
      }

      // Remove from manifest
      delete manifest[path]

      // Update manifest file
      await sandbox.files.write(manifestPath, JSON.stringify(manifest, null, 2))
    } catch (err) {
      console.log("No manifest file or error updating it:", err)
    }

    // Delete from Vercel Blob if URL exists
    if (blobUrl) {
      try {
        await del(blobUrl)
        console.log("Deleted from Vercel Blob:", blobUrl)
      } catch (err) {
        console.error("Error deleting from Vercel Blob:", err)
        // Continue even if blob deletion fails
      }
    }

    // Delete the file from sandbox
    await sandbox.commands.run(`rm -f "${path}"`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting asset:", error)
    return NextResponse.json(
      { error: "Failed to delete asset" },
      { status: 500 }
    )
  }
}
