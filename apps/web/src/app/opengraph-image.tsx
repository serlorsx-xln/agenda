import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

export const runtime = "nodejs";
export const alt =
  "Agenda - ส่งข้อความอัตโนมัติ + ตอบกลับใน OpenChat และกลุ่ม LINE";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function resolveFontPath(filename: string): string {
  const candidates = [
    join(process.cwd(), "public/fonts", filename),
    join(process.cwd(), "apps/web/public/fonts", filename),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (!found) {
    throw new Error(`OG font not found: ${filename}`);
  }
  return found;
}

async function loadFont(filename: string): Promise<ArrayBuffer> {
  const data = await readFile(resolveFontPath(filename));
  return data.buffer.slice(
    data.byteOffset,
    data.byteOffset + data.byteLength,
  ) as ArrayBuffer;
}

export default async function OpenGraphImage() {
  const [regular, bold, extrabold] = await Promise.all([
    loadFont("LINESeedSansTH-Regular.ttf"),
    loadFont("LINESeedSansTH-Bold.ttf"),
    loadFont("LINESeedSansTH-ExtraBold.ttf"),
  ]);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: "#ffffff",
          backgroundImage:
            "linear-gradient(180deg, #ffffff 0%, #f4f4f5 100%)",
          padding: "64px 72px",
          fontFamily: "LINE Seed Sans",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: "3px solid #1c1c21",
              backgroundColor: "transparent",
            }}
          />
          <div
            style={{
              fontSize: 36,
              fontWeight: 800,
              color: "#141416",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Agenda
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: 52,
            gap: 22,
            maxWidth: 980,
          }}
        >
          <div
            style={{
              fontSize: 52,
              fontWeight: 800,
              color: "#141416",
              lineHeight: 1.28,
              letterSpacing: "-0.025em",
            }}
          >
            ยังต้องนั่งส่งข้อความทีละกลุ่มอยู่ใช่ไหม?
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 400,
              color: "#71717a",
              lineHeight: 1.45,
              maxWidth: 920,
            }}
          >
            ส่งข้อความอัตโนมัติ + ตอบกลับอัตโนมัติใน OpenChat และกลุ่ม
            LINE
          </div>
        </div>

        <div
          style={{
            display: "flex",
            marginTop: "auto",
            alignItems: "center",
            justifyContent: "space-between",
            borderTop: "1px solid #e4e4e7",
            paddingTop: 28,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              fontSize: 22,
              fontWeight: 400,
              color: "#71717a",
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 999,
                backgroundColor: "#22a06b",
              }}
            />
            Auto-send + auto-reply on your personal LINE account
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 20,
              fontWeight: 700,
              color: "#1c1c21",
              letterSpacing: "-0.01em",
            }}
          >
            ทดลองฟรี 14 วัน
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "LINE Seed Sans",
          data: regular,
          weight: 400,
          style: "normal",
        },
        {
          name: "LINE Seed Sans",
          data: bold,
          weight: 700,
          style: "normal",
        },
        {
          name: "LINE Seed Sans",
          data: extrabold,
          weight: 800,
          style: "normal",
        },
      ],
    },
  );
}
