//go:build windows

package main

import "golang.org/x/sys/windows"

// enableANSI turns on virtual-terminal processing so ANSI colors render in the
// Windows console (Windows Terminal / VS Code / PowerShell).
func enableANSI() {
	for _, std := range []uint32{windows.STD_OUTPUT_HANDLE, windows.STD_ERROR_HANDLE} {
		h, err := windows.GetStdHandle(std)
		if err != nil {
			continue
		}
		var mode uint32
		if windows.GetConsoleMode(h, &mode) != nil {
			continue
		}
		_ = windows.SetConsoleMode(h, mode|windows.ENABLE_VIRTUAL_TERMINAL_PROCESSING)
	}
}
