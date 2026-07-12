"use client";

import * as React from "react";
import QRCode from "qrcode";

export function QrImage({ value, size = 220 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: size, margin: 1 })
      .then((url) => {
        if (active) setDataUrl(url);
      })
      .catch(() => setDataUrl(null));
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!dataUrl) {
    return (
      <div
        className="animate-pulse rounded-md bg-muted"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <img
      src={dataUrl}
      alt="LINE login QR code"
      width={size}
      height={size}
      className="rounded-md border border-border bg-white p-2"
    />
  );
}
