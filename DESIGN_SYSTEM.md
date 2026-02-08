# RedFlag Design System

## Result Page Layout

All three result pages (Screenshot, Scan QR, Verify Link) follow a standardized layout structure for consistency.

### Layout Hierarchy

```
1. Aperture Score Ring         (centered, w-72 h-72)
2. Language Toggle             (centered pill button, conditional)
3. Headline                    (text-4xl, font-black, risk-colored, centered)
4. Category Label              (text-xs, font-mono, "Risk Context: {category}")
5. Explanation Box             (bg-slate-50/80, rounded-3xl, p-6)
6. Feature-Specific Cards      (varies per feature)
7. DetailCard: "The Hook"      (Anchor icon, blue)
8. DetailCard: "Technical Trap" (Zap icon, amber)
9. Technical Signals           (bg-neutral-50/40, staggered red flag list)
10. Sticky Footer              (action button + START ANOTHER SCAN)
```

### Risk-Level Colors

| Level     | Headline        | Signal Dots   | Footer Button                     |
|-----------|-----------------|---------------|-----------------------------------|
| DANGER    | `text-red-600`  | `bg-red-500`  | `bg-red-600` (Block & Report)     |
| CAUTION   | `text-amber-600`| `bg-red-500`  | `bg-amber-600` (Proceed/Report)   |
| SAFE      | `text-emerald-600`| `bg-emerald-500` | `bg-slate-900` (Open Link)    |

### Shared Components

#### Aperture (`components/Aperture.tsx`)
Circular score visualization with animated ring, crosshairs, and threat level display.
```tsx
<Aperture isAnalyzing={false} score={result.score} />
```
- Score > 80: red ring + red glow
- Score < 20: emerald ring + emerald glow
- Otherwise: amber ring

#### DetailCard
Standard card for Hook and Trap content.
```tsx
<DetailCard
  title="The Hook"
  content={activeContent.hook}
  icon={<Anchor size={14} className="text-blue-500" />}
/>
```
Style: `bg-white/70 border border-neutral-100 rounded-3xl p-6 shadow-sm`

#### Technical Signals
Staggered-animation list of red flags.
- SAFE: emerald dots
- DANGER/CAUTION: red dots
- Container: `bg-neutral-50/40 border border-neutral-100 rounded-3xl p-6`

#### Sticky Footer
```
[Full-width action button]
START ANOTHER SCAN (text link: font-mono, text-[10px], tracking-widest)
```
Fixed to bottom: `bg-white/90 backdrop-blur-2xl border-t border-neutral-100 z-50`

### Feature-Specific Cards (Section 6)

#### Screenshot Results (`App.tsx` inline)
No feature-specific cards. Goes directly to Hook/Trap.

#### Scan QR Results (`ScanResultPage.tsx`)
- **Scanned URL card**: Displays highlighted URL with copy button

#### Verify Link Results (`LinkResultPage.tsx`)
- **URL Autopsy card**: Parsed URL with suspicious TLD highlighting + AI Insight
- **Impersonation Analysis card**: Shows impersonated brand vs actual domain
- **Digital Fingerprint card**: 2x2 grid (Domain Age, Hosted In, DNS, Safe Browsing) with verified/estimate badges

### Typography

| Element          | Classes                                                        |
|------------------|----------------------------------------------------------------|
| Headline         | `text-4xl font-black tracking-tighter uppercase leading-none`  |
| Category         | `text-xs font-mono uppercase tracking-[0.2em] font-bold`      |
| Card title       | `text-[10px] font-black uppercase tracking-[0.2em]`           |
| Explanation      | `text-sm font-bold leading-relaxed`                            |
| Footer text link | `text-[10px] font-mono font-bold uppercase tracking-widest`   |

### Card Styles

| Card Type          | Background          | Border                | Radius       |
|--------------------|---------------------|-----------------------|--------------|
| Explanation box    | `bg-slate-50/80`    | `border-slate-100`    | `rounded-3xl`|
| Content card       | `bg-white/70`       | `border-neutral-100`  | `rounded-3xl`|
| Signals container  | `bg-neutral-50/40`  | `border-neutral-100`  | `rounded-3xl`|
| Signal item        | `bg-white`          | `border-neutral-100/50`| `rounded-2xl`|

### Animation Patterns

- Page enter: `initial={{ opacity: 0, y: 30 }}` → `animate={{ opacity: 1, y: 0 }}`
- View mode switch: `initial={{ opacity: 0, y: 10 }}` → `animate={{ opacity: 1, y: 0 }}`
- Signal items: staggered `delay: 1.0 + i * 0.1`, slide from left
- Streaming text: character-by-character with blinking cursor
