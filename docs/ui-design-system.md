# CarePulse Visual Design System

CarePulse follows a calm, editorial, clinical "care coordination desk" visual design system. It avoids generic SaaS dashboard tropes (excessive glassmorphism, glowing neon gradients, oversized hero cards, decorative AI imagery) in favor of clear typography, structured data tables, and high-readability interfaces suitable for healthcare operations.

---

## 1. Color Palette Tokens

| Token Name | Hex Code | Purpose & Usage |
| :--- | :--- | :--- |
| **`bg-canvas`** | `#f8fafc` | Warm paper-like background canvas. |
| **`bg-surface`** | `#ffffff` | Clean white card and panel background. |
| **`bg-subtle`** | `#f1f5f9` | Light slate background for table headers and inactive tabs. |
| **`text-ink`** | `#0f172a` | Deep ink text for headings and primary content. |
| **`text-muted`** | `#64748b` | Muted slate text for secondary labels and timestamps. |
| **`border-subtle`**| `#e2e8f0` | Thin 1px rule border for structured cards and tables. |
| **`accent-navy`** | `#1e293b` | Primary button background and high-priority focus states. |
| **`accent-sky`** | `#0284c7` | Secondary clinical action color. |
| **`status-confirmed`**| `#059669` / `#ecfdf5` | Crisp emerald badge for confirmed appointments. |
| **`status-held`** | `#d97706` / `#fffbeb` | Warm amber badge for temporary slot holds & medium urgency. |
| **`status-cancelled`**| `#dc2626` / `#fef2f2` | Rose alert badge for cancellations, DLQ errors & high urgency. |

---

## 2. Typography Scale

- **Display Heading**: 1.5rem (24px), SemiBold (600), tracking tight (`text-2xl font-semibold text-slate-900`)
- **Section Heading**: 1.125rem (18px), Medium (500) (`text-lg font-medium text-slate-800`)
- **Body Text**: 0.875rem (14px), Regular (400) (`text-sm text-slate-700`)
- **Caption / Label**: 0.75rem (12px), Medium (500), uppercase tracking wide (`text-xs font-medium uppercase tracking-wider text-slate-500`)
- **Data Table Header**: 0.75rem (12px), SemiBold (600), slate muted (`text-xs font-semibold text-slate-600 bg-slate-100`)

---

## 3. Component Design Rules

1. **Panels & Cards**: White background (`#ffffff`), 1px subtle border (`#e2e8f0`), 8px border radius (`rounded-lg`), subtle shadow (`shadow-sm`).
2. **Buttons**:
   - **Primary**: Solid deep navy (`bg-slate-900 text-white hover:bg-slate-800`), 6px radius (`rounded-md`), padding `px-4 py-2 text-sm`.
   - **Secondary / Outline**: White background with 1px border (`bg-white border border-slate-300 text-slate-700 hover:bg-slate-50`).
3. **Data Tables**: Compact padding (`py-2.5 px-4`), thin row dividers (`border-b border-slate-200`), clear headers.
4. **Badges**: Subdued background tint with dark text (`bg-emerald-50 text-emerald-700 border border-emerald-200`).
5. **AI Indicators**: Plain text label `"Visit preparation"` or `"Clinical summary"` without decorative AI sparkles or marketing hype.
