# Navigation & Link Integrity SOP

Every link, button, CTA, tab, footer item, menu item and route must point to the correct intended destination.

This standard applies after every UI, routing, page, dashboard, footer, header, CTA, or workflow change.

## Required Checks

- No broken links.
- No dead routes.
- No incorrect redirects.
- No placeholder links unless clearly marked.
- Header, footer and page navigation are consistent.
- Active page states are correct.
- Browser back and forward work.
- Refresh works on every route.
- Mobile navigation works.
- Desktop navigation works.
- No console errors.

## Current Primary Routes

- `#home`
- `#customer`
- `#technician`
- `#admin`
- `#about`
- `#how-it-works`
- `#help`
- `#contact`
- `#terms`
- `#privacy`
- `#profile-<technicianId>`

## Footer Destinations

- About: `#about`
- How it Works: `#how-it-works`
- Become a Technician: `#technician`
- Help: `#help`
- Contact: `#contact`
- Terms: `#terms`
- Privacy: `#privacy`

## Automated Check

Run the local app first:

```bash
npm start
```

Then run:

```bash
npm run check:navigation
```

The check validates:

- Route registry coverage.
- Matching view sections.
- Footer link wiring.
- Duplicate HTML IDs.
- Hash link integrity.
- Allowed external link schemes.
- Core navigation code signals.
- Local HTTP route smoke for all primary routes.

## Manual QA Checklist

Before a navigation-related sprint is complete:

- Click every header item.
- Click every footer item.
- Click all homepage CTAs.
- Open at least one technician profile from listing and featured cards.
- Use browser Back and Forward between at least three routes.
- Refresh on `#about`, `#how-it-works`, `#technician`, `#admin`, and `#profile-1`.
- Test at mobile width and desktop width.
- Confirm active states match the current page.
- Confirm console has no errors.

If any bug prevents correct navigation, fix it before marking the sprint complete.
