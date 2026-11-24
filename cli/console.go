package main

import (
	"fmt"
	"runtime"
	"strings"
)

// Println prints to stdout ensuring CRLF on Windows to prevent terminal staircasing.
func Println(a ...any) {
	initWindowsConsole()
	msg := fmt.Sprintln(a...)
	if runtime.GOOS == "windows" {
		msg = strings.ReplaceAll(strings.ReplaceAll(msg, "\r\n", "\n"), "\n", "\r\n")
	}
	fmt.Print(msg)
}

// Printf formats and prints to stdout ensuring CRLF on Windows to prevent terminal staircasing.
func Printf(format string, a ...any) {
	initWindowsConsole()
	msg := fmt.Sprintf(format, a...)
	if runtime.GOOS == "windows" {
		msg = strings.ReplaceAll(strings.ReplaceAll(msg, "\r\n", "\n"), "\n", "\r\n")
	}
	fmt.Print(msg)
}

// Print prints to stdout ensuring CRLF on Windows.
func Print(a ...any) {
	initWindowsConsole()
	msg := fmt.Sprint(a...)
	if runtime.GOOS == "windows" {
		msg = strings.ReplaceAll(strings.ReplaceAll(msg, "\r\n", "\n"), "\n", "\r\n")
	}
	fmt.Print(msg)
}
