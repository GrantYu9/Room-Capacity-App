---
version: alpha
name: SensoryAtlas
description: Shared visual system and interface guidance for the public website and study-space web app.
colors:
  primary: "#235848"
  on-primary: "#FFFFFF"
  canvas: "#F8F9F4"
  surface: "#FFFFFF"
  text: "#203C31"
  muted: "#5E6D56"
  fresh-surface: "#F2F8F4"
  fresh-text: "#4E7062"
  delayed-surface: "#F7F8F2"
  limited-surface: "#FFF6E9"
  limited-text: "#8D5D3F"
typography:
  display:
    fontFamily: "Fraunces Variable, Georgia, serif"
    fontSize: 4.125rem
    fontWeight: 450
    lineHeight: 1.08
    letterSpacing: -2.5px
  body:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: 1rem
    fontWeight: 400
    lineHeight: 1.5
  room-title:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: 1rem
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.3px
  label:
    fontFamily: "DM Sans Variable, sans-serif"
    fontSize: 0.875rem
    fontWeight: 550
    lineHeight: 1.4
rounded:
  badge: 5px
  control: 8px
  card: 13px
  full: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  card-inset: 20px
  lg: 24px
  xl: 32px
  touch-target: 44px
components:
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "{spacing.md}"
  room-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    typography: "{typography.room-title}"
    rounded: "{rounded.card}"
    padding: "{spacing.card-inset}"
  status-fresh:
    backgroundColor: "{colors.fresh-surface}"
    textColor: "{colors.fresh-text}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "{spacing.xs} {spacing.sm}"
  status-delayed:
    backgroundColor: "{colors.delayed-surface}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "{spacing.xs} {spacing.sm}"
  status-limited:
    backgroundColor: "{colors.limited-surface}"
    textColor: "{colors.limited-text}"
    typography: "{typography.label}"
    rounded: "{rounded.badge}"
    padding: "{spacing.xs} {spacing.sm}"
---

# SensoryAtlas Design System

## Overview

Use this shared file in the public website and web app repositories. The product should feel calm, legible, and practical when a student checks it between classes. The website can use more expressive typography. The room directory should prioritize quick comparison and reliable status labels.

Help a student leaving class answer a practical question within a few seconds. “Where can I find a quiet seat right now?” They should be able to scan a few spaces, see how recently each was measured, and open directions. Students looking for a place for group work can use the same directory to find a livelier space. The directory should remain useful when live coverage is limited.

The product combines UBC study-space metadata with recent sensor estimates. The directory tells students where spaces are and what is known about them. Sensors estimate occupancy and noise at a particular time. “About 12 seats free” communicates an estimate. “Measured 8 seconds ago” helps students judge it. A space with “No live readings” still has a useful location and official room link where available.

The palette and core typography draw from the app stylesheet. The shared 14px label size and 44px touch target are design targets for both surfaces. Use SensoryAtlas as the product name on both surfaces.

## Colors

Use the pale canvas for the page and white for room cards and dialogs. Use forest green for the primary action and dark green for copy and room titles. Use the muted foreground for supporting text. Use `#E1E6DC` for decorative borders. Controls that rely on a visible boundary need sufficient contrast. Use `#53865F` for a visible focus outline with space between the outline and the control.

Use the fresh, delayed, and limited pairs for their corresponding statuses. The fresh foreground is darker than in the existing app stylesheet to improve contrast on the pale green badge. The limited pair can mark a full room. Keep noise labels and occupancy estimates visually distinct and state their meaning in text. A quiet room may still be full.

## Typography

Use Fraunces for display headings and DM Sans for UI text. Reserve the display token for a spacious hero. Scale it down when space is limited. Use the room-title token for card headings and the label token for actions, filters, and status text. Keep the time of measurement legible at the same zoom as the metrics it qualifies. Use sentence case.

## Layout

Keep the website hero and primary action prominent. On phones, put the app heading, search, quick filters, and the start of the first room card near the top. Start with a single column, then add columns when cards have room for their content at normal zoom. Allow filters to wrap and avoid horizontal page scrolling. Use the spacing scale to keep card insets, content gaps, and control groups consistent.

## Elevation & Depth

Use borders and a quiet shadow to separate cards from the canvas. The app stylesheet uses a shallow resting shadow and stronger elevation on hover. Keep a dialog above a dimmed backdrop and leave focus clearly visible. Avoid relying on elevation alone to distinguish an interactive surface.

## Shapes

