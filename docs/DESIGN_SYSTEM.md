# Agenda Design System

เอกสารนี้ถอดจาก UI จริงของ Agenda (`apps/web`) เพื่อเอามา reuse กับโปรเจกต์อื่นได้  
แหล่งความจริงในโค้ด: `apps/web/src/app/globals.css`, `apps/web/tailwind.config.ts`, `apps/web/src/components/ui/*`

---

## 1. หลักคิด (Principles)

| หลัก | ความหมายใน Agenda |
|------|-------------------|
| Neutral first | ฐานเป็นเทา-ดำ/ขาว + **Deep Teal** เป็น brand accent เดียว |
| Type, not chrome | ใช้ type scale ชัด + น้ำหนักตัวอักษร สร้าง hierarchy มากกว่าเงาหลายชั้น |
| Product UI = calm | Dashboard เรียบ อ่านง่าย เน้นสถานะและตัวเลข |
| Marketing = one composition | Hero เป็นองค์ประกอบเดียว: หัวข้อ + คำอธิบาย + CTA + ภาพผลิตภัณฑ์ |
| Semantic color | สี vivид ใช้เฉพาะ destructive / success / warning และ status badge |
| Light + Dark | Token เดียวกัน สลับด้วย class `.dark` (`next-themes`) |
| Touch-friendly | ความสูงปุ่มขั้นต่ำประมาณ 36–44px (`h-9` / `min-h-11`) |

**ไม่ใช่** look แบบ:
- Purple-on-white / purple→indigo gradient
- Warm cream `#F4F1EA` + serif + terracotta
- Broadsheet (เส้นบาง หนาแน่น เหมือนหนังสือพิมพ์)
- Glow จัด / pill เต็มวง / เงาหลายชั้นซ้อน / emoji เป็น UI หลัก

---

## 2. Stack ที่ใช้ประกอบระบบ

| ชั้น | เทคโนโลยี |
|------|-----------|
| Styling | Tailwind CSS 3 + CSS variables (HSL channels) |
| Components | แนว shadcn/ui — Radix primitives + `class-variance-authority` (CVA) |
| Icons | `lucide-react` (stroke ~1.75–2) |
| Theme | `next-themes` — `darkMode: ["class"]` |
| Motion | `tailwindcss-animate` + keyframe เล็กน้อย |
| Utils | `clsx` + `tailwind-merge` (ต่อ type scale ใน `cn()`) |
| Font | LINE Seed Sans TH โหลดเองจาก `/public/fonts` |

---

## 3. Brand mark

Logo แบบข้อความ + เครื่องหมายสี่เหลี่ยม **พื้น teal** (ไม่ใช้ wordmark ภาพ):

- ช่องสี่เหลี่ยม `16×16` (`h-4 w-4`), `rounded-[4px]`, `bg-primary` + จุดขาวตรงกลาง
- ชื่อแบรนด์ข้าง คู่: `font-bold tracking-tight text-body-lg`
- ในแอป: component `Logo` → `apps/web/src/components/brand/logo.tsx`
- ค่าสีนอก CSS: `apps/web/src/lib/brand.ts`

พอร์ตไปโปรเจกต์อื่น: เปลี่ยนชื่อแบรนด์อย่างเดียว เครื่องหมายสีตาม `--primary`

---

## 4. Color system

ค่าใน CSS เก็บเป็น **HSL โดยไม่มี `hsl()`** เช่น `240 10% 8%` แล้วห่อตอนใช้เป็น `hsl(var(--token))`

### 4.1 Light (`:root`)

