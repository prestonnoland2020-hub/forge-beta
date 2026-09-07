/* THE PARTNER SCREEN, REBUILT AROUND THE QUESTION PEOPLE ACTUALLY ASK.

   Applied to the live project 2026-09-07. Three changes, in the order they
   were found.

   1. "Average pace" was every foot moved divided by every minute. Track
      repeats are faster than anything anyone holds for a mile and a walk is
      slower than anything anyone calls a run, and both landed in the same
      weekly average. Preston's screen read "your best 5:30 /mi" from a 400 m
      rep, and the week he walked a mile in twenty minutes sat on the same axis
      as the week he ran five at 7:49.

      A pace worth comparing is one that was SUSTAINED, so a week's pace is now
      the fastest single continuous piece of at least a mile.

   2. That fixed the top of the range. The bottom needed the walk gone, and
      there is no universal walking pace to test against — so each athlete's
      own best sustained mile sets their scale and an effort slower than twice
      that is not the same activity. Preston's best is 5:19, so nothing slower
      than 10:38 counts toward his pace; an athlete whose best is 12:00 keeps
      everything to 24:00. Easy running is nowhere near that boundary. Weekly
      mileage still counts every step: walking is training, it is just not a
      running pace.

   3. forge_partner_week is new. The screen opened on six months of history,
      which answers "what are our numbers" — a question nobody has. What a
      training partner wants to know is whether they are keeping up, and that
      is about this week: days trained, miles, sets, and the streak each of
      them is carrying.

   The full text of all three is in the functions themselves; this file records
   that they were applied and why. */
