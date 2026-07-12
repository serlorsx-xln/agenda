// Package model runs the captcha CNN purely in Go (no torch/onnx), so the
// whole service compiles to a single static binary with the weights embedded.
package model

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"io"
	"math"
	"runtime"
	"sync"
	"sync/atomic"

	"github.com/disintegration/imaging"
)

// parallelFor runs fn(0..n-1) across all CPUs (work-stealing by atomic counter).
func parallelFor(n int, fn func(i int)) {
	workers := runtime.GOMAXPROCS(0)
	if workers > n {
		workers = n
	}
	if workers <= 1 {
		for i := 0; i < n; i++ {
			fn(i)
		}
		return
	}
	var idx int64 = -1
	var wg sync.WaitGroup
	wg.Add(workers)
	for w := 0; w < workers; w++ {
		go func() {
			defer wg.Done()
			for {
				i := int(atomic.AddInt64(&idx, 1))
				if i >= n {
					return
				}
				fn(i)
			}
		}()
	}
	wg.Wait()
}

const bnEps = 1e-5

type tensor struct {
	shape []int
	data  []float32
}

// Net holds the trained weights and architecture metadata.
type Net struct {
	Charset string
	NChars  int
	W, H    int
	t       map[string]tensor
}

type fmap struct {
	c, h, w int
	d       []float32
}

func newFmap(c, h, w int) *fmap { return &fmap{c, h, w, make([]float32, c*h*w)} }

// Load parses the model.bin produced by go/export_model.py.
func Load(r io.Reader) (*Net, error) {
	magic := make([]byte, 4)
	if _, err := io.ReadFull(r, magic); err != nil {
		return nil, err
	}
	if string(magic) != "SCBM" {
		return nil, fmt.Errorf("bad magic %q", magic)
	}
	rd := func(n int) ([]byte, error) { b := make([]byte, n); _, err := io.ReadFull(r, b); return b, err }
	i32 := func() (int, error) {
		b, err := rd(4)
		if err != nil {
			return 0, err
		}
		return int(int32(binary.LittleEndian.Uint32(b))), nil
	}

	csLen, err := i32()
	if err != nil {
		return nil, err
	}
	cs, err := rd(csLen)
	if err != nil {
		return nil, err
	}
	n := &Net{Charset: string(cs), t: map[string]tensor{}}
	if n.NChars, err = i32(); err != nil {
		return nil, err
	}
	if n.W, err = i32(); err != nil {
		return nil, err
	}
	if n.H, err = i32(); err != nil {
		return nil, err
	}
	num, err := i32()
	if err != nil {
		return nil, err
	}
	for k := 0; k < num; k++ {
		nameLen, err := i32()
		if err != nil {
			return nil, err
		}
		name, err := rd(nameLen)
		if err != nil {
			return nil, err
		}
		ndim, err := i32()
		if err != nil {
			return nil, err
		}
		shape := make([]int, ndim)
		count := 1
		for d := 0; d < ndim; d++ {
			if shape[d], err = i32(); err != nil {
				return nil, err
			}
			count *= shape[d]
		}
		raw, err := rd(count * 4)
		if err != nil {
			return nil, err
		}
		data := make([]float32, count)
		for j := 0; j < count; j++ {
			data[j] = math.Float32frombits(binary.LittleEndian.Uint32(raw[j*4:]))
		}
		n.t[string(name)] = tensor{shape, data}
	}
	return n, nil
}

// Predict decodes an image, preprocesses (grayscale + Lanczos resize, like PIL),
// and runs inference. Returns the answer, mean confidence, and per-char confidences.
func (n *Net) Predict(imgBytes []byte) (string, float64, []float64, error) {
	img, err := imaging.Decode(bytes.NewReader(imgBytes))
	if err != nil {
		return "", 0, nil, err
	}
	input := n.preprocess(img)
	ans, conf, per := n.Infer(input)
	return ans, conf, per, nil
}

// preprocess mirrors PIL: convert("L") then resize((W,H), LANCZOS), values /255.
func (n *Net) preprocess(img image.Image) []float32 {
	gray := imaging.Grayscale(img)
	resized := imaging.Resize(gray, n.W, n.H, imaging.Lanczos)
	out := make([]float32, n.H*n.W)
	for y := 0; y < n.H; y++ {
		for x := 0; x < n.W; x++ {
			r, _, _, _ := resized.At(x, y).RGBA() // grayscale: r==g==b, 16-bit
			out[y*n.W+x] = float32(r>>8) / 255.0
		}
	}
	return out
}

