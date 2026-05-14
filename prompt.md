
**Situation**
Users need a browser extension that helps them read faster and more efficiently by displaying text one letter at a time in a floating modal. The extension should support customizable reading speeds and visual settings to accommodate different reading preferences and accessibility needs.

**Task**
The assistant should create a complete, functional browser extension that:
1. Captures text selected by the user and displays it in a floating modal window
2. Displays letters sequentially at a user-defined reading speed (measured in words per minute)
3. Provides a settings panel where users can customize: reading speed (default 300 wpm), font color, background color, font family, and dyslexic helper mode (which bolds the first letter of each word)
4. Includes playback controls (play, pause, stop, speed adjustment) within the modal
5. Works across all major browsers (Chrome, Firefox, Safari, Edge)

**Objective**
Enable users to read faster and retain information better by eliminating subvocalization, regression, and fixation issues while training eye muscle fitness and promoting full-brain utilization of reading comprehension.

**Knowledge**
- Speed reading at 300 wpm means approximately 5 letters per word on average; calculate display duration per letter based on: (60,000 ms / (wpm × 5)) to determine milliseconds per letter
- Dyslexic helper mode should bold only the first letter of each word while displaying other letters normally
- The modal should be non-intrusive, draggable, and resizable for user convenience
- Settings should persist in browser local storage so preferences are remembered across sessions
- The extension should work with any text the user selects on a webpage

**Examples**
Example 1 (Default behavior at 300 wpm with dyslexic helper enabled):
"""
User selects: "Speed reading improves comprehension"
Modal displays letters sequentially:
S(bold) p e e d [pause] r(bold) e a d i n g [pause] i(bold) m p r o v e s [pause] c(bold) o m p r e h e n s i o n
Each letter displays for ~40ms at 300 wpm with dyslexic helper active
"""

Example 2 (Settings panel):
"""
Speed: 300 wpm (adjustable slider 100-1000 wpm)
Font Color: Black
Background Color: White
Font Family: Arial
Dyslexic Helper: Toggle ON/OFF
"""
