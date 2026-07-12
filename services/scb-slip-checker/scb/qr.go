package scb

import (
	"bytes"
	"fmt"
	"strconv"

	"github.com/makiuchi-d/gozxing"
	"github.com/makiuchi-d/gozxing/qrcode"
	"github.com/disintegration/imaging"
)

// parseTLV decodes an EMVCo TLV string (tag[2] + len[2] + value) into a map.
func parseTLV(data string) map[string]string {
	out := map[string]string{}
	for i := 0; i+4 <= len(data); {
		tag := data[i : i+2]
		size, err := strconv.Atoi(data[i+2 : i+4])
		if err != nil || i+4+size > len(data) {
			break
		}
		out[tag] = data[i+4 : i+4+size]
		i += 4 + size
	}
	return out
}

// parseSlipQR extracts (bank, tran) from a slip QR payload (tag 00 -> 01 bank, 02 tran).
func parseSlipQR(payload string) (bank, tran string, err error) {
	root := parseTLV(payload)
	nested, ok := root["00"]
	if !ok {
		return "", "", fmt.Errorf("invalid QR payload: missing root tag 00")
	}
	inner := parseTLV(nested)
	bank, tran = inner["01"], inner["02"]
	if bank == "" {
		return "", "", fmt.Errorf("invalid QR payload: missing bank code (tag 01)")
	}
	if tran == "" {
		return "", "", fmt.Errorf("invalid QR payload: missing transaction id (tag 02)")
	}
	return bank, tran, nil
}

// decodeQRImage reads a QR code out of an image (the slip photo).
func decodeQRImage(imgBytes []byte) (string, error) {
	img, err := imaging.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return "", err
	}
	bmp, err := gozxing.NewBinaryBitmapFromImage(img)
	if err != nil {
		return "", err
	}
	res, err := qrcode.NewQRCodeReader().Decode(bmp, nil)
	if err != nil {
		return "", fmt.Errorf("no QR code found in image")
	}
	return res.GetText(), nil
}