| Token | HSL | ประมาณ HEX | ใช้ทำอะไร |
|-------|-----|------------|-----------|
| `--background` | `0 0% 100%` | `#FFFFFF` | พื้นหน้า |
| `--foreground` | `240 10% 8%` | `#141416` | ข้อความหลัก |
| `--card` | `0 0% 100%` | `#FFFFFF` | พื้นการ์ด |
| `--card-foreground` | `240 10% 8%` | `#141416` | ข้อความบนการ์ด |
| `--popover` | `0 0% 100%` | `#FFFFFF` | dropdown / popover |
| `--popover-foreground` | `240 10% 8%` | `#141416` | — |
| `--primary` | `172 42% 36%` | `#358F7A` | ปุ่มหลัก, ลิงก์, logo mark |
| `--primary-foreground` | `0 0% 98%` | `#FAFAFA` | ข้อความบน primary |
| `--primary-hover` | `172 42% 30%` | `#2D7866` | hover ปุ่ม primary |
| `--primary-soft` | `172 35% 95%` | `#EEF6F4` | highlight / banner tint |
| `--primary-soft-foreground` | `172 42% 28%` | `#2A6B5C` | ข้อความบน soft tint |
| `--secondary` | `240 5% 96%` | `#F4F4F5` | พื้นรอง |
| `--secondary-foreground` | `240 6% 12%` | `#1C1C20` | — |
| `--muted` | `240 5% 96%` | `#F4F4F5` | พื้นเงียบ / section wash |
| `--muted-foreground` | `240 4% 44%` | `#6B6B73` | คำอธิบาย, hint |
| `--accent` | `172 30% 95%` | `#EDF5F3` | hover surface (teal tint) |
| `--accent-foreground` | `172 42% 28%` | `#2A6B5C` | — |
| `--destructive` | `0 72% 46%` | `#CA1F1F` | ลบ / error |
| `--destructive-foreground` | `0 0% 98%` | `#FAFAFA` | — |
| `--success` | `142 55% 34%` | `#278A45` | สำเร็จ |
| `--success-foreground` | `0 0% 98%` | `#FAFAFA` | — |
| `--warning` | `35 80% 44%` | `#C97016` | เตือน / กำลังทำ |
| `--warning-foreground` | `0 0% 98%` | `#FAFAFA` | — |
| `--border` | `240 6% 90%` | `#E4E4E9` | เส้นขอบ |
| `--input` | `240 6% 90%` | `#E4E4E9` | ขอบช่องกรอก |
| `--ring` | `172 42% 36%` | `#358F7A` | focus ring |

### 4.2 Dark (`.dark`)

| Token | HSL | ประมาณ HEX |
|-------|-----|------------|
| `--background` | `240 10% 6%` | `#0E0E12` |
| `--foreground` | `0 0% 96%` | `#F5F5F5` |
| `--card` | `240 8% 9%` | `#151519` |
| `--card-foreground` | `0 0% 96%` | `#F5F5F5` |
| `--popover` | `240 8% 9%` | `#151519` |
| `--popover-foreground` | `0 0% 96%` | `#F5F5F5` |
| `--primary` | `172 38% 52%` | `#52A894` |
| `--primary-foreground` | `172 30% 10%` | `#121816` |
| `--primary-hover` | `172 38% 58%` | `#5FB5A0` |
| `--primary-soft` | `172 25% 14%` | `#1A2623` |
| `--primary-soft-foreground` | `172 35% 78%` | `#A8D4C8` |
| `--secondary` | `240 5% 15%` | `#242428` |
| `--secondary-foreground` | `0 0% 96%` | `#F5F5F5` |
| `--muted` | `240 5% 15%` | `#242428` |
| `--muted-foreground` | `240 5% 62%` | `#9696A0` |
| `--accent` | `172 22% 16%` | `#202926` |
| `--accent-foreground` | `172 35% 78%` | `#A8D4C8` |
| `--destructive` | `0 62% 52%` | `#D14747` |
| `--destructive-foreground` | `0 0% 98%` | `#FAFAFA` |
| `--success` | `142 50% 45%` | `#39A85A` |
| `--success-foreground` | `0 0% 8%` | `#141414` |
| `--warning` | `35 80% 55%` | `#E8922A` |
| `--warning-foreground` | `0 0% 8%` | `#141414` |
| `--border` | `240 5% 18%` | `#2C2C32` |
| `--input` | `240 5% 20%` | `#313137` |
| `--ring` | `172 38% 52%` | `#52A894` |

