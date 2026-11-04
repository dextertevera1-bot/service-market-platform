# Service Market Design System Standard

Service Market must feel like a premium, trustworthy technology product from the first screen. The design standard is not decoration; it is part of customer safety and confidence.

## Product Promise

Every interface should reinforce this message:

> I trust this platform enough to let someone into my home.

The product should feel professional, calm, fast, practical, and credible for Zimbabwe-first service work.

## Design Principles

- Trust before choice: show verification, proof, reputation, and clear next steps.
- Progressive disclosure: listing cards stay simple; profile and admin screens carry deeper detail.
- One primary action per surface: reduce competing calls to action.
- Mobile-first, desktop-polished: no cramped mobile layouts and no wasted desktop space.
- Low-bandwidth aware: avoid heavy visual dependence and keep important actions text-readable.
- Accessible by default: keyboard focus, readable sizes, strong contrast, clear form labels, large touch targets.

## Visual Foundations

- Use the existing CSS token layer in `public/styles.css`.
- Use the 8px spacing system: 8, 16, 24, 32, 40, 48.
- Prefer soft cards, restrained shadows, and clear whitespace over heavy borders.
- Use trust green as the primary color.
- Use blue only for operational/communication accents.
- Use danger red only for destructive or dispute states.
- Use status badges consistently.
- Avoid adding unrelated colors, decorative clutter, or dense marketplace-style blocks.

## Component Rules

Buttons:

- `primary-button` is reserved for the main action.
- `secondary-button` supports the main action.
- `ghost-button` is for low-emphasis controls.
- `danger` is only for destructive or negative states.
- Every clickable control must have hover, focus, active, and disabled states.

Cards:

- Use cards for meaningful grouped content, not every sentence.
- Cards need comfortable padding, clear hierarchy, and subtle hover only when interactive.
- Do not nest cards unless the inner card is a repeated item such as a review, document, or job.

Forms:

- Long workflows must be grouped into steps.
- Inputs need visible labels.
- Required fields should be obvious through copy and validation.
- Mobile touch targets should be at least 44px high.

Trust Score:

- Treat Trust Score as a signature component.
- Always pair the number with a trust level or explanation.
- Use badges to show evidence.
- Detailed scoring belongs on profiles and Trust Engine surfaces, not compact listings.

Admin:

- Admin screens should feel like an operations command center.
- Use section navigation, filters, metrics, and clear status indicators.
- Avoid overloading one surface with ungrouped operational detail.

## Sprint Closeout Rule

Every major sprint must include a design and engineering review before the next sprint begins.

Minimum design review checklist:

- Visual hierarchy is clear.
- Primary action is obvious.
- Spacing follows the 8px system.
- Buttons and cards use standard classes.
- Forms are grouped and readable on mobile.
- Trust evidence is clear and not overwhelming.
- Customer, technician, and admin screens feel like one product.
- Browser console has no errors.
- Responsive layout has no horizontal scrolling.
- Accessibility basics are preserved.

Quality is a feature. No new UI should ship unless it conforms to this standard.
