package model

import (
	"encoding/binary"
	"encoding/json"
	"math"
	"os"
	"path/filepath"
	"testing"
)

func readF32(t *testing.T, path string) []float32 {
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	out := make([]float32, len(raw)/4)
	for i := range out {
		out[i] = math.Float32frombits(binary.LittleEndian.Uint32(raw[i*4:]))
	}
	return out
}

// TestLogitsMatchPyTorch validates the pure-Go forward pass against PyTorch logits
// on the exact same preprocessed input (isolates CNN math from image resizing).
func TestLogitsMatchPyTorch(t *testing.T) {
	n, err := Default()
	if err != nil {
		t.Fatal(err)
	}
	input := readF32(t, filepath.Join("testdata", "input0.f32"))
	want := readF32(t, filepath.Join("testdata", "logits0.f32"))

	got := n.logits(input)
	maxDiff := 0.0
	idx := 0
	for p := 0; p < len(got); p++ {
		for k := 0; k < len(got[p]); k++ {
			d := math.Abs(got[p][k] - float64(want[idx]))
			if d > maxDiff {
				maxDiff = d
			}
			idx++
		}
	}
	t.Logf("max abs logit diff vs PyTorch: %.6g", maxDiff)
	if maxDiff > 1e-2 {
		t.Fatalf("logits diverge from PyTorch: maxDiff=%.6g", maxDiff)
	}
}

func BenchmarkInfer(b *testing.B) {
	n, err := Default()
	if err != nil {
		b.Fatal(err)
	}
	input := readF32(&testing.T{}, filepath.Join("testdata", "input0.f32"))
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		n.Infer(input)
	}
}

// TestPredictMatchPyTorch runs the full image->answer pipeline on real captchas
// and checks the answer matches PyTorch's.
func TestPredictMatchPyTorch(t *testing.T) {
	n, err := Default()
	if err != nil {
		t.Fatal(err)
	}
	raw, err := os.ReadFile(filepath.Join("testdata", "expected.json"))
	if err != nil {
		t.Fatal(err)
	}
	var expected []struct {
		File       string  `json:"file"`
		Answer     string  `json:"answer"`
		Confidence float64 `json:"confidence"`
	}
	if err := json.Unmarshal(raw, &expected); err != nil {
		t.Fatal(err)
	}

	match := 0
	for _, e := range expected {
		img, err := os.ReadFile(filepath.Join("testdata", e.File))
		if err != nil {
			t.Fatal(err)
		}
		got, conf, _, err := n.Predict(img)
		if err != nil {
			t.Fatalf("predict %s: %v", e.File, err)
		}
		ok := got == e.Answer
		if ok {
			match++
		}
		t.Logf("%s: go=%s (%.4f)  py=%s (%.4f)  %v", e.File, got, conf, e.Answer, e.Confidence, ok)
	}
	t.Logf("answer match: %d/%d", match, len(expected))
	if match < len(expected) {
		t.Fatalf("Go answers differ from PyTorch on %d/%d captchas", len(expected)-match, len(expected))
	}
}