### 4.3 การใช้งานใน Tailwind

```txt
bg-background  text-foreground
bg-primary     text-primary-foreground
bg-muted       text-muted-foreground
border-border  ring-ring
bg-success/12  text-success   ← badge แบบ soft tint
```

Badge success/warning/destructive ใช้พื้นโปร่ง `bg-{color}/12` + ตัวอักษรสีเต็ม — ไม่ใส่พื้นทึบยกเว้นปุ่ม

### 4.4 Email / นอกเบราว์เซอร์

อีเมลใช้ HEX จาก `apps/web/src/lib/brand.ts` (teal CTA `#358F7A`) + ฟอนต์ fallback Arial — ดู `apps/web/src/lib/email.ts`

---

## 5. Typography

### 5.1 Family

**LINE Seed Sans** (Thai + Latin), self-hosted:

| Weight | File (WOFF2) | CSS weight |
|--------|--------------|------------|
| Regular | `LINESeedSansTH_W_Rg.woff2` | 400 |
| Bold | `LINESeedSansTH_W_Bd.woff2` | 700 |
| ExtraBold | `LINESeedSansTH_W_XBd.woff2` | 800 |

- CSS var: `--font-line-seed`
- Stack: `var(--font-line-seed)`, `LINE Seed Sans`, `system-ui`, `-apple-system`, `sans-serif`
- `font-display: swap`
- OG image ใช้ TTF คู่ขนาน (Satori ไม่กิน WOFF2) — ดู `apps/web/public/fonts/README.md`
- License: SIL OFL 1.1 — แหล่ง https://seed.line.me

### 5.2 Type scale (เข้มงวด)

ทับ Tailwind `fontSize` มาตรฐาน — **อย่าใช้** `text-sm` / `text-xl` เป็นหลักใน UI นี้ ให้ใช้ชื่อด้านล่าง

| Token | Size | Line-height | Letter-spacing | ใช้เมื่อ |
|-------|------|-------------|----------------|----------|
| `caption` | 0.75rem (12px) | 1rem | — | badge, meta เล็กมาก |
| `small` | 0.8125rem (13px) | 1.25rem | — | hint, subtitle, secondary copy |
| `body` | 0.9375rem (15px) | 1.5rem | — | ค่าเริ่มต้นของ `body` |
| `body-lg` | 1rem (16px) | 1.6rem | — | hero subtitle, logo wordmark |
| `h3` | 1.125rem (18px) | 1.6rem | -0.01em | การ์ด title, หัวข้อย่อย |
| `h2` | 1.375rem (22px) | 1.85rem | -0.01em | หัวข้อกลาง |
| `h1` | 1.75rem (28px) | 2.15rem | -0.02em | หัวหน้าเพจ / section |
| `display` | 2.25rem (36px) | 2.6rem | -0.02em | marketing hero (มือถือ) |
| `display-lg` | 2.75rem (44px) | 3.05rem | -0.025em | marketing hero (desktop) |

Base styles:

```txt
body → text-body antialiased
h1   → text-h1 font-bold
h2   → text-h2 font-bold
h3   → text-h3 font-bold
```

`font-feature-settings: "rlig" 1, "calt" 1` บน `body`

**หน้า Page header (dashboard):**  
`h1.text-h1.font-bold` + subtitle `text-small text-muted-foreground`

---

## 6. Radius, spacing, layout

### 6.1 Radius

```txt
--radius: 0.625rem   /* 10px */
rounded-lg = var(--radius)                 /* 10px — cards */
rounded-md = calc(var(--radius) - 2px)     /* 8px  — buttons, inputs, badges */
rounded-sm = calc(var(--radius) - 4px)     /* 6px */
```

