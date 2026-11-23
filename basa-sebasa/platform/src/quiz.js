// Meeting-day assessment: a 10-question trade quiz and a 12-statement attitude questionnaire, taken in the Pro app.
// DRAFT QUESTIONS: have a qualified Zimbabwean technician check every trade quiz (especially the safety questions)
// before real applicants take them. Answers never leave the server; the app only sees the questions.
// a = index of the correct option; s = safety question (must be right to pass).

export const QUIZ_VERSION = "draft-2026-11-23";
export const PASS_MARK = 7;

export const QUIZZES = {
  hvac: [
    { s: 1, q: "Before opening a fridge's compressor area to work on it, you should:", o: ["Unplug it and confirm there is no power", "Turn the thermostat to its lowest setting", "Open the doors to let it warm up", "Just wear gloves"], a: 0 },
    { q: "A fridge doesn't cool and the compressor clicks on and off every minute or so. The most likely fault is:", o: ["The start relay or overload", "The door seal", "The inside light", "Too much food inside"], a: 0 },
    { q: "In a no-frost fridge, ice builds up on the back wall of the freezer and the fridge section is warm. Most likely:", o: ["A defrost fault (heater, timer or sensor)", "The compressor is too strong", "The door was opened once", "The fridge is too full"], a: 0 },
    { s: 1, q: "When a fridge or aircon system has to be opened, the refrigerant gas should be:", o: ["Recovered with proper equipment, never released into the air", "Released outdoors", "Released slowly indoors", "Mixed with another gas to top it up"], a: 0 },
    { q: "Water collects at the bottom of the fridge compartment. The usual cause is:", o: ["A blocked defrost drain", "Too much gas", "A faulty light switch", "Compressor oil"], a: 0 },
    { q: "An aircon blows air but it isn't cold, and the outdoor unit's fan isn't turning. Check first:", o: ["The outdoor fan motor and its capacitor", "The remote's batteries", "Only the indoor filter", "The mode on the remote"], a: 0 },
    { s: 1, q: "Before touching the capacitor in an aircon outdoor unit you must:", o: ["Isolate the power and safely discharge the capacitor", "Touch it quickly with dry hands", "Switch the unit off with the remote", "Cut its wires"], a: 0 },
    { q: "The right way to check whether a thermostat is faulty is:", o: ["Unplug the fridge and test the thermostat with a multimeter", "Tap it with a screwdriver while it runs", "Replace the compressor first", "Smell it for burning"], a: 0 },
    { q: "A fridge stopped completely after a power surge: no light, no sound. First check:", o: ["The supply, plug, fuse and cord", "Regas it", "Replace the compressor", "Tell the customer to buy a new one"], a: 0 },
    { s: 1, q: "The customer says the fridge's metal body gives a small shock when touched. You:", o: ["Unplug it, stop it being used, and find the earth or insulation fault", "Say it's normal static", "Put the fridge on a rubber mat", "Tell the customer to wear shoes"], a: 0 },
  ],
  elec: [
    { s: 1, q: "Before working on a circuit you must:", o: ["Switch off at the board, stop anyone switching it back on, and test it is dead", "Switch off the light switch", "Wear gloves and work live", "Ask the customer whether it's off"], a: 0 },
    { q: "Half the house has no power and the rest works. Most likely:", o: ["A tripped breaker or a burnt connection, often the neutral, at the board", "The prepaid electricity has run out", "A blown bulb", "A faulty phone charger"], a: 0 },
    { s: 1, q: "The earth leakage unit keeps tripping. You:", o: ["Find the circuit or appliance that is leaking; never bypass it", "Bridge it out so the power stays on", "Fit a bigger breaker", "Tape the switch up"], a: 0 },
    { q: "A circuit breaker's rating is chosen mainly to protect:", o: ["The cable", "Only the appliance", "The meter", "The customer's bill"], a: 0 },
    { s: 1, q: "A socket circuit's breaker keeps tripping and the customer asks for a bigger breaker. You:", o: ["Refuse, and find the overload or fault", "Fit a bigger breaker", "Join it to another circuit", "Remove the breaker"], a: 0 },
    { q: "A light flickers and its switch feels warm. Most likely:", o: ["A loose or burnt connection at the switch", "It's normal", "The bulb is too weak", "The switch needs air"], a: 0 },
    { q: "A 3 kW geyser element at 230 V should measure about how many ohms, disconnected?", o: ["About 18 ohms", "0 ohms", "About 2,000 ohms", "No reading at all"], a: 0 },
    { s: 1, q: "The fault is on ZESA's side of the meter. You:", o: ["Don't touch it; it's ZESA's job. Work only from the customer's main switch onwards", "Fix it carefully", "Bypass the meter", "Swap the meter"], a: 0 },
    { q: "A customer wants a new socket added using thin lamp flex. You:", o: ["Use the correct cable size and installation method", "Use the lamp flex", "Plug in an extension instead and leave it", "Use any cable lying around"], a: 0 },
    { s: 1, q: "Someone is stuck to a live wire. You first:", o: ["Switch off the power, or push them free with something dry that doesn't conduct", "Pull them by the arm", "Throw water on them", "Wait for help"], a: 0 },
  ],
  plumb: [
    { s: 1, q: "Before replacing a geyser element you:", o: ["Switch off its electricity at the board, then close the water and drain the geyser", "Only close the water", "Only switch off at the wall", "Work fast before it cools"], a: 0 },
    { q: "Water drips constantly from the geyser's overflow pipe. Check:", o: ["The pressure and safety valves, and the thermostat", "Nothing, it's normal", "The kitchen tap washer", "The element size"], a: 0 },
    { q: "A toilet keeps running into the bowl. Most likely:", o: ["A worn flush valve washer or the float set too high", "Too much water pressure in the street", "A blocked drain", "A cracked bowl"], a: 0 },
    { s: 1, q: "The geyser's safety (temperature and pressure) valve is:", o: ["Never blocked or capped, whatever the customer says", "Capped if it drips", "Removed to save water", "Only needed on new geysers"], a: 0 },
    { q: "Only the hot taps have low pressure. Check first:", o: ["The geyser's valves and scale build-up", "The street water supply", "The cold water tank", "The drains"], a: 0 },
    { q: "A compression fitting leaks. You:", o: ["Check the olive and reseat it, without overtightening", "Tighten it as hard as you can", "Wrap it in tape", "Glue it"], a: 0 },
    { q: "A kitchen sink is blocked. Try first:", o: ["Clearing the trap and using a plunger or drain rod", "Pouring in strong acid", "Replacing the pipes", "Leaving it to clear itself"], a: 0 },
    { s: 1, q: "Soldering copper pipe in a ceiling needs:", o: ["A heat mat, an extinguisher to hand, and a check for smoulder after", "Nothing special", "Just speed", "The ceiling board removed first, always"], a: 0 },
    { q: "Pipes bang when a tap is closed. Most likely:", o: ["High water pressure or loose pipes", "A full geyser", "Air in the toilet", "A blocked drain"], a: 0 },
    { s: 1, q: "Before opening a borehole pump or its controls you:", o: ["Isolate its power and make sure no one switches it back on", "Switch it off at the pressure switch only", "Work on it running so you can hear the fault", "Disconnect the water only"], a: 0 },
  ],
  appl: [
    { s: 1, q: "Before opening any appliance you:", o: ["Unplug it and confirm it's dead", "Switch it off at its own button", "Work fast", "Wear gloves only"], a: 0 },
    { q: "A washing machine drains but won't spin. Check:", o: ["The drive belt, the motor brushes and the door lock", "The water inlet tap", "The detergent", "The drain hose height"], a: 0 },
    { q: "A washing machine won't drain. Check first:", o: ["The pump filter and the pump", "The motor brushes", "The door seal", "The program dial"], a: 0 },
    { s: 1, q: "A microwave's high-voltage capacitor:", o: ["Can hold a deadly charge even when unplugged; only discharge and work on it if trained", "Is safe once unplugged", "Is safe after 10 seconds", "Can be tested with a finger"], a: 0 },
    { q: "One stove plate doesn't heat but the others work. Most likely:", o: ["That plate's element or its switch", "The main breaker", "The oven thermostat", "The stove's earth"], a: 0 },
    { s: 1, q: "An electric kettle trips the house's earth leakage. You:", o: ["Stop it being used until the leak is found and fixed or the kettle replaced", "Plug it into another socket", "Bypass the earth leakage", "Tell the customer to use it quickly"], a: 0 },
    { q: "After repairing an appliance, before handing it back you:", o: ["Run a full test and check the earth connection", "Hand it back straight away", "Only check it switches on", "Let the customer test it"], a: 0 },
    { s: 1, q: "A gas stove smells of gas. You:", o: ["Close the gas, open windows, no sparks or switches, find the leak with soapy water", "Light it to burn off the gas", "Switch on a fan", "Look for the leak with a lighter"], a: 0 },
    { q: "A dishwasher leaves dishes dirty and the water stays cold. Most likely:", o: ["The heating element or its thermostat", "The detergent", "The door seal", "The plates"], a: 0 },
    { q: "You don't have the right part with you. You:", o: ["Quote it through the app and agree it first; never fit a used part without saying so", "Fit a used part and charge for new", "Leave it half done", "Swap a part from another appliance in the house"], a: 0 },
  ],
  solar: [
    { s: 1, q: "Before working on a solar system's inverter or batteries you:", o: ["Isolate the batteries, the panels and the mains. Panels make power whenever there's daylight", "Switch off the inverter's display", "Only switch off the mains", "Work at night only"], a: 0 },
    { q: "New batteries go flat quickly every night. Most likely:", o: ["The battery bank is too small for the load, or the charge settings are wrong", "The panels are too clean", "ZESA is too strong", "The batteries need water"], a: 0 },
    { s: 1, q: "Battery cables must be:", o: ["Sized for the current, with a fuse or breaker close to the battery", "As thin as possible", "Any cable that fits", "Without a fuse, so power isn't lost"], a: 0 },
    { q: "Two 40 V panels connected in series give about:", o: ["80 V", "40 V", "20 V", "160 V"], a: 0 },
    { q: "The inverter doesn't switch to battery when ZESA goes off. Check:", o: ["The inverter's settings and whether the battery breaker has tripped", "The panels' angle", "The customer's prepaid units", "The geyser"], a: 0 },
    { s: 1, q: "How do you check a panel is genuine and not relabelled?", o: ["Check the engraved ratings and measure its voltage and current with a meter", "Trust the sticker", "Weigh it", "Ask the seller"], a: 0 },
    { q: "Fitting lithium batteries to an inverter that had lead-acid ones, you must:", o: ["Set the battery type and charge voltages to match the new batteries", "Change nothing", "Add water", "Lower the panels"], a: 0 },
    { q: "A customer with a 1 kVA inverter wants to run a 2 kW geyser on it. You:", o: ["Explain the inverter is too small for it", "Connect it anyway", "Add another battery and connect it", "Bypass the inverter's protection"], a: 0 },
    { s: 1, q: "Working on a roof to fit panels, you:", o: ["Secure the ladder, use fall protection, and don't work alone or in strong wind", "Work quickly to finish before wind", "Stand on the gutter", "Carry the panels up alone"], a: 0 },
    { q: "Panel frames and the inverter should be:", o: ["Earthed as the standards require", "Left unearthed", "Earthed only in the rainy season", "Earthed to a water pipe only"], a: 0 },
  ],
  auto: [
    { s: 1, q: "Before working under a car you:", o: ["Put it on axle stands on firm ground; never rely on the jack alone", "Use the jack only", "Use bricks", "Ask someone to hold it"], a: 0 },
    { q: "A car cranks slowly and clicks. Most likely:", o: ["A weak battery or bad battery terminals", "The fuel pump", "The tyres", "The radio"], a: 0 },
    { q: "An engine overheats. Check first, once it has cooled:", o: ["Coolant level, the fan, the thermostat and leaks", "The tyre pressure", "The brake pads", "The air freshener"], a: 0 },
    { s: 1, q: "The radiator cap on a hot engine:", o: ["Is never opened until the engine has cooled", "Can be opened slowly", "Can be opened with a cloth", "Should be opened to release pressure"], a: 0 },
    { q: "Brakes squeal when braking. Most likely:", o: ["Worn brake pads", "Low engine oil", "A flat battery", "Wrong tyre pressure"], a: 0 },
    { q: "The check-engine light is on. Start by:", o: ["Reading the fault codes with a diagnostic scanner", "Replacing the engine", "Disconnecting the light", "Changing the oil"], a: 0 },
    { s: 1, q: "Disconnecting a car battery, you remove:", o: ["The negative terminal first, and reconnect it last", "The positive terminal first", "Both at once", "Either, it doesn't matter"], a: 0 },
    { q: "A car cranks normally but won't start, and there's no fuel smell. Check:", o: ["The fuel pump, its relay and fuse", "The brake pads", "The wipers", "The tyres"], a: 0 },
    { q: "After replacing a part, the old part:", o: ["Is shown to the customer", "Is thrown away before they see it", "Is sold", "Is put back in the car"], a: 0 },
    { s: 1, q: "You find a fuel leak while working. You:", o: ["Stop, keep sparks and cigarettes away, ventilate, and fix the leak first", "Carry on carefully", "Start the engine to check", "Light a match to see better"], a: 0 },
  ],
};

