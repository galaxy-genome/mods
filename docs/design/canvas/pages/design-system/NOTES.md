# Quest Editor design system: component spec

Artboards: DsTokens, DsControls, DsPatterns, DsPickers. All values literal; inline styles; no shadows; no gradients except the empty-state grid.

## Tokens
- void #04060e app bg · deep #080f1e bars, sheets, tab bar · panel rgba(8,18,34,.92) cards · field rgba(4,12,22,.9) inputs · chip rgba(10,24,40,.6)
- edge #16455a borders · grid #177180 · grid-strong #1e93a6 selected-card border, sheet top edge
- cyan #35e0f5 accent/focus/links · amber #ffab3d warning · danger #ff5a5a error · success #4fe08a saved
- ink #bcdbe6 body · dim #5f7f8e captions, disabled · white #ffffff headings
- Helper text under fields: rgba(188,219,230,.8), 12px, line-height 1.4.
- Selected tint backgrounds: cyan at .06 (cards), .08 (chips), .12 (segment, icon pressed), .14 (secondary pressed); danger at .16.

## Type
- UI: Oxanium, 'Segoe UI', system-ui, sans-serif. Mono: 'JetBrains Mono', ui-monospace, Menlo, monospace.
- Display 22 700 uppercase .12em white (page titles 26) · Title 17 600 white · Body 15 400 ink · Label 13 600 white
- Caption 12 dim · Section header 11 600 uppercase .18em dim · Input mono 16 (15 in dense search) · Values/chips mono 12-13.

## Shape and spacing
- Radius 2 chips, inputs, buttons, badges · 4 cards, sheets, toasts · full on switch track, dots, avatars.
- Focus: 1px cyan border + outline 2px #35e0f5, offset 2px (also on destructive buttons).
- Spacing base 4: 4 8 12 16 20 24 32. Screen gutter 12-16. Section gap 14; header-to-content 8.
- Touch targets 44px min; 8px between adjacent targets.

## Icons
Line, viewBox 24, stroke 1.5 (1.8 inside 12-14px badges, 1.2 for 40px+ illustrations), drawn at 16/20/24.
Set: back chevron chevron-up chevron-down close more(filled dots) plus minus check search globe external upload download new overview steps flow rumors test dialogue ship orders station mission travel planet combat time cargo next checkpoint warning error tip info help hostile portrait pin map radius drag edit copy trash undo settings offline bundler. Paths live in DsTokens.
Colours: cyan on active/content-type icons, ink on neutral, dim on chevrons and disabled.

## Buttons (44 tall, padding 0 18, gap 8, Oxanium 15 600, icon 18)
- Primary: bg cyan, text void. Pressed bg grid-strong. Disabled bg edge, text dim.
- Secondary: transparent, 1px cyan, text cyan. Pressed bg cyan .14. Disabled border edge, text dim.
- Destructive: 1px danger, text danger. Pressed bg danger .16.
- Text: no border, padding 0 8, cyan. Pressed bg cyan .10.
- Icon: 44x44, glyph 22 ink. Pressed bg cyan .12.

## Text field
- Label 13 600 white, gap 6, box 44 tall, padding 0 12, bg field, 1px edge, radius 2, mono 16 ink; placeholder dim.
- Focused border cyan, 1px cyan caret. Error border danger + 12px message with 14px error icon. Warning same in amber.
- Validation appears on blur or after 800ms idle.
- Multiline: min-height 112, padding 10 12, mono 15/1.45. Footer row: helper left, counter right mono 12.
  Counter dim below 280, amber at 280+ (border amber), red above 320 (border danger).

## Switch, checkbox
- Switch track 44x26 radius 13, padding 3, knob 20. Off: track edge, knob dim. On: track cyan, knob void. Disabled opacity .45.
- Switch row: min-height 44, gap 10, icon 16, label 14 white.
- Checkbox 20x20 radius 2. Off 1px dim on field. On fill cyan + void check 16 stroke 2. Label 14, row 44.

## Segmented, stepper, slider
- Segmented: 1px edge, radius 2, bg field; cells 42 tall, 1px edge dividers, Oxanium 13 600 ink; selected bg cyan .12, text cyan. Radio group.
- Stepper: 44 +/- cells with edge dividers, value min-width 88 mono 16 white, unit mono 12 dim. Disabled end uses dim glyph. Presets as 32px chips below, gap 8.
- Slider: 44px hit row, track 4px edge radius 2, fill cyan, thumb 22 void with 2px cyan ring. Header: label 13 600 + value mono 13 cyan. Optional 80px numeric field. Dual thumb fills between thumbs.

