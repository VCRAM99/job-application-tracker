import { ImageResponse } from "next/og"

export const size = { width: 32, height: 32 }
export const contentType = "image/png"

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: 32,
          height: 32,
          background: "#f4f4f5",
          borderRadius: 8,
          border: "2px solid #18181b",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 2,
          padding: "5px 6px",
        }}
      >
        <div style={{ width: 5, height: 8, background: "#18181b", borderRadius: 1 }} />
        <div style={{ width: 5, height: 13, background: "#18181b", borderRadius: 1 }} />
        <div style={{ width: 5, height: 18, background: "#18181b", borderRadius: 1 }} />
      </div>
    ),
    { ...size },
  )
}