// good = the answer we hope for: true = agree, false = disagree.
export const ATTITUDE = [
  { t: "If a customer offers cash to skip the app, it's fine to take it.", good: false },
  { t: "If I break something at a customer's home, I tell them straight away.", good: true },
  { t: "Skipping a safety step is OK when I'm in a hurry.", good: false },
  { t: "If I'm not sure how to fix something, I say so instead of guessing.", good: true },
  { t: "It's fine to charge for a part I didn't replace if the customer won't notice.", good: false },
  { t: "I clean up and leave the customer's home tidy after a job.", good: true },
  { t: "If a customer is rude to me, I'm entitled to be rude back.", good: false },
  { t: "I arrive when I promised, or message before I'm late.", good: true },
  { t: "Giving customers my own number for future jobs is good business.", good: false },
  { t: "If a job feels unsafe, I stop and tell Basa seBasa.", good: true },
  { t: "I suggest buying a new appliance when it pays me more, even if a repair would do.", good: false },
  { t: "I would report another pro I saw stealing from a customer.", good: true },
];

// Options are shuffled for each applicant, so "always pick the first one" doesn't work. The order is kept
// on the server (perm[i][shown position] = original option index).
export function makePerms(trade) {
  return (QUIZZES[trade] || QUIZZES.hvac).map((x) => { const idx = x.o.map((_, k) => k); for (let k = idx.length - 1; k > 0; k--) { const j = Math.floor(Math.random() * (k + 1)); [idx[k], idx[j]] = [idx[j], idx[k]]; } return idx; });
}

