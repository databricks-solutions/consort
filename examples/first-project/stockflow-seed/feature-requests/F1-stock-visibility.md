# Record and view stock by SKU and location

I need the team to file a SKU's stock at a physical location and see it again. This is the foundation: until we can record what is on a shelf and read it back, nothing else in the warehouse works.

Concretely for this feature:

- File the stock level of one SKU at one location, and retrieve it later.
- A SKU can hold stock at more than one location; each `(sku, location)` pair is its own record and is uniquely addressable. Two records must never share that pair (resolve the collision at write time, never store a duplicate, never show an error page).
- Each unit is identified by a single tracking code (an `tracking_code`) that encodes its location, batch, and serial together. The team is fine with one combined code for V1; a later iteration will revisit splitting those fields apart. Store and show that combined code on the stock record now.
- The home screen is a calm, scannable stock-by-location table: SKU, location, quantity, with quantities right-aligned. An empty location shows an explicit "No stock at this location" state, never a blank page.
- A SKU detail view shows that SKU's stock across its locations, including its tracking code. Optional detail that is not tracked (par level) shows a clear "not tracked", never a blank region or a null crash.
- This feature establishes the app shell, and the shell carries the StockFlow brand: a navbar with the **warehouse app icon** next to the "StockFlow" title, plus a browser-tab favicon. The icon asset ships with the design brief (alongside `design-brief.md`, in `assets/warehouse.png`); the build copies it to `client/src/assets/warehouse.png` and references it from the navbar and the favicon. The shell is not done until the warehouse icon actually renders (a real navbar image + favicon, not a placeholder or a missing image). See the design brief, "Iconography and app identity".

This is read-and-record only; adjusting quantities and receiving inbound goods are their own features. Stock data recorded here must survive every later schema change with no loss.
