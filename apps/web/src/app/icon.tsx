import { ImageResponse } from "next/og";

import { brand } from "@/lib/brand";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: brand.primary.hex,
          borderRadius: 8,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 2,
            backgroundColor: brand.neutral.onPrimary,
          }}
        />
      </div>
    ),
    size,
  );
}
