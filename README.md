# sups shirazu

Fast auto-reservation Chrome extension for Shiraz University SUPS portal (`sups.shirazu.ac.ir`) — Pool and Weekly Meal Token Reservation.

Developed by **Raman Tondro** ([@RMNO21](https://github.com/RMNO21)).

---

## Features

- **Weekly Food Token Fast Reservation (`SfxChipWeek.aspx`)**:
  - Compact day-by-day quick picker (Saturday to Friday).
  - Filtered exclusively to the 3 relevant dining halls: **مرکزی**, **ارم (پسر)**, and **شیمی نفت و گاز**.
  - One-click meal skip option.
  - Live total cost & deficit calculation against current student credit.
  - Recommended minimum recharge package calculation.
  - Seamless recharge redirect & automatic order execution prompt upon returning from bank payment.
- **Pool Auto-Reserve Sniper (`SfeReserve.aspx`)**:
  - High-speed automated booking loop for high-demand pool slots.
  - Table-click picker or dropdown target selection.
  - Audio chime and desktop notifications upon confirmation.
- **Non-Intrusive**: Collapsed by default via sleek floating launcher pill.
- **Strict Page Isolation**: Pool tools only activate on pool pages; food tools only activate on dining pages.

---

## Installation

1. Clone or download this repository:
   ```bash
   git clone https://github.com/RMNO21/shirazu-pool-reserve.git
   ```
2. Open Chrome and go to `chrome://extensions/`.
3. Enable **Developer mode** in the top right.
4. Click **Load unpacked** and select this directory.
5. Open Shiraz University SUPS portal:
   - Food tokens: `https://sups.shirazu.ac.ir/SfxWeb/SFX/SfxChipWeek.aspx`
   - Pool: `https://sups.shirazu.ac.ir/SfxWeb/Emp/SfeReserve.aspx`

---

## Author
- **Raman Tondro** - [GitHub Profile](https://github.com/RMNO21)
