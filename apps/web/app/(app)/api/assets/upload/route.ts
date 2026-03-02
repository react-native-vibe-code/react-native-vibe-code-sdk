import { NextRequest, NextResponse } from "next/server"
import { connectSandbox } from "@/lib/sandbox-connect"
import { auth } from "@/lib/auth/config"
import { headers } from "next/headers"
import { put } from "@vercel/blob"

const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico"]
const FONT_EXTENSIONS = [".ttf", ".otf", ".woff", ".woff2"]

function getFileType(filename: string): "image" | "font" | "other" {
  const ext = filename.toLowerCase().substring(filename.lastIndexOf("."))
  if (IMAGE_EXTENSIONS.includes(ext)) return "image"
  if (FONT_EXTENSIONS.includes(ext)) return "font"
  return "other"
}

export async function POST(request: NextRequest) {
  // Check authentication
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const formData = await request.formData()
    const file = formData.get("file") as File
    const sandboxId = formData.get("sandboxId") as string
    const projectId = formData.get("projectId") as string

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 })
    }

    if (!sandboxId) {
      return NextResponse.json({ error: "sandboxId is required" }, { status: 400 })
    }

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 })
    }

    // Validate file size (max 10MB)
    const maxSize = 10 * 1024 * 1024
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: "File size exceeds 10MB limit" },
        { status: 400 }
      )
    }

    const fileType = getFileType(file.name)
    if (fileType === "other") {
      return NextResponse.json(
        { error: "Unsupported file type. Only images and fonts are allowed." },
        { status: 400 }
      )
    }

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // Upload to Vercel Blob with organized structure: userId/projectId/assets/filename
    const userId = session.user.id
    const blobPath = `${userId}/${projectId}/assets/${file.name}`
    const blob = await put(blobPath, buffer, {
      access: "public",
      addRandomSuffix: false,
    })

    // Connect to sandbox
    const sandbox = await connectSandbox(sandboxId)

    // Determine target directory
    const targetDir = fileType === "image"
      ? "/home/user/app/assets/images"
      : "/home/user/app/assets/fonts"

    // Ensure directory exists
    await sandbox.commands.run(`mkdir -p ${targetDir}`)

    // Write to sandbox
    const targetPath = `${targetDir}/${file.name}`
    await sandbox.files.write(targetPath, buffer)

    // Update asset manifest in sandbox
    const manifestPath = "/home/user/app/assets/manifest.json"
    let manifest: Record<string, any> = {}

    try {
      const existingManifest = await sandbox.files.read(manifestPath)
      manifest = JSON.parse(existingManifest.toString())
    } catch {
      // Manifest doesn't exist yet, start with empty object
    }

    // Add or update asset in manifest
    manifest[targetPath] = {
      name: file.name,
      path: targetPath,
      type: fileType,
      size: file.size,
      blobUrl: blob.url,
      uploadedAt: new Date().toISOString(),
    }

    // Write updated manifest
    await sandbox.files.write(manifestPath, JSON.stringify(manifest, null, 2))

    return NextResponse.json({
      success: true,
      asset: {
        name: file.name,
        path: targetPath,
        type: fileType,
        size: file.size,
        blobUrl: blob.url,
      },
    })
  } catch (error) {
    console.error("Error uploading asset:", error)
    const errorMessage = error instanceof Error ? error.message : "Failed to upload asset"
    return NextResponse.json(
      { error: errorMessage, details: String(error) },
      { status: 500 }
    )
  }
}