Use the control radius for buttons and inputs, the card radius for room panels, and the badge radius for compact status labels. Use the full radius for circular indicators. Preserve a consistent outline even when chips wrap or a card title takes two lines.

## Components

Use the primary button treatment for “Explore study spaces.” Use the same label and destination in the website header and hero. In the app, a room card makes the room name, quietness, occupancy, and measurement age easy to scan. Use a separately focusable save control and give icon-only controls accessible names.

Use status labels alongside colour. A small dot can accompany “Recent reading.” If it pulses, respect reduced-motion preferences. For room details, use the existing dialog or sheet, an accessible title, and a visible close control. Keep focus inside the modal, support Escape, and restore focus to the originating control when it closes.

## Do's and Don'ts

Keep student actions accessible by touch and keyboard. Give controls visible focus, aim for a 44px touch target, and verify the experience at increased zoom. Announce meaningful errors and loading changes without announcing every background refresh.

Avoid showing a stale measurement as current, presenting an unknown count as zero, or giving a fictional reading the same treatment as a live one. Keep estimated seats and measured people counts distinct. Use short labels, and pair colour with words.

## Website and web app responsibilities

### Public website

The website introduces the project and gets visitors into the directory. Lead with “Find a quiet spot at UBC,” a sentence about checking recent noise and occupancy readings, and an “Explore study spaces” action. Put that action in the header and hero, with the same destination on phone and desktop. Follow the hero with a short example of what students will see and a plain-language explanation of how the readings reach the app.

Use an illustrative room card or a product screenshot. Keep an “Example reading” label on a preview that shows fictional values. If the app supports a stable demo URL, the website may link to it with “Try the demo.” Public copy should describe coverage as limited to instrumented spaces and describe the displayed measurements as aggregate counts and sound levels. Claims about device-side processing or retention must match the implementation being demonstrated.

### Web app

The app owns the directory, search and filters, saved spaces, live and demo state, room details, measurement history, and directions. A visitor opening the app should land in the directory and be able to browse immediately. The app owns the public data contract and freshness rules. If the website later displays live coverage, it should use that contract and the same display rules.

The existing app design describes a landing experience and directory in one codebase. When both experiences share a deployment, “Explore study spaces” may navigate within the app. When they are deployed separately, the website should use a configured app URL so preview and production environments point to the right destination. This specification assigns responsibilities without choosing a repository name, domain, hosting provider, or route.

## Web app experience

### Directory and search

Put “Find a quiet spot at UBC,” search, the quick filters, and the first result near the top of the phone layout. Use the search placeholder “Search by building or room” and give the field a persistent accessible name. Match room names, building names, room numbers, and addresses using the existing search behavior. Provide a clear-search control. Keep building selection and sorting in a compact secondary row or panel. Search and filters narrow the same result set.

Use “Quiet,” “Seats available,” and “Saved” as quick filters. Quiet includes rooms with a fresh usable noise reading in the Quiet band. Seats available includes rooms with a fresh usable people count, known capacity, and an estimate above zero. Saved uses browser-local favourites and can include spaces with any reading state. When filters yield no results, keep the controls visible and give students a way to clear them.

In the default view, lead with spaces that have at least one fresh usable metric. Keep the remaining directory entries browsable in the same flow. If no room has a fresh reading, show the directory with a short explanation that live readings are currently unavailable. An explicit sort should order the filtered results predictably. For seat sorting, put unknown estimates after known estimates, including a known zero. Break ties by room name.

Show coverage near the results header as “X of Y listed spaces have recent readings.” Count each room once if it has at least one fresh usable metric. Compute coverage across the active directory before search or filters. Label coverage as simulated in demo mode.

### Room cards

Put the room name first and the building, floor, or room number beneath it where available. Give quietness and seat availability equal visual weight. A representative card would read “Quiet,” “About 12 seats free,” and “Measured 8 seconds ago.” Use text alongside each status colour. Make opening the room and saving it distinct controls so one action never triggers the other.

With a fresh people count and unknown capacity, show “About 8 people” in place of a seat estimate. If noise is the only usable metric, show the noise label and “Occupancy unavailable.” Apply the equivalent treatment when only occupancy is usable. “No live readings” describes a room with no measurements. “Last measured 4 min ago” describes a stale reading. Keep the measured age visible in stale states and remove claims about current quietness or seats. If the data source supplies different timestamps for the two metrics, display their ages separately. One timestamp is enough for a shared reading.

### Room details