// logits runs the full forward pass and returns pre-softmax logits [NChars][NCls].
func (n *Net) logits(input []float32) [][]float64 {
	x := &fmap{1, n.H, n.W, input}

	x = relu(batchnorm(conv(x, n.t["cnn.0.weight"], n.t["cnn.0.bias"].data), n.t, "cnn.1"))
	x = relu(conv(x, n.t["cnn.3.weight"], n.t["cnn.3.bias"].data))
	x = maxpool(x)
	x = relu(batchnorm(conv(x, n.t["cnn.7.weight"], n.t["cnn.7.bias"].data), n.t, "cnn.8"))
	x = relu(conv(x, n.t["cnn.10.weight"], n.t["cnn.10.bias"].data))
	x = maxpool(x)
	x = relu(batchnorm(conv(x, n.t["cnn.14.weight"], n.t["cnn.14.bias"].data), n.t, "cnn.15"))
	x = relu(conv(x, n.t["cnn.17.weight"], n.t["cnn.17.bias"].data))
	x = maxpool(x)
	x = adaptiveAvgPool(x, 4, n.NChars)
	return n.head(x)
}

// Infer takes the preprocessed input (length H*W) and returns the prediction.
func (n *Net) Infer(input []float32) (string, float64, []float64) {
	logits := n.logits(input)
	nc := len(n.Charset)
	chars := make([]byte, n.NChars)
	per := make([]float64, n.NChars)
	sum := 0.0
	for p := 0; p < n.NChars; p++ {
		probs := softmax(logits[p])
		best, bestI := -1.0, 0
		for i := 0; i < nc; i++ {
			if probs[i] > best {
				best, bestI = probs[i], i
			}
		}
		chars[p] = n.Charset[bestI%nc]
		per[p] = best
		sum += best
	}
	return string(chars), sum / float64(n.NChars), per
}

// head applies permute(0,3,1,2).view(b, NChars, 512) then fc.0 -> relu -> fc.3.
func (n *Net) head(x *fmap) [][]float64 {
	w0, b0 := n.t["fc.0.weight"], n.t["fc.0.bias"].data
	w3, b3 := n.t["fc.3.weight"], n.t["fc.3.bias"].data
	in0 := w0.shape[1]  // 512
	out0 := w0.shape[0] // 256
	out3 := w3.shape[0] // n_cls
	out := make([][]float64, x.w)
	vec := make([]float32, in0)
	for pw := 0; pw < x.w; pw++ { // each char position == width column
		for ch := 0; ch < x.c; ch++ {
			for hy := 0; hy < x.h; hy++ {
				vec[ch*x.h+hy] = x.d[(ch*x.h+hy)*x.w+pw]
			}
		}
		h0 := make([]float32, out0)
		for o := 0; o < out0; o++ {
			s := b0[o]
			row := o * in0
			for i := 0; i < in0; i++ {
				s += w0.data[row+i] * vec[i]
			}
			if s < 0 {
				s = 0
			}
			h0[o] = s
		}
		logit := make([]float64, out3)
		for k := 0; k < out3; k++ {
			s := b3[k]
			row := k * out0
			for i := 0; i < out0; i++ {
				s += w3.data[row+i] * h0[i]
			}
			logit[k] = float64(s)
		}
		out[pw] = logit
	}
	return out
}