Logo mark ใช้ `rounded-[4px]` โดยเฉพาะ

### 6.2 Container

```txt
container: center, padding 1.5rem, max 2xl = 1200px
```

Dashboard content: `max-w-6xl`, padding `px-4 md:px-8`, `pt-6`

Marketing sections มักใช้ `py-20` / `md:py-28` และหัวข้อ `max-w-2xl|3xl` จัดกลาง

### 6.3 Spacing แนวปฏิบัติ

| บริบท | Gap / padding ที่พบบ่อย |
|--------|-------------------------|
| Card header/content | `p-6`, gap `1.5` |
| Form fields | `space-y-1.5` ระหว่าง label↔control |
| Button groups | `gap-2` / `gap-3` |
| Feature grid | `gap-5`, `sm:grid-cols-2`, `lg:grid-cols-4` |
| Mobile bottom nav safe area | `pb-[calc(5.5rem+env(safe-area-inset-bottom))]` |

---

## 7. Elevation & borders

- UI ส่วนใหญ่พึ่ง **border** (`border-border`) มากกว่าเงา
- Card: `rounded-lg border border-border bg-card`
- Hero product shot:

```txt
rounded-xl border border-border/70 bg-muted/50
shadow-[0_24px_80px_-32px_hsl(var(--foreground)/0.35)]
ring-1 ring-black/5 dark:ring-white/10
```

- Section wash: `bg-muted/30` + `border-t border-border`
- Input: `shadow-sm` เบาๆ

---

## 8. Motion

| ชื่อ | พฤติกรรม |
|------|----------|
| `animate-hero-image` | fade + translateY 8px → 0 ใน 0.6s ease-out; **ปิด**ถ้า `prefers-reduced-motion` |
| accordion | 0.2s ease-out (Radix height) |
| dialog overlay/content | `animate-in` / `fade` จาก `tailwindcss-animate` |
| buttons / badges | `transition-colors` เท่านั้น — ไม่ bounce |

หลัก: **เคลื่อนไหวเพื่อ hierarchy / เข้า** ไม่ใช่ noise

---

## 9. Components (inventory)

โฟลเดอร์หลัก: `apps/web/src/components/ui/`

### 9.1 Button

Variants: `default` | `destructive` | `outline` | `secondary` | `ghost` | `link`  
Sizes: `default` (h-9) | `sm` (h-8) | `lg` (h-11) | `touch` (min-h-11) | `icon` (9×9)

Base: `text-small font-medium rounded-md`, focus `ring-2 ring-ring ring-offset-2`

CTA หลัก = `default` (พื้น primary)  
CTA รอง = `outline`

### 9.2 Badge

Variants: `default` | `secondary` | `outline` | `success` | `warning` | `destructive` | `muted`  
รูปทรง: `rounded-md`, `text-caption font-medium`, `px-2 py-0.5`

Status mapping (dashboard):

| Domain | success | warning | destructive | muted / secondary |
|--------|---------|---------|-------------|-------------------|
| Connection | connected | connecting | error | disconnected |
| Run | success | running, partial | failed | queued, cancelled |
| Event | success | — | failed | skipped / info |
| Payment | paid | pending | failed | expired |

### 9.3 Form controls

- **Input / Textarea / Select:** h-9, `rounded-md`, `border-input`, `text-body`, focus ring-2
- **Label + FieldHint:** label คม, hint เป็น `text-caption|small text-muted-foreground`
- **Switch:** ใช้ในแถวตั้งค่าแบบ `border` + `p-3` แยก label ซ้าย / control ขวา

### 9.4 Card

โครงสร้าง: `Card` → `CardHeader` / `CardTitle` / `CardDescription` / `CardContent`  
Title = `text-h3 font-bold tracking-tight`  
Description = `text-small text-muted-foreground`

### 9.5 Overlay