// What the Pro app sees: no answers.
export function assessmentForPro(trade, perms) {
  return {
    version: QUIZ_VERSION, passMark: PASS_MARK,
    quiz: (QUIZZES[trade] || QUIZZES.hvac).map((x, i) => ({ i, q: x.q, o: perms[i].map((k) => x.o[k]), safety: !!x.s })),
    attitude: ATTITUDE.map((x, i) => ({ i, t: x.t })),
  };
}

export function grade(trade, perms, answers = [], attitude = []) {
  const Q = QUIZZES[trade] || QUIZZES.hvac;
  if (!Array.isArray(answers) || !Array.isArray(attitude) || answers.length !== Q.length || attitude.length !== ATTITUDE.length || answers.some((a) => a == null) || attitude.some((a) => a == null)) return { error: "Answer every question and statement first." };
  let correct = 0; const safetyMissed = [];
  Q.forEach((x, i) => { const ok = perms[i][Number(answers[i])] === x.a; if (ok) correct++; else if (x.s) safetyMissed.push(x.q); });
  const flags = []; let good = 0;
  ATTITUDE.forEach((x, i) => { const agree = attitude[i] === true || attitude[i] === "agree"; if (agree === x.good) good++; else flags.push(`${x.t} (answered ${agree ? "agree" : "disagree"})`); });
  return { version: QUIZ_VERSION, correct, of: Q.length, safetyMissed, quizPassed: correct >= PASS_MARK && safetyMissed.length === 0, attitudeGood: good, attitudeOf: ATTITUDE.length, flags, at: Date.now() };
}