// conv: direct 3x3 stride-1 pad-1 convolution, pure arithmetic (no im2col buffer).
// The 9 taps are unrolled and the inner loop over output columns is contiguous in
// both the padded input rows and the output row — cache-friendly and allocation-light.
// Parallelised across output channels (disjoint writes).
func conv(in *fmap, w tensor, bias []float32) *fmap {
	oc, ic := w.shape[0], w.shape[1] // kh == kw == 3
	oh, ow := in.h, in.w             // pad 1, kernel 3, stride 1 → same size
	ph, pw := in.h+2, in.w+2

	// pad input once (small buffer, reused across output channels)
	padded := make([]float32, ic*ph*pw)
	for c := 0; c < ic; c++ {
		for y := 0; y < in.h; y++ {
			copy(padded[(c*ph+y+1)*pw+1:(c*ph+y+1)*pw+1+in.w], in.d[(c*in.h+y)*in.w:(c*in.h+y)*in.w+in.w])
		}
	}

	out := newFmap(oc, oh, ow)
	parallelFor(oc, func(o int) {
		outo := out.d[o*oh*ow : (o+1)*oh*ow]
		bv := bias[o]
		for i := range outo {
			outo[i] = bv
		}
		for c := 0; c < ic; c++ {
			wb := (o*ic + c) * 9
			w0, w1, w2 := w.data[wb], w.data[wb+1], w.data[wb+2]
			w3, w4, w5 := w.data[wb+3], w.data[wb+4], w.data[wb+5]
			w6, w7, w8 := w.data[wb+6], w.data[wb+7], w.data[wb+8]
			pc := padded[c*ph*pw:]
			for oy := 0; oy < oh; oy++ {
				// exact-length slices → no bounds checks in the hot loop
				r0 := pc[oy*pw : oy*pw+ow+2]
				r1 := pc[(oy+1)*pw : (oy+1)*pw+ow+2]
				r2 := pc[(oy+2)*pw : (oy+2)*pw+ow+2]
				dst := outo[oy*ow : oy*ow+ow]
				for ox := 0; ox < ow; ox++ {
					dst[ox] += w0*r0[ox] + w1*r0[ox+1] + w2*r0[ox+2] +
						w3*r1[ox] + w4*r1[ox+1] + w5*r1[ox+2] +
						w6*r2[ox] + w7*r2[ox+1] + w8*r2[ox+2]
				}
			}
		}
	})
	return out
}

func batchnorm(in *fmap, t map[string]tensor, prefix string) *fmap {
	g := t[prefix+".weight"].data
	b := t[prefix+".bias"].data
	mean := t[prefix+".running_mean"].data
	varr := t[prefix+".running_var"].data
	for c := 0; c < in.c; c++ {
		scale := g[c] / float32(math.Sqrt(float64(varr[c])+bnEps))
		shift := b[c] - mean[c]*scale
		base := c * in.h * in.w
		for i := 0; i < in.h*in.w; i++ {
			in.d[base+i] = in.d[base+i]*scale + shift
		}
	}
	return in
}

func relu(in *fmap) *fmap {
	for i := range in.d {
		if in.d[i] < 0 {
			in.d[i] = 0
		}
	}
	return in
}

func maxpool(in *fmap) *fmap {
	const k, s = 2, 2
	oh := (in.h-k)/s + 1
	ow := (in.w-k)/s + 1
	out := newFmap(in.c, oh, ow)
	for c := 0; c < in.c; c++ {
		for oy := 0; oy < oh; oy++ {
			for ox := 0; ox < ow; ox++ {
				m := float32(math.Inf(-1))
				for dy := 0; dy < k; dy++ {
					for dx := 0; dx < k; dx++ {
						v := in.d[(c*in.h+oy*s+dy)*in.w+ox*s+dx]
						if v > m {
							m = v
						}
					}
				}
				out.d[(c*oh+oy)*ow+ox] = m
			}
		}
	}
	return out
}

func adaptiveAvgPool(in *fmap, outH, outW int) *fmap {
	out := newFmap(in.c, outH, outW)
	start := func(a, outSize, inSize int) int { return a * inSize / outSize }
	end := func(a, outSize, inSize int) int { return ((a+1)*inSize + outSize - 1) / outSize }
	for c := 0; c < in.c; c++ {
		for oy := 0; oy < outH; oy++ {
			hs, he := start(oy, outH, in.h), end(oy, outH, in.h)
			for ox := 0; ox < outW; ox++ {
				ws, we := start(ox, outW, in.w), end(ox, outW, in.w)
				sum := float32(0)
				for y := hs; y < he; y++ {
					for x := ws; x < we; x++ {
						sum += in.d[(c*in.h+y)*in.w+x]
					}
				}
				out.d[(c*outH+oy)*outW+ox] = sum / float32((he-hs)*(we-ws))
			}
		}
	}
	return out
}

func softmax(logit []float64) []float64 {
	mx := math.Inf(-1)
	for _, v := range logit {
		if v > mx {
			mx = v
		}
	}
	sum := 0.0
	out := make([]float64, len(logit))
	for i, v := range logit {
		out[i] = math.Exp(v - mx)
		sum += out[i]
	}
	for i := range out {
		out[i] /= sum
	}
	return out
}
