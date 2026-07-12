package model

import (
	"bytes"
	_ "embed"
)

//go:embed model.bin
var modelBin []byte

var defaultNet *Net

// Default loads the embedded model once and caches it.
func Default() (*Net, error) {
	if defaultNet != nil {
		return defaultNet, nil
	}
	n, err := Load(bytes.NewReader(modelBin))
	if err != nil {
		return nil, err
	}
	defaultNet = n
	return n, nil
}