## Chips and badges
- Chip 36 tall (28-32 inline), padding 0 12, radius 2, mono 13. Filter: edge border, chip bg, ink. Selected: cyan border, cyan .08 bg, cyan text, optional check 14. Removable: close 14 dim in 24px hit. Disabled: edge border, no bg, dim.
- Badge 22 tall, padding 0 6, 1px colour border, mono 11 uppercase .06em, icon 12. Checkpoint cyan, Hostile / Always hostile in mods danger, Mod amber, language ink (other languages dim).
- Problems count badge: 28 tall, padding 0 8, mono 12, warning icon amber or error icon danger, gap 5.

## App bars and tabs
- In-quest: deep bg, bottom 1px edge, padding 6 4, gap 4. Back 44 (icon 22) · overline mono 11 dim + title 17 600 white · save dot 8 · problems badge · menu 44.
- Home: padding 16 16 12, brand 13 700 .16em uppercase, GALAXY GENOME white over QUEST EDITOR cyan. Right: 44-tall outlined chips (Bundler + external 14, globe 16 + EN), mono 12.
- Tab bar: deep bg, top 1px edge, padding 4 0 8, 5 equal cells 52 tall, icon 20 + label 11, gap 3; active cyan, rest dim.

## Rows and cards
- List row (in a panel card): min-height 48, padding 0 12, gap 12, icon 20, label 15 white, value mono 12 ink, chevron 16 dim, 1px edge divider. Empty row: label ink, value and icon dim.
- Card: panel bg, 1px edge, radius 4. Nav card: padding 16, min-height 72, icon 24, title 16 600, sub mono 12 dim, chevron 20.
- Selected/condition card: min-height 52, bg cyan .06, border grid-strong, action text 13 cyan ("Change").
- Collapsible section header: 44 tall, bottom edge; section header text, collapsed summary right mono 12 ink, chevron 18 dim (up open, down collapsed).

## Sheets, toasts, tips
- Bottom sheet: dimmed strip rgba(4,6,14,.7) (64px on phone), sheet deep bg, top 1px grid-strong, radius 4 4 0 0. Handle 36x4 edge, padding 8 0 2. Title row padding 4 4 4 16, 17 600, close 44. Search field padding 0 16 12, border edge (cyan when focused).
- Toast: width screen-24, min-height 48, deep bg, 1px grid-strong, radius 4, text 14 white, Undo 14 600 cyan in 44 hit. 4s, 10s with Undo, above tab bar.
- Tip card: bg cyan .06, 1px edge, left border 2px cyan, padding 12 4 12 12, tip icon 20 cyan, text 14/1.45 ink, "Learn more" 13 cyan, close 18 dim in 44.

## Problems, status
- Problem row: min-height 60, padding 8 12, gap 12, severity icon 20 (error circle danger, warning triangle amber, tip bulb cyan), title 14 white, location mono 12 dim, "Fix" 13 in severity colour, chevron 16.
- Save status: dot 8. Saved success, Saving… amber (pulses), Not saved: storage full danger text + chevron (tappable). Offline chip 28 tall, offline icon 14, mono 12 dim.

## Empty state
360 wide block, grid texture (two linear-gradients rgba(23,113,128,.07) 1px, 40px), icon 40 grid colour stroke 1.2, title 17 600 white, body 14/1.45 ink centred, secondary button. Gap 12, padding 24.

## Picker items and content cards
- Portrait tile: 96 square, deep bg, 1px edge, radius 2, name mono 12 below (gap 6). 3 columns. Selected: cyan border + 2px cyan outline offset 2, name cyan.
- Ship picker card: 2 columns, padding 12, gap 8, art area 64 tall, name 15 600, class · size · faction mono 12 dim. Selected cyan border + cyan .06 bg, name cyan. Always-hostile badge where applicable.
- System result: min-height 60, faction dot 10, name 15 white (+ Mod badge), security · distance from Sol mono 12 dim, "Map" 12 cyan + external 14 in 44 hit.
- Behaviour row: grouped under section header (Friendly, Neutral, Hostile, Special). Min-height 56, name 15, description 12 dim; selected bg cyan .06, name cyan, check 18.
- Condition card reads as a sentence; parameter in mono cyan. Fail condition: close icon 18 danger, text 14. Hand-typed unknown event: amber border, raw text mono 13, amber note 12.
- Choice row: min-height 64, number circle 24 with grid-strong border mono 12 cyan, text 15 white, "Goes to › target" mono 12 dim with target cyan, drag handle 44. "Add choice" 48 row 14 cyan; at 3 choices dim with helper "The game shows at most 3 choices. Chain another line for more."
- Ship card: padding 12, gap 12, art 56 (red tint when hostile), pilot 16 600, Hostile badge, model · level mono 12 ink, behaviour chip 28 + position "Near player, 200" mono 12 dim with pin 14.
- Order card: min-height 52, icon 20, sentence 15 white with pilot mono cyan ("Hunter attacks the player.").
- Mission summary: padding 12, type icon 22 in 44 outlined box, "Pirate hunt at Thunder Station" 15 (type italic), target system and reward mono 12 (reward cyan), Story badge.
