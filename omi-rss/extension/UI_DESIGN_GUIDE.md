# Omi RSS Extension - UI Design Guide

## 🎨 Design Philosophy

The redesigned Omi RSS extension follows these core principles:

1. **Extension-First Design**: Optimized for 380px width constraint
2. **Information Density**: Maximum content in minimal space
3. **Glassmorphism Aesthetics**: Subtle transparency with performance
4. **Quick Actions**: One-click access to primary features
5. **Responsive Scaling**: Adapts from popup to sidebar to full window

## 📐 Layout Structure

### Popup Design (380x600px)
```
┌─────────────────────────────────┐
│ Header (48px)                   │
│ ┌─────┐ Omi RSS      [🔄] [⚙️] │
├─────────────────────────────────┤
│ Action Bar (80px)               │
│ [Pop Out] [Web App] [Sidebar]   │
├─────────────────────────────────┤
│ Tab Nav (44px)                  │
│ [Feeds] [Articles] [Saved]      │
├─────────────────────────────────┤
│ Content Area (scrollable)       │
│ • Search bar                    │
│ • Quick actions grid            │
│ • Feed/Article list             │
│                                 │
└─────────────────────────────────┘
```

### Sidepanel Design (Responsive)
```
┌──────┬─────────────┬────────────┐
│ Nav  │ Article     │ Reader     │
│      │ List        │ Panel      │
│ 200px│ 320px       │ Flexible   │
│      │             │            │
└──────┴─────────────┴────────────┘
```

## 🎯 Key Improvements

### 1. **Compact Header**
- Reduced from 60px to 48px
- Logo scaled to 24x24px
- Icon buttons reduced to 32x32px
- Tighter spacing (12px padding)

### 2. **Three-Button Action Bar**
- Grid layout for equal spacing
- Primary button with gradient
- Icons + text for clarity
- 80px total height

### 3. **Space-Efficient Tabs**
- Single row, 44px height
- Icons + short labels
- Active state with primary color
- No wasted vertical space

### 4. **Optimized Content Area**
- 4px custom scrollbar
- 8px spacing between items
- Compact feed items (48px height)
- 2-line article titles

### 5. **Typography Scale**
```css
--text-xs: 11px;  /* Meta info */
--text-sm: 12px;  /* Secondary text */
--text-base: 13px; /* Body text */
--text-md: 14px;  /* Headings */
--text-lg: 16px;  /* Page titles */
```

## 🖼️ Visual Hierarchy

1. **Primary Actions**: Gradient background, elevated
2. **Active States**: Primary color, subtle glow
3. **Hover Effects**: +4% brightness, 2px elevation
4. **Glass Effects**: 8-12px blur for performance
5. **Borders**: 15% white opacity for definition

## 🎨 Color System

### Dark Theme
- Background: `#0A0A0A` to `#141414`
- Glass: `rgba(255, 255, 255, 0.08)`
- Border: `rgba(255, 255, 255, 0.15)`
- Primary: `#FF6B6B` (Coral Red)
- Secondary: `#FFE66D` (Sunshine Yellow)

### Text Hierarchy
- Primary: `rgba(255, 255, 255, 0.95)`
- Secondary: `rgba(255, 255, 255, 0.70)`
- Muted: `rgba(255, 255, 255, 0.50)`

## 🚀 Performance Optimizations

1. **Reduced Blur Values**
   - Header: 12px (was 20px)
   - Cards: 8px (was 20px)
   - Backgrounds: Static gradients

2. **Simplified Animations**
   - Transform only (no filter animations)
   - 0.2s duration for snappy feel
   - GPU-accelerated properties only

3. **Efficient Selectors**
   - Single-class targeting
   - No deep nesting
   - Minimal pseudo-elements

## 📱 Responsive Behavior

### Popup → Window (380px → 800px+)
- Maintains single column
- Increases padding/spacing
- Larger fonts at 600px+

### Sidepanel Breakpoints
- **800px+**: Full three-column
- **600-800px**: Collapse navigation to icons
- **<600px**: Hide reader, show list only

## ⚡ Quick Actions

1. **Pop Out**: Opens in 800x600 window
2. **Web App**: Links to localhost:3000
3. **Sidebar**: Chrome sidePanel API

## 🔧 Implementation Notes

### Cross-Browser Support
```css
/* Chrome/Edge */
backdrop-filter: blur(12px);
-webkit-backdrop-filter: blur(12px);

/* Firefox fallback */
@supports not (backdrop-filter: blur(12px)) {
  background: rgba(20, 20, 20, 0.95);
}
```

### High DPI Displays
```css
@media (-webkit-min-device-pixel-ratio: 2) {
  /* Sharper text rendering */
  -webkit-font-smoothing: subpixel-antialiased;
}
```

### Accessibility
- Minimum touch target: 32x32px
- Color contrast: WCAG AA compliant
- Focus indicators: 3px primary outline
- Reduced motion: Instant transitions

## 📏 Spacing System

```css
--space-xs: 4px;   /* Compact gaps */
--space-sm: 8px;   /* Item spacing */
--space-md: 12px;  /* Section gaps */
--space-lg: 16px;  /* Major sections */
--space-xl: 20px;  /* Page margins */
```

## 🎯 Usage Guidelines

1. **Never exceed 380px width** in popup mode
2. **Prioritize vertical space** - users scroll vertically
3. **Group related actions** - reduce cognitive load
4. **Use icons + text** for clarity in limited space
5. **Progressive disclosure** - hide advanced options

This redesign ensures the Omi RSS extension provides a premium experience within browser constraints while maintaining the beautiful glassmorphism aesthetic.