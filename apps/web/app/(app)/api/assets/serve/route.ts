import { NextRequest, NextResponse } from "next/server"
import { connectSandbox } from "@/lib/sandbox-connect"

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sandboxId = searchParams.get("sandboxId")
  const path = searchParams.get("path")

  if (!sandboxId || !path) {
    return NextResponse.json(
      { error: "sandboxId and path are required" },
      { status: 400 }
    )
  }

  // Validate path is within assets directory (security check)
  if (!path.startsWith("/home/user/app/assets/")) {
    return NextResponse.json(
      { error: "Invalid path. Can only serve files from assets directory." },
      { status: 400 }
    )
  }

  try {
    const sandbox = await connectSandbox(sandboxId)

    // Read the file from sandbox
    const fileBuffer = await sandbox.files.read(path)

    // Determine content type from file extension
    const ext = path.toLowerCase().substring(path.lastIndexOf("."))
    const contentTypeMap: Record<string, string> = {
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".gif": "image/gif",
      ".webp": "image/webp",
      ".svg": "image/svg+xml",
      ".ico": "image/x-icon",
    }

    const contentType = contentTypeMap[ext] || "application/octet-stream"

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    })
  } catch (error) {
    console.error("Error serving asset:", error)
    return NextResponse.json(
      { error: "Failed to serve asset" },
      { status: 500 }
    )
  }
}