Use the existing dialog or sheet pattern. On phones, use one scrolling column. On wider screens, center the dialog and constrain its width for readability. Repeat the room name, location, latest usable metrics, and measurement time at the top. Put a “Directions” action near the location when there is a usable address or coordinates. Keep a separate “UBC room page” action when the imported record includes its official link.

Label the history chart “Recent occupancy.” Use actual measurement times along the horizontal axis and people counts along the vertical axis. Use the window returned by the existing history endpoint. Keep the latest count and its measurement time available as text, and plot zero as a real reading. Show a short empty message if there is no history. Loading or failure in the chart should leave the rest of the room details usable. Add noise history once the app has a reliable series to display.

## Data and interface states

### Directory and measurements

Preserve stable identities across directory imports. Retain the UBC source record ID when available, together with the original room link. Use the app's stable room IDs for details, saved spaces, and sensor assignments. A listed capacity is room metadata. A people count is a timestamped estimate. With a fresh count and known capacity, estimate free seats as capacity minus people count, floored at zero. Preserve the measured people count if it exceeds capacity. A fresh zero represents a valid count. A missing value leaves occupancy unknown.

Use the freshness threshold supplied by the API. The app design documents a 60-second default. Judge freshness from measurement time. The app's periodic check, documented as roughly every 10 seconds after a request completes, reports connection health. Keep “Last checked” separate from “Measured.” If a refresh fails, retain the last successful result and let its readings continue to age. Once they cross the freshness threshold, apply stale display and filter rules. A successful connection can still return an empty directory or a directory with no fresh measurements.

Use the app's shared classification logic for “Quiet,” “Moderate,” and “Lively.” These bands describe the latest usable reading and are approximate. Display numeric dBA only when explicitly reported in that unit. Relative measurements depend on the device and settings. If the details expose a relative number, label it as a relative level and use the band label for the main card.

### Loading, empty, and error states

On the first load, reserve room for search and results. If the first request fails, show “Couldn't load study spaces” with a “Retry” action. If the server returns no room records, explain that there are no listed spaces yet. If metadata exists and readings do not, show the directory with the no-reading states. After a failed refresh, use a compact connection message above the retained results. If search or filters hide all rooms, keep the controls visible and offer “Clear filters.” Place chart loading, empty, and error states within the chart area.

### Live and demo modes

Open in live mode by default. Provide a clearly labelled “Demo mode” entry and an equally clear return to live mode. Keep a visible demo label on the directory and room details throughout the demo. Use separate demo data for sample rooms, readings, history, and coverage. If both modes expose saving, scope saved entries to their respective data sets. The website can show a fictional preview with the same visual language and its own explicit example label.

## Integration boundaries

The current app design uses React and Vite with a Node API, and stores room metadata and timestamped readings in TimescaleDB. Reuse the directory and history responses, shared reading helpers, and polling path. Keep database credentials and device tokens server-side or on the uploading device as appropriate. Public surfaces consume room metadata and aggregate readings. Raw audio, images, and video stay outside the public UI.

Sensor integration is a separate workstream. The app design documents authenticated submissions to `POST /api/readings`. The upload helper can exercise the contract with explicit test readings while hardware integration is developed. Inspect the app's implementation and README before changing any integration. Keep environment variables, commands, hostnames, and concrete payload examples in the README of the repository that owns them.

## HackCamp scope and acceptance

### Demo scope

The first release should have a clear website-to-app handoff, a responsive directory, scannable cards, and a room detail view that updates when a new reading arrives. Use clearly labelled demo data to show how broader coverage would look. For the hardware demonstration, open the instrumented room, make a sound near the microphone, and show the noise label change after the reading reaches the app. A manually submitted reading can verify ingestion and UI behavior. A physical sensor upload appearing in the app is its own milestone. Add a map once there are enough instrumented locations to compare.

### Acceptance checks

Before shipping, verify the website's primary link and any demo deep link. In the app, exercise phone and desktop layouts, keyboard search and filtering, saving, opening and dismissing details, and switching between live and demo. Verify a room with no readings, a fresh zero count, an unknown capacity, an over-capacity count, a reading that becomes stale, a failed refresh followed by recovery, and a new noise reading that updates the card and open detail view. Confirm that stale and unknown readings stay out of the corresponding current filters. Run the app's existing build, unit, and browser checks as part of implementation.

## Document maintenance

When a design change affects public wording, data labels, shared styling, or the handoff between surfaces, copy the same revision of this specification to both repositories. Keep deployment-specific decisions with the repository that owns them.
