import { ImageResponse } from "next/og"

export const size = { width: 180, height: 180 }
export const contentType = "image/png"

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 180,
          height: 180,
          background: "#f4f4f5",
          borderRadius: 40,
          border: "8px solid #18181b",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 10,
          padding: "28px 32px",
        }}
      >
        <div style={{ width: 26, height: 42, background: "#18181b", borderRadius: 4 }} />
        <div style={{ width: 26, height: 72, background: "#18181b", borderRadius: 4 }} />
        <div style={{ width: 26, height: 104, background: "#18181b", borderRadius: 4 }} />
      </div>
    ),
    { ...size },
  )
}