| ชั้น | z-index | หมายเหตุ |
|------|---------|----------|
| Dialog overlay/content | `z-[100]` | modal หลัก |
| Dropdown / Tooltip | `z-[110]` | ต้องอยู่เหนือ dialog |

Overlay สี: `bg-black/50`

### 9.6 Feedback

- Toast: Sonner (`components/ui/sonner.tsx`)
- Confirm: `ConfirmDialog` ห่อ Dialog

### 9.7 Icons

Lucide — ขนาดในฟีเจอร์การ์ด `h-5 w-5`, ในปุ่ม `size-4` อัตโนมัติผ่าน `[&_svg]:size-4`

---

## 10. Marketing patterns

Hero (หนึ่งองค์ประกอบ):

1. ชื่อ/หัวข้อ `text-display md:text-display-lg font-bold tracking-tight` จัดกลาง
2. คำอธิบายสั้น `text-body-lg text-muted-foreground` (`max-w-2xl`)
3. CTA group: Primary `Button size="lg"` + Outline `size="lg"`
4. Proof line เล็ก (`text-small text-muted-foreground`)
5. ภาพผลิตภัณฑ์เต็มความกว้างคอนเทนต์ (`max-w-5xl`) — light/dark สลับด้วย `dark:hidden` / `dark:block` เพื่อ contrast กับพื้นหน้า

Section ทั่วไป:

- หัว `text-h1 font-bold` + subtitle `text-body text-muted-foreground`
- Features เป็น grid การ์ด — ไอคอน → หัว `h3` → คำอธิบาย `text-small muted`
- Pricing / FAQ ตามด้วย `border-t` คั่นจังหวะ

Header: โลโก้ซ้าย + nav ลิงก์ text + CTA ปุ่ม

---

## 11. Dashboard patterns

| ชิ้น | แพทเทิร์น |
|------|-----------|
| Shell | Sidebar desktop + Topbar + Mobile bottom nav |
| Page | `PageHeader` แล้วเนื้อหา `space-y-*` |
| Metrics | การ์ดตัวเลข / badge สถานะ ไม่ใส่กราฟฉูด |
| Forms (dialog) | ฟิลด์แนวตั้ง, help text เป็น caption, advanced ซ่อนในโหมดง่าย |
| Dense lists | ตารางหรือรายการมี border บาง + badge สถานะขวา |

จังหวะสี: พื้น `background` การ์ด `card` แถบแจ้งเตือนใช้ border + tint น้อย (success/warning/destructive)

---

## 12. Accessibility & interaction

- Focus ชัด: `focus-visible:ring-2` + `ring-offset` บนพื้น `background`
- ปุ่ม disabled: `opacity-50` + `pointer-events-none`
- ลด motion: hero animation เคารพ `prefers-reduced-motion`
- สัมผัส: ใช้ `size="touch"` / `min-h-11` สำหรับเป้าหมายมือถือสำคัญ
- `lang` จาก locale (th / en), timezone แสดงผลหลัก `Asia/Bangkok` (ผลิตภัณฑ์)

---

## 13. i18n (เกี่ยวข้องกับ UI copy)

- ข้อความ UI ผ่าน `next-intl` (`messages/th.json`, `en.json`)
- Design ไม่ hardcode คำไทยใน component ที่ reuse ได้ — แยก copy กับ visual
- ฟอนต์ต้องรองรับไทย (+ ละติน) — LINE Seed จึงเป็นศูนย์กลาง

---

## 14. ไฟล์อ้างอิงใน repo

| หัวข้อ | Path |
|--------|------|
| Tokens + fonts | `apps/web/src/app/globals.css` |
| Tailwind map | `apps/web/tailwind.config.ts` |
| `cn` + type scale merge | `apps/web/src/lib/utils.ts` |
| UI kit | `apps/web/src/components/ui/*` |
| Logo | `apps/web/src/components/brand/logo.tsx` |
| Status badges | `apps/web/src/components/dashboard/status-badge.tsx` |
| Theme provider | `apps/web/src/components/providers.tsx` |
| Fonts README | `apps/web/public/fonts/README.md` |
| Landing composition | `apps/web/src/app/(marketing)/page.tsx` |

