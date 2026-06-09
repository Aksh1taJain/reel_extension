# Instagram Reel Enhancer (Chrome Extension)

A Chrome Extension that improves the desktop Instagram Reels experience by adding playback controls, a seek bar, and a larger viewing layout.

## Features

### Playback Speed Controls
Choose custom playback speeds:

- 1x
- 1.5x
- 2x
- 2.5x
- 3x
- 5x

Features:
- Instant speed switching
- Selected speed is saved automatically
- Applies to newly loaded reels

---

### Seek / Scrub Bar

Adds a custom progress bar to Instagram reels:

- Click anywhere on the bar to jump to that position
- Drag to seek through video
- Live progress updates
- Displays current time and total duration

---

### Full Desktop Mode

Optimizes Instagram Reels for larger screens:

- Expands reel display area
- Uses more of the laptop screen
- Reduces unnecessary spacing
- Maintains video aspect ratio
- Responsive layout
- Keeps Instagram navigation, close, and audio controls usable

Full Desktop Mode runs automatically on desktop-width Reels pages and does not require a separate toggle.

---

### Picture-in-Picture

Adds a PiP button for supported reels so videos can be watched in a floating player.

---

### Dynamic Reel Detection

Instagram loads content dynamically, so the extension automatically handles:

- Infinite scrolling
- Newly loaded reels
- Route changes without page refresh
- Single-page app navigation

---

## Tech Stack

- Chrome Extension Manifest V3
- Vanilla JavaScript
- CSS
- MutationObserver API
- Chrome Storage API

---

## Project Structure

```text
Instagram-Reel-Enhancer/
│
├── manifest.json
├── content.js
└── content.css
```

### File Description

**manifest.json**
- Extension configuration
- Injects scripts and styles into Instagram pages
- Requests required permissions

**content.js**
- Finds Instagram video elements
- Injects playback controls
- Handles speed changes
- Creates seek functionality
- Applies Full Desktop Mode on Reels pages
- Preserves native Instagram reel controls
- Observes DOM and navigation changes

**content.css**
- Styles for controls and overlays
- Speed buttons
- Progress bar
- Full Desktop Mode layout adjustments
- Native control visibility fixes

---

## Installation

1. Download or clone this repository:

```bash
git clone <repository-url>
```

2. Open Chrome and navigate to:

```text
chrome://extensions
```

3. Enable **Developer Mode**

4. Click **Load unpacked**

5. Select the extension folder

6. Open Instagram and start watching reels

---

## Usage

Open Instagram Reels on desktop.

The extension automatically adds:

- Playback speed controls
- Seek bar
- Larger viewing mode
- Picture-in-picture button

No additional setup required.

---

## Notes

- Works on desktop Instagram web
- Built for Chrome (Manifest V3)
- Designed for dynamically loaded reels
- Full Desktop Mode is enabled automatically on desktop-width Reels pages
- Uses lightweight DOM updates to avoid performance issues

---

## Future Improvements

- Keyboard shortcuts
- Custom speed presets
- Volume boost
- Theme customization
- Auto-skip silent sections

---
## Why This Extension Improves Efficiency

Instagram web reels on desktop have several limitations:

- No fast playback options beyond normal speed
- No simple way to jump directly to a specific part of a reel
- Mobile-sized viewing area on large screens
- Extra scrolling and waiting time

This extension reduces those limitations and improves viewing efficiency.

### Time Saving Through Playback Speed

Watching content at higher speeds reduces the time spent on each reel.

Example:

| Reel Length | Playback Speed | Actual Time Needed |
|-------------|---------------|-------------------|
| 30 sec | 1x | 30 sec |
| 30 sec | 2x | 15 sec |
| 30 sec | 3x | 10 sec |
| 30 sec | 5x | 6 sec |

If a user watches 100 reels of 30 seconds:

- At 1x → 50 minutes
- At 2x → 25 minutes
- At 5x → 10 minutes

This allows users to consume content significantly faster.

---

### Faster Information Extraction

Many reels contain:

- Tutorials
- Coding tips
- Educational content
- News summaries
- Product reviews

Users often need only specific parts.

The seek bar allows:

- Jumping directly to important sections
- Skipping introductions
- Rewatching useful moments
- Avoiding unnecessary playback

Instead of watching an entire reel, users can move directly to the relevant timestamp.

---

### Better Desktop Space Utilization

Instagram web often displays reels inside a narrow mobile-style frame.

The extension:

- Expands content for larger screens
- Reduces unused side spacing
- Improves visibility
- Creates a more immersive viewing experience

This reduces visual constraints and makes content easier to consume.

---

Overall goal:

**Less waiting + faster navigation + better use of screen space = more efficient reel consumption on desktop.**
