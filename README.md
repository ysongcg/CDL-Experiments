# ManyNumbers – AMS task (web version)

A browser version of the AMS task from `manynumbers_ams_visualmemory_v2025.0301B` (PsychoPy 2022.2.5).
It runs on GitHub Pages and works with a keyboard, a mouse or a touch screen (iPad).

## Files

| File | What it is |
|---|---|
| `index.html` | The page: setup form, layout and styles |
| `ams_task.js` | The task logic, with timing and settings at the top |
| `ams_stimuli.js` | Trial lists and English text taken from the PsychoPy spreadsheets |
| `build_stimuli.py` | Rebuilds `ams_stimuli.js` from the `.xlsx` files. Only needed if you change a sheet |

## Images

Put the PNGs in the **same folder as `index.html`**, as in the PsychoPy folder. To keep them in a
subfolder, change the first setting in `ams_task.js`:

```js
const IMAGE_DIR = "images/";
```

The site needs `amstask_rectangles2.png`, `practice_image3.png`, `block1_image.png`, `block2_image.png`,
`block3_image.png`, `end_image.png`, `sample7_rect.png`, `sample8_rect.png`, `Practice1–6_rect.png`
and the `Age3/4/5_test*_rect.png` files. At start it loads every image for the chosen age group and
lists any that are missing.

## Test locally (VS Code)

Opening `index.html` by double-clicking works in most browsers. For a test closer to GitHub Pages,
use the **Live Server** extension (right-click `index.html` → *Open with Live Server*), or run
`python -m http.server` in the folder and go to `http://localhost:8000`.

## Put it on GitHub Pages

1. Create a repository and upload `index.html`, `ams_task.js`, `ams_stimuli.js` and the PNGs.
2. In **Settings → Pages**, choose *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. The task is then at `https://<your-username>.github.io/<repo-name>/`.

File names are case-sensitive on GitHub Pages (`Practice1_rect.png` is not `practice1_rect.png`),
even though they aren't on Windows or Mac. Images that load locally but not online usually have a
case mismatch in the name.

A public repository makes the images publicly readable. If that's a problem, use a private repository
on a plan that allows Pages for private repos.

## How it runs (same as PsychoPy)

1. Setup: participant ID and age group (3 or younger / 4 / 5). The age group picks the stimulus sheets.
2. Confirm screen → instructions.
3. **Samples:** 2 trials in random order, with feedback. A sample answered wrong is repeated once.
4. Ready screen → **practice:** 6 trials in random order, with feedback. If the round is ≤ 60 % correct,
   the reminder screen appears and a second round runs. Practice stops after 2 rounds at most.
5. **Test:** 3 blocks of 16 trials, no feedback. The block order is shuffled and the trials within each
   block are shuffled.
6. End screen; the CSV downloads automatically.

**Each trial:** a fixation cross stays up until someone presses space or taps → the dot image shows
for 2 s → the rectangle mask replaces it → the response ends the trial. Responses count from 0.3 s
after image onset, with no time limit.

| Response | Keyboard | Mouse / touch |
|---|---|---|
| Blue (left) | `S` | click/tap the left half of the screen |
| Yellow (right) | `L` | click/tap the right half of the screen |
| Next screen | space | click/tap anywhere |
| Stop early | `Esc` | the ✕ in the top-right corner (asks first) |

Taps within 0.3 s of a new screen appearing are ignored, so a double tap can't skip a screen.

### Differences from the PsychoPy script

- No date of birth, site ID, age check or language choice (English only). There's no task-choice screen.
- On touch screens, "Please press spacebar." reads "Please tap the screen."
- The practice reminder after round 2 is based on round 2's own score. PsychoPy used round 2 minus
  round 1. This only changes whether that reminder appears. The number of practice rounds and the
  test trials are unchanged.
- The end screen downloads the data instead of waiting for `q`.

## Data file

`<ParticipantID>_manynumbers_ams_web_<date>.csv` has one row per trial (samples, practice and test).
A run stopped early gets `_INCOMPLETE` added to the name.

| Column | Meaning |
|---|---|
| `phase` | `sample`, `practice` or `test`. Analyse `test` rows |
| `block_position`, `block_file`, `block_order` | position 1–3, which sheet was used, e.g. `b2-b3-b1` |
| `trial_in_loop`, `sample_repeat`, `practice_round` | trial counters |
| *every stimulus-sheet column* | `visual_stimuli`, `numRatio`, `n1`, `n2`, `correct_shift`, … (sample sheets use `Num1`/`Num2`) |
| `response.keys` | `s` (blue/left) or `l` (yellow/right), whatever the input device |
| `response.corr` | 1 = correct |
| `response.rt` | seconds from the 0.3 s mark, the same measure as PsychoPy's `response.rt` |
| `rt_from_stim_onset` | seconds from image onset (= `response.rt` + 0.3) |
| `response_method` | `keyboard`, `mouse`, `touch` or `pen` |
| `choice_right1` | 1 if `l` |
| `mask_onset_after_stim_ms` | measured mask onset (≈ 2000). Empty if the response came before the mask |
| `practice_round_pct_correct` | practice rows only |
| `totaltime_exp` | session length in seconds (complete runs only) |
| session info | `participant`, `age_group`, `date`, screen/window size, `touch_primary`, `user_agent` |

**Backup:** the browser also keeps the latest session after every trial. If a tab crashes or a download
fails, reopen the page on the same device and click **Download last session's data** on the setup page.
Starting a new session replaces that backup.

## Timing

Image timing follows the screen refresh (requestAnimationFrame) and response times come from browser
event timestamps. Both are accurate to about one frame (≈17 ms at 60 Hz), which is fine for this task
but not as precise as PsychoPy in the lab. Keep the tab in front during a session, because browsers
pause hidden tabs.

## iPad

- Use landscape. The page also works in portrait, but the images are smaller.
- Safari on iPad usually allows full screen. If it doesn't, use *Share → Add to Home Screen* and open
  the task from the icon.
- The CSV is saved to the *Files* app (Downloads).