---

## 15. Checklist พอร์ตไปโปรเจกต์ใหม่

1. คัดลอกชุด CSS variables (light + dark) และ `--radius`
2. ตั้ง `fontFamily.sans` + type scale ใน Tailwind เหมือนตารางด้านบน
3. โหลดฟอนต์ (LINE Seed หรือฟอนต์ expressive อื่นที่รองรับภาษาเป้าหมาย — **อย่า**กลับไป Inter/Roboto/Arial เป็นตัวหลักถ้าอยากได้โทนเดียวกัน)
4. ตั้ง `darkMode: ['class']` + theme toggle
5. สร้าง Button / Badge / Card / Input ด้วย CVA ตาม variants ด้านบน
6. ตั้ง z-index: dialog `100`, tooltip/dropdown `110`
7. ล็อกกฎ: ไม่ purple gradient, ไม่ cream+serif+terracotta, ไม่ broadsheet
8. Marketing: hero = brand/headline + one sentence + CTA + one product visual
9. Dashboard: border-first, semantic badges, calm neutrals

### Minimal CSS starter (คัดลอกได้)

```css
:root {
  --font-line-seed: "LINE Seed Sans";
  --background: 0 0% 100%;
  --foreground: 240 10% 8%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 8%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 8%;
  --primary: 172 42% 36%;
  --primary-foreground: 0 0% 98%;
  --primary-hover: 172 42% 30%;
  --primary-soft: 172 35% 95%;
  --primary-soft-foreground: 172 42% 28%;
  --secondary: 240 5% 96%;
  --secondary-foreground: 240 6% 12%;
  --muted: 240 5% 96%;
  --muted-foreground: 240 4% 44%;
  --accent: 172 30% 95%;
  --accent-foreground: 172 42% 28%;
  --destructive: 0 72% 46%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 55% 34%;
  --success-foreground: 0 0% 98%;
  --warning: 35 80% 44%;
  --warning-foreground: 0 0% 98%;
  --border: 240 6% 90%;
  --input: 240 6% 90%;
  --ring: 172 42% 36%;
  --radius: 0.625rem;
}

.dark {
  --background: 240 10% 6%;
  --foreground: 0 0% 96%;
  --card: 240 8% 9%;
  --card-foreground: 0 0% 96%;
  --popover: 240 8% 9%;
  --popover-foreground: 0 0% 96%;
  --primary: 172 38% 52%;
  --primary-foreground: 172 30% 10%;
  --primary-hover: 172 38% 58%;
  --primary-soft: 172 25% 14%;
  --primary-soft-foreground: 172 35% 78%;
  --secondary: 240 5% 15%;
  --secondary-foreground: 0 0% 96%;
  --muted: 240 5% 15%;
  --muted-foreground: 240 5% 62%;
  --accent: 172 22% 16%;
  --accent-foreground: 172 35% 78%;
  --destructive: 0 62% 52%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 50% 45%;
  --success-foreground: 0 0% 8%;
  --warning: 35 80% 55%;
  --warning-foreground: 0 0% 8%;
  --border: 240 5% 18%;
  --input: 240 5% 20%;
  --ring: 172 38% 52%;
}
```

---

## 16. สรุปโทนในประโยคเดียว

> UI เทา–ดำสะอาด + **Deep Teal** เป็น brand accent, ตัวอักษร LINE Seed หนักแน่น, มุม ~8–10px, border เป็นหลัก, สี vivид เฉพาะสถานะ, รองรับ dark mode, marketing เรียบเป็น composition เดียว ไม่เน้นการ์ดใน hero

อัปเดตล่าสุด: สอดคล้องกับโค้ด Agenda ณ เอกสารนี้ถูกเขียน (token จาก `globals.css` / scale จาก `tailwind.config.ts`)
