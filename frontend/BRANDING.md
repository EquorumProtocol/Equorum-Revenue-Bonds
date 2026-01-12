# Equorum Brand Guidelines - Frontend

## 🎨 Official Brand Colors

### Primary Colors
```css
--equorum-orange: #FF6B35    /* Primary brand color - buttons, accents */
--equorum-dark: #0A1628      /* Text, headings, dark elements */
--equorum-accent: #FF8C61    /* Hover states, highlights */
```

### Usage in Tailwind
```jsx
// Primary button
className="bg-equorum-orange hover:bg-equorum-accent"

// Headings
className="text-equorum-dark"

// Links
className="text-equorum-orange hover:text-equorum-accent"
```

## 🐴 Logo

**Location**: `/public/equorum-logo.png`

**Sizes Available**:
- 40x40px (favicon, small icons)
- 256x256px (header, cards)
- 525x525px (hero sections)

**Usage**:
```jsx
<img src="/equorum-logo.png" alt="Equorum Logo" className="w-10 h-10" />
```

**Colors in Logo**:
- Background: `#FF6B35` (Equorum Orange)
- Horse Icon: `#0A1628` (Equorum Dark)

## 📐 Typography

**Font Family**: 
```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

**Headings**:
- Use `text-equorum-dark` for all headings
- Font weights: `font-bold` or `font-semibold`

**Body Text**:
- Primary: `text-equorum-dark`
- Muted/Secondary: `text-muted` (#6b7280)

## 🎯 Component Styling

### Buttons

**Primary (CTA)**:
```jsx
className="px-6 py-2 bg-equorum-orange text-white rounded-lg hover:bg-equorum-accent transition-colors font-medium shadow-sm"
```

**Secondary**:
```jsx
className="px-4 py-2 bg-gray-100 text-equorum-dark rounded-lg hover:bg-gray-200 transition-colors font-medium"
```

### Cards
```jsx
className="bg-white border border-gray-200 p-6 rounded-xl shadow-sm hover:shadow-md transition-all"
```

### Status Badges

**Active**:
```jsx
className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-medium"
```

**Matured**:
```jsx
className="bg-gray-100 text-gray-600 px-3 py-1 rounded-full text-xs font-medium"
```

## 🌈 Color Palette Extended

### Semantic Colors
```css
/* Success */
--success: #10B981 (green-500)

/* Warning */
--warning: #F59E0B (amber-500)

/* Error */
--error: #EF4444 (red-500)

/* Info */
--info: #3B82F6 (blue-500)

/* Muted/Gray */
--muted: #6B7280 (gray-500)
```

## 📱 Responsive Design

**Breakpoints** (Tailwind defaults):
- `sm`: 640px
- `md`: 768px
- `lg`: 1024px
- `xl`: 1280px
- `2xl`: 1536px

**Container Max Width**: `max-w-4xl` or `max-w-6xl`

## ✨ Visual Style

### Design Principles
1. **Minimalista**: Clean, uncluttered interfaces
2. **Profissional**: Serious "money app" aesthetic
3. **Confiável**: Clear hierarchy, readable text
4. **Moderno**: Rounded corners (`rounded-lg`, `rounded-xl`)

### Spacing
- Cards: `p-6` or `p-8`
- Sections: `mb-6` or `mb-8`
- Container: `max-w-4xl mx-auto p-6`

### Shadows
- Cards: `shadow-sm` (default), `shadow-md` (hover)
- Buttons: `shadow-sm`

### Transitions
Always use smooth transitions:
```jsx
className="transition-colors"  // For color changes
className="transition-all"     // For multiple properties
className="transition-shadow"  // For shadow changes
```

## 🚫 Don'ts

❌ Don't use bright blue (`#4a9eff`) - that was temporary  
❌ Don't use emojis in production UI  
❌ Don't use Comic Sans or playful fonts  
❌ Don't use gradients except for special hero sections  
❌ Don't mix different orange shades - stick to brand colors  

## ✅ Do's

✅ Use Equorum Orange (`#FF6B35`) for all CTAs  
✅ Use Equorum Dark (`#0A1628`) for headings  
✅ Keep backgrounds white or light gray (`bg-gray-50`)  
✅ Use consistent rounded corners (`rounded-lg`, `rounded-xl`)  
✅ Add hover states to all interactive elements  
✅ Use proper semantic HTML  

## 🔗 Brand Assets

**Official Logo**: `C:\Users\grupo\Downloads\Equorum Logo\`
**Website**: https://equorumprotocol.org/
**Twitter**: @Equorumprotocol
**Discord**: discord.gg/nYMuD8By

## 📝 Example Components

### Header
```jsx
<header className="bg-white border-b border-gray-200">
  <div className="max-w-6xl mx-auto px-6 py-4">
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-3">
        <img src="/equorum-logo.png" alt="Equorum" className="w-10 h-10" />
        <h1 className="text-xl font-bold text-equorum-dark">Equorum</h1>
      </div>
      <ConnectButton />
    </div>
  </div>
</header>
```

### Hero Section
```jsx
<div className="bg-white border border-gray-200 p-8 rounded-xl shadow-sm">
  <p className="text-sm text-muted mb-2">Total Claimable</p>
  <p className="text-5xl font-bold text-equorum-dark">2.4 ETH</p>
</div>
```

### CTA Button
```jsx
<button className="px-6 py-2 bg-equorum-orange text-white rounded-lg hover:bg-equorum-accent transition-colors font-medium shadow-sm">
  Claim Revenue
</button>
```

---

**Last Updated**: January 2026  
**Version**: 1.0  
**Maintained by**: Equorum Protocol Team
