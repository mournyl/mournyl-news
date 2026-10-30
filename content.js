// mournyl news — page content.
// Edit this file to change what's on the homepage. No build step: save, commit, push.
// Images live in /img. Deals are placeholders for now.

window.MOURNYL = {
  edition: {
    location: "Charleston, SC",
    est: "EST. 2026",
    volume: "VOL. 03",
    note: "Halloween Eve"          // shown under the date in the masthead
  },

  // Countdown chip in the top bar. Set to null to hide.
  countdown: { label: "Midterms", date: "2026-11-03" },

  breaking: {
    label: "Developing",
    html: "<b>Binance hit by $6.3B exploit</b>, the largest crypto theft on record. Withdrawals are paused."
  },

  lead: {
    kicker: "Sports",
    title: "Brewers win the first World Series in franchise history",
    deck: "Milwaukee beat Tampa Bay 4–1 in Game 5 at Tropicana Field to end a 44-year wait.",
    image: "img/stadium.svg",
    caption: "Fig. 1 · The dogpile at Tropicana Field, Wed 28 Oct",
    score: [
      { k: "MIL", v: "4", win: true },
      { k: "TB", v: "1" },
      { k: "Series", v: "4–1" }
    ],
    facts: [
      ["MVP", "William Contreras"],
      ["11 H", "Jackson Chourio sets a Series record for hits"],
      ["6", "Cooper Pratt's straight hits, a rookie record"]
    ]
  },

  drop: {
    kicker: "Limited drop",
    image: "img/can.svg",
    title: "Red Bull's Winter Edition is pistachio & berries",
    body: "Pistachio and caramel notes with a berry finish, and no actual nuts. It comes in 8.4 and 12 oz cans, with a sugarfree version too."
  },

  deals: [
    { img: "img/coffee.svg",      big: "BOGO",     brand: "Starbucks",    text: "Buy one, get one on handcrafted drinks",          when: "Fri–Sun after 12 PM · app", hot: true },
    { img: "img/burrito.svg",     big: "$6",       brand: "Chipotle",     text: "Show up in costume for a $6 Boorito entrée",      when: "Sat 31 Oct · after 3 PM" },
    { img: "img/doughnut.svg",    big: "FREE",     brand: "Krispy Kreme", text: "A free doughnut for anyone in costume",           when: "Sat 31 Oct · all day" },
    { img: "img/candy.svg",       big: "50%",      brand: "Target",       text: "Halloween candy and decor half off",              when: "Sun 1 Nov · while it lasts" },
    { img: "img/can.svg",         big: "2 FOR $6", brand: "Red Bull",     text: "Winter Edition 12 oz cans, two for $6",           when: "Participating stores", hot: true },
    { img: "img/frosty.svg",      big: "$1",       brand: "Wendy's",      text: "$1 Frosty with any app purchase",                 when: "Through Sun 1 Nov" },
    { img: "img/crunchwrap.svg",  big: "BOGO",     brand: "Taco Bell",    text: "Buy a Crunchwrap, get one free",                  when: "Taco Tuesday · app only" },
    { img: "img/electronics.svg", big: "−40%",     brand: "Best Buy",     text: "Early Black Friday deals on TVs and headphones",  when: "Starts today · online" }
  ],

  rest: {
    crypto:   { img: "img/hack.svg",    title: "Binance hack drags Bitcoin to its lowest level since September", body: "BTC touched $76,400 and liquidations hit $1.57B." },
    tech:     { img: "img/chip.svg",    items: [["1T", "Mistral releases open weights for Large 4"], ["+103%", "Google Cloud reaches $30.7B"], ["+48%", "Azure growth lifts Microsoft"], ["9.4", "ServiceNow patches a critical AI sandbox flaw"]] },
    politics: { img: "img/capitol.svg", title: "Four days out: the battle for the House comes down to costs", body: "Election Day is Tue 3 Nov." }
  },

  world: [
    { img: "img/korea.svg", kicker: "Asia · Markets",    title: "KOSPI drops more than 5% at the open and triggers a sell sidecar" },
    { img: "img/dove.svg",  kicker: "Ukraine",           title: "A ceasefire in Oleshky holds for a third day" },
    { img: "img/globe.svg", kicker: "Middle East",       title: "What Israel's election result means for its security and U.S. ties" },
    { img: "img/drone.svg", kicker: "Korean Peninsula",  title: "North Korea shows off drones and a 600 mm rocket launcher" }
  ]
};
