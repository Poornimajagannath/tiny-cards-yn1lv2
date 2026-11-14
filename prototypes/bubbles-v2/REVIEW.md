# Bubble directions — design review

Prototype only. `blocks.html` and pull request #2 are unchanged.

## What changed, and why

The live bubble screen sits on the tower’s clay and paper palette. Poornima asked for color, and said Ane does not read as an elephant (Aani). These two mocks leave that palette. Ane is redrawn as a baby elephant: big ears, pink inside the ears, a trunk, no tusks, a soft blue-gray body. Myna is a bird, Meenu is a fish, Pup is a dog. Digits are black on white so the number, not the color, is the answer.

## Two directions

| Direction | Axis | When it is the right one | What it costs |
| --- | --- | --- | --- |
| Grove | A mango grove: leaf green, sky blue, mango gold, flower pink | The story is about lost mangoes, and the room should feel outdoors | The green field is quieter than candy, and can feel empty between the elephant and the button |
| Candy | Candy sky: pink, lemon, lilac, hot-pink buttons | She wants the page to feel like a picture book the moment it opens | The color is louder, and a tired afternoon may want less of it |

No favorite is chosen here. That pick is hers.

## Review notes

Information: each screen does one job. Story, then a friend, then match the big number, then stop and find spoons.

States: these files are still pictures. They show the story, the choice, a round in progress (1/5, find 3), and the win. They do not show a wrong wiggle or an empty basket. Those stay for the build, after a direction is chosen.

Journey: lost mangoes, a friend, a number she can match without reading, then spoons in the real kitchen. The cheer stays off these stills so the number stays the biggest thing.

Contrast: digits are near-black on white. Bubble colors are the rim only, and they are not lined up with 1-red, 2-orange, 3-yellow.

Not in this round: no change to the tower, no new game behavior, no merge.

Open decision: Grove or Candy. Everything else in these pictures (the elephant, the three friends, black-on-white numbers) is the same in both, so a pick is about the world, not about whether Ane is an elephant.
