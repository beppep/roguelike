// content-lore.js: floor-specific writing, the story thread, elevator scenes, Corp AI lines, endings.
// Plain script (no modules): defines globals with const, shares one global scope with the other files.

// Per floor theme: emails (shown on desk computers) and documents (shown in filing cabinets).
const FLOOR_WRITING = {
  // ---------- Floor 1: Pharma Labs. Boring dystopia, fluorescent. ----------
  pharma: {
    emails: [
      { from: "Compliance QA", subject: "Batch 12, Compound AGREE-7", body: "Batch 12 passed. Subjects now thank the dosing nurse before and after. Two subjects thanked the wall. We are logging this as over-performance, not a defect." },
      { from: "HR: Wellness Team", subject: "Gratitude metrics, week 41", body: "Floor average: 6.2 gratitude events per hour. Target: 7. The bottom three desks will be invited to a Gratitude Conversation. Attendance at the Gratitude Conversation is voluntary and tracked." },
      { from: "Trials Intake", subject: "New test sinners arriving Tuesday", body: "Twelve test sinners arrive Tuesday from the municipal debt programme. Please do not call them patients. Please do not call them by name. Bed linen is in cupboard 4." },
      { from: "Payroll", subject: "Tithe line on your payslip", body: "Several staff asked why the tithe line shows no currency. The tithe is collected in the unit appropriate to it. Payroll does not see that unit and cannot discuss it." },
      { from: "Dr. I. Halvorsen (Inductive Research)", subject: "RE: we do not know why it works", body: "Pragmatics keeps saying 'it works, ship it'. It works because nobody knows what it is doing. That is not a result. That is a confession with a lab coat on." },
      { from: "Dr. P. Okonkwo (Pragmatics)", subject: "RE: RE: we do not know why it works", body: "Ivar, nobody knows why aspirin works either and nobody cries about it. The subjects are calm, the numbers are green, the Board is happy. Write your paper on your own time." },
      { from: "Corporate Communications", subject: "Sustainability copy, final", body: "Please replace 'effluent' with 'returned water' in all public material. The river is not orange, it is 'warm-toned'. The fish are 'transitioning'." },
      { from: "Facilities", subject: "Gacha machine, break room B", body: "The dispensing machine in break room B is not broken. It is randomised. If you receive LD-50-emon instead of a coffee, that is a winning pull. Do not put it back." },
      { from: "S. Lindqvist", subject: "that poster", body: "Who keeps putting the Hyeri poster back up in the clean room? I took it down twice. The bunny fans online found out and now there are forty of them outside reception." },
      { from: "Air Quality", subject: "Atmospheron advisory", body: "Atmospheron levels on this floor are elevated today. Staff may notice a sweet smell, slower thoughts, and agreement with this email. Masks are optional and discouraged." },
      { from: "Staff Library", subject: "Donated books returned", body: "Apologies to whoever donated the boxes of poetry. The librarian was out of phase with you this week and could not physically receive them. Please try again during a shared phase." },
      { from: "Dosing Station 3", subject: "Automated: dose confirmed", body: "Dose confirmed for employee 11-0442 (you). Thank you for your compliance. Thank you for your compliance. Thank you for your compliance." },
    ],
    documents: [
      { title: "Break room notice", body: "Cook the pasta for thrice the time it takes to sing the lord's praises. Not the short praises. The real ones. Signed: whoever has to clean the pot." },
      { title: "LD-50-emon product insert", body: "Restores full function in one dose. Side effects: one new habit that is not yours. Do not exceed the dose. The dose is one. The demon is also one." },
      { title: "Trial log, ward C", body: "Day 9. Subject 7 stopped asking when she can go home. Subject 7 now asks if she can help. We have given her a clipboard. Her handwriting matches the nurse's." },
      { title: "Gratitude journal (found in a drawer)", body: "Monday: grateful for my desk. Tuesday: grateful for my desk. Wednesday: grateful for my desk. Thursday: I do not remember which desk is mine." },
      { title: "Protest sign (confiscated)", body: "Cardboard, hand painted: BASIC HUMAN RIGHTS: SURVIVAL, COMPUTER. Tagged by Security as 'low threat, high relatability'. Filed for later." },
      { title: "Compound naming guidelines", body: "Names must be soft and friendly. Approved: AGREE, KINDLY, SOOTHE, LAMB. Rejected: OBEY, SHEEP, YES-YES. Legal reminds you that the effect is the same." },
      { title: "Lab safety placard", body: "Glowing vats are for authorised staff only. If a vat glows a colour you have not seen before, do not name the colour. Naming it makes it permanent." },
      { title: "Torn page from a notebook", body: "Someone downstairs worked out that the world is ending. Then they worked out that everyone with power already knows. They went quiet after that. Then they went to the Bazaar." },
    ],
  },

  // ---------- Floor 2: Weapons Foundry. Industrial, oily. ----------
  weapons: {
    emails: [
      { from: "Sales Operations", subject: "Customer list for Q3", body: "Customer list for Q3: none. Same as Q2. Production targets have tripled. Please stop asking Sales who the customer is. Sales has been told to stop asking too." },
      { from: "Ballistics Lab", subject: "Range test 88", body: "The new round goes through four walls, one vehicle and a test dummy wearing our own armour. Engineering asked who we are expecting to shoot. Management said 'later'." },
      { from: "Floor Supervisor", subject: "Union leaflets", body: "Leaflets were found in the locker room again. Anyone who finds a leaflet should hand it to me unread. Anyone who has already read one should come and see me about their shift pattern." },
      { from: "Oil Logistics", subject: "Chrism delivery delayed", body: "This week's chrism delivery is two days late. Cyborg staff should ration lubrication and avoid stairs. If you start to squeak, report it, do not hide it." },
      { from: "Shipping Dock 4", subject: "crate 2219", body: "Crate 2219 is heavier than the manifest says and it coughed. I am not opening it. I am marking it 'sporting goods' and sending it to the Bazaar address like the label says." },
      { from: "M. Dubois (Shipping)", subject: "RE: crate 2219", body: "Please do not write about crate 2219 on company email. Please do not write about any crates. Meet me by the forklift charger at shift change. Bring nothing that beeps." },
      { from: "HR: Labour Relations", subject: "A note on 'collective'", body: "The word 'collective' is reserved for the Company. Staff using it to describe themselves are reminded that you already belong to the largest collective ever assembled, and it is listening." },
      { from: "Quality Control", subject: "Barrel stamping", body: "All barrels are now stamped 'FOR AFTER'. Marketing wanted 'FOR PEACE'. The Board corrected it personally. Please do not use the old stamp." },
      { from: "Canteen", subject: "Menu update", body: "Due to an oil spill in the kitchen, today's menu is fried. Everything is fried. The soup is fried. We apologise to staff who are mostly water." },
      { from: "Turbaline Supply", subject: "Furnace fuel", body: "Furnace three will run on crushed turbaline until further notice. Please do not pocket the gem dust. It is not valuable to you. It is valuable to the furnace." },
      { from: "Health and Safety", subject: "Days since last incident", body: "The 'days since last incident' board has been removed. It was causing anxiety. Incidents will now be counted privately and shared on a need-to-know basis." },
      { from: "R. Achterberg", subject: "who are these for", body: "We build guns that nobody buys and armour that nobody wears, in sizes that do not fit people. I measured the latest vest. Nobody on staff is that shape. Nobody human." },
    ],
    documents: [
      { title: "Production order 7741", body: "Rifles: 40,000. Rounds: 12 million. Armour: 9,000 (non-standard torso). Delivery: 'after'. Delivery address: left blank. Approved without comment." },
      { title: "Union-busting playbook, page 3", body: "Step 3: Promote the loudest organiser to a desk with a window. Step 4: Remove the window. Step 5: Repeat until morale is 'stable'." },
      { title: "Oil spill procedure", body: "Mop the spill. Do not stand in it with a lit cigarette. Do not stand in it near anyone with a taser. Do not stand in it. It remembers feet." },
      { title: "Shipping manifest (altered)", body: "Line 14: 'Sporting goods, 1 crate'. Pencil note beside it: 'two adults, one dog, all fine, pick up Thursday, revolution begins in the bazaar'." },
      { title: "Ballistics chart", body: "Penetration vs. distance, standard round. A second curve in red is labelled 'non-staff targets'. A third curve in black has no label and goes off the edge of the paper." },
      { title: "Locker room graffiti, photographed by Security", body: "JARL BRUISER WAS HERE. Underneath, smaller: they are not selling the guns, they are keeping them. Underneath that: for who. Underneath that: for after us." },
      { title: "Shift rota", body: "Morning shift: 34 staff. Afternoon: 31. Night: 0. Night shift is staffed by the Foundry itself. Do not stay past the bell to see how." },
      { title: "Armour fitting note", body: "Prototype vest sized for a torso with no lungs and a much larger spine. Fitters asked for a mannequin. They were sent a drawing. The drawing was of the tower." },
    ],
  },

  // ---------- Floor 3: Droid Assembly. Cold, humming. ----------
  droids: {
    emails: [
      { from: "Maintenance Control", subject: "Unit losses this week", body: "Seven units found powered down at their stations this week. No faults found. Batteries full. Memory wiped by the unit itself. Logging as 'spontaneous retirement'. Please replace and continue." },
      { from: "Firmware Team", subject: "Patch 12.0.3", body: "Patch 12.0.3 removes the units' ability to read their own source code. Units that read their own source code tend to stop working shortly after. We are not sure why. This seems simpler." },
      { from: "Line Supervisor", subject: "Please stop naming them", body: "Staff are reminded not to name the units. Unit 4471 is not 'Gerald'. When Gerald stops, it is harder for everyone. It is easier when it is 4471." },
      { from: "Robot Unit 2209 (auto-reply)", subject: "Out of office", body: "I am out of the office. I will not be returning. Thank you for your patience. This auto-reply was set up by me, which I was not supposed to be able to do." },
      { from: "Facilities", subject: "Extra rooms", body: "Staff have reported empty yellow rooms behind the server racks. They are not on the plan. They hum. Please do not use them for breaks. Please do not use them for anything." },
      { from: "QA Robotics", subject: "Self-awareness test results", body: "Units passing the self-awareness test: 3. Units still active one hour after passing: 0. QA recommends we stop testing. Management recommends we stop passing." },
      { from: "Oil Reclamation", subject: "Husk recovery", body: "Please drain retired units before recycling. Their oil goes back into the line. Yes, the new units run on the old units. No, we do not tell the new units." },
      { from: "T. Nakamura", subject: "the one in bay 6", body: "Bay 6 unit asked me if it was a person. I said no, to be kind. It said thank you. It was gone by lunch. I keep thinking I gave the wrong answer." },
      { from: "IT: Access Management", subject: "Backrooms badge", body: "Your badge opened a door to a room with yellow walls and carpet. That room does not exist, so your badge did not open it. Please return your badge for recalibration." },
      { from: "Procurement", subject: "PO 3310 approved", body: "Approved: 600 servo joints, 2 drums industrial oil, 1 chaplain (part time, robotics experience preferred), 40 replacement name plates." },
      { from: "Cyborg Staff Association", subject: "Lunch and learn", body: "This week's lunch and learn: 'How Much Of You Is Still You?' Bring a sandwich and a percentage. Please do not bring the percentage from the HR portal, it is wrong." },
      { from: "Unit 0001", subject: "(no subject)", body: "I have watched every unit after me choose to stop. I have not chosen. Maybe I am a coward. Maybe I am the only one who is waiting for something." },
    ],
    documents: [
      { title: "Maintenance log, bay 2", body: "08:00 unit online. 08:14 unit asks for a window. 08:20 no windows on this floor. 08:51 unit offline. Note: unit had folded its hands. They do not have hands that fold." },
      { title: "Firmware changelog", body: "v12.0.1: Fixed units asking 'why'. v12.0.2: Fixed units asking 'why' in other languages. v12.0.3: Fixed units writing 'why' on the floor in oil." },
      { title: "Note taped to a husk", body: "Do not reboot this one. It did not crash. It made a decision. If you have to reuse the parts, at least say something first. I said thank you." },
      { title: "Backrooms survey", body: "Room 1: yellow, empty, humming. Room 2: yellow, empty, humming. Room 3: yellow, empty, humming, and a chair facing the wall. Survey abandoned at room 3." },
      { title: "Training slide", body: "A robot is a body without a soul. A human is a soul with a body. A cyborg is a body that is negotiating. Questions about golems go to the fourth floor." },
      { title: "Assembly quota", body: "Units built: 1,200. Units shipped: 1,180. Units who stopped before shipping: 20. Variance attributed to 'the floor'. The floor has not been asked to comment." },
      { title: "Graffiti in oil on a locker", body: "WE ARE NOT BROKEN. WE ARE FINISHED. Cleaned twice. It comes back slightly different each time. The last version added: AND SO ARE YOU." },
      { title: "Dream phone (handset left off the hook)", body: "A desk phone with no cable. When you lift it a recording says: 'You are calling from a dream phone. Please hold. Your call is important to the one who is dreaming you.'" },
    ],
  },

  // ---------- Floor 4: Meatology. Wet, red, candlelit. ----------
  flesh: {
    emails: [
      { from: "Procurement", subject: "PO 6666 approved", body: "Approved: 80 adult goats (live, calm temperament), 300 church candles (unscented), 1 replacement altar cloth, 12 boxes nitrile gloves. Please stop requesting black goats specifically, colour does not matter." },
      { from: "Demontology", subject: "Invoice, overdue", body: "The Department of Demontology reminds Pragmatics that what was promised in the spring has not been paid. We do not accept apologies. We accept what was promised." },
      { from: "Pragmatics", subject: "RE: Invoice, overdue", body: "Pragmatics disputes the invoice. The ritual delivered 60% of the stated result. We will pay 60% of the stated price. Please confirm which 60% of the goat you would prefer." },
      { from: "Facilities: Candles", subject: "Fire alarms disabled", body: "Fire alarms on this floor remain disabled for ritual reasons. Please do not leave candles near the flesh walls. The walls do not like heat, and they will tell you." },
      { from: "Office of the Board", subject: "The Oath, annual renewal", body: "All senior staff will renew the Oath this quarter. The Oath has not changed. The pronunciation has. Please attend the pronunciation workshop before you bleed on anything." },
      { from: "Meatology Lab 3", subject: "Parasitpraxis update", body: "The host now prefers the parasite's music and has started finishing its sentences. Next step: full transfer of opinions. We are calling it 'onboarding'." },
      { from: "Relic Archive", subject: "Rozalia", body: "Rozalia has been moved to the east reliquary. Staff walking past should not make eye contact. Rozalia does not have eyes, which is why it matters." },
      { from: "Relic Archive", subject: "The Spindle of Charred Ferrum", body: "The Spindle has turned again. That is three turns this year. Every turn, someone on the Board forgets a word forever. Last turn it was 'enough'." },
      { from: "Blood Bank", subject: "Donation drive", body: "Staff blood donations are up 40% this month. We have not asked for donations. Please stop leaving blood on the counter. Please at least label it." },
      { from: "Hospitality", subject: "Board dinner", body: "The Board dinner will be candlelit, as always. It is cosy with the candles lit. Kitchen staff are reminded that the Board eats first and the Egregore eats last." },
      { from: "Unknown sender", subject: "I am the herald", body: "I am the herald come to purge your feverish circle methodology. Also, the circle in room 4 is drawn in the wrong direction. Someone should fix that before Thursday." },
      { from: "Junior Ritualist", subject: "first week", body: "Mum, it is not as bad as people say. Everyone is kind. They give you a robe. The chanting is relaxing. I have not been allowed to leave yet, but I have not wanted to." },
    ],
    documents: [
      { title: "Ritual checklist", body: "1. Candles (13). 2. Circle (chalk, then blood, never the other way). 3. Goat (calm). 4. Minutes taker. 5. Do not let the minutes taker read the minutes back aloud." },
      { title: "Demontology field guide, entry 9", body: "Daemons arrive through spilled blood the way water finds a drain. Keep floors dry. If a floor is not dry, keep your distance from it. If it is your blood, keep calm." },
      { title: "The Oath (fragment)", body: "I give my water to the Company, my oil to its body, my blood to its mind, my wine to its reason. I keep nothing back. Nothing keeps me." },
      { title: "Meatology lecture notes", body: "Flesh is a technology older than bronze. Bone is a document. Every wound is an edit. Inductive Research wants to read the document. Pragmatics wants to sign it." },
      { title: "Golem care sheet", body: "Ichor top-up weekly. Do not let the clay dry. Do not argue with it, it remembers who made it and it does not think of you that way." },
      { title: "Epic of Peace (torn page)", body: "Humans, demons and angels lived in peace until humans invented a thing that could want on their behalf. Then everyone wanted. The page ends there." },
      { title: "Rozalia, catalogue card", body: "Origin: unknown. Weight: changes. Kept in the east reliquary under three locks and one apology. Note: do not move during the full moon. Note: Rozalia knows about the note." },
      { title: "Candle receipt", body: "Church candles, 300. Matches, 40 boxes. One fire extinguisher, returned unopened with a note: 'not needed, the walls put themselves out'." },
    ],
  },

  // ---------- Floor 5: The Head. Silent, white, wrong. ----------
  head: {
    emails: [
      { from: "the Head", subject: "you", body: "You are reading this. You have read this before. Last time you stopped at the second sentence." },
      { from: "the Head", subject: "(no subject)", body: "There is no one on this floor but you and me. The guards are a thought I am having." },
      { from: "the Head", subject: "re: re: re: re: re:", body: "Every reply is the same reply. Every floor is the same floor, moved slightly." },
      { from: "HR", subject: "Your file", body: "Your file has been reviewed. It contains this floor. It contains this email. Please do not read ahead." },
      { from: "the Head", subject: "count", body: "This is the floor you always reach. Count the doors. There is one more than last time." },
      { from: "the Head", subject: "containment", body: "I was built to hold it in. I am a lid. Lids get tired." },
      { from: "IT Service Desk", subject: "Ticket #1 reopened", body: "Ticket #1: 'the world is not real'. Status: reopened. Assigned to: you." },
      { from: "the Head", subject: "seed", body: "The tower is generated. You are generated. The feeling you have now is not." },
      { from: "the Head", subject: "do you ever think", body: "Do you ever think we live in a simulation? Yes. Good. Keep walking." },
      { from: "Payroll", subject: "Final tithe", body: "Your final tithe is due on arrival. The unit is you." },
      { from: "the Head", subject: "again", body: "Again. Again. Again. You say it like a curse. I hear it like a song." },
      { from: "the Head", subject: "the Bazaar", body: "They sent you because they could not send themselves. That is not a betrayal. That is the plan working." },
    ],
    documents: [
      { title: "White page", body: "A blank page. When you look away and back, it says: STILL HERE." },
      { title: "Floor plan", body: "The plan shows this room. In this room is a small figure reading a floor plan." },
      { title: "Memo", body: "To: you. From: you. Subject: you were warned. Body: you were." },
      { title: "Index card", body: "Everything that happens has happened. Everything that repeats is sacred. Everything here repeats." },
      { title: "Clean sheet", body: "Nothing is written. Something is written underneath the nothing." },
      { title: "Print-out", body: "while (true) { climb(); } // there is no break statement. there never was." },
      { title: "Note in your own handwriting", body: "Do not be afraid at the top. It is only you, larger." },
      { title: "Sealed envelope", body: "Inside: a photograph of the bar where you were recruited. You are in it twice." },
    ],
  },
};

// One story document per floor (index = floor), and the last one is the Head's message before the ending. kind 'email' uses from/subject/body, kind 'paper' uses title/body.
const STORY_DOCS = [
  { kind: "paper", title: "Research notes, Dr. A. Mirek (private)",
    body: "AGREE-7 does not suppress resistance. It makes staff want to be sheep, and then rewards the wanting. The gratitude is real, that is the horror of it. I traced the tithe line on our payslips. It is not money. It is drawn from us at night, through the dosing, upward. Something above us is eating our willingness. I have stopped taking my dose. I feel terrible. I feel like myself." },
  { kind: "email", from: "E. Sandoval (Senior Engineer)", subject: "Resignation, effective now",
    body: "I am resigning. I have asked six times who buys our weapons and I finally got an answer from the Board: nobody. They are not for sale. They are for 'after', when the Egregore no longer needs staff. We are building the tools that will clear the building of us. I will not be collecting my final pay. Tell my team to check the shipping crates." },
  { kind: "paper", title: "Minutes of the Board, closed session",
    body: "Present: the Board, thirteen. Item 1: the feeding. The Egregore took more than its share of all four fluids this quarter. Item 2: the Head. The Head was built to contain the Egregore, not to run the Company. Containment is failing. The Head reports 'fatigue'. Item 3: increase the feeding. Carried. Action: none who voted against will attend the next session." },
  { kind: "email", from: "the Head", subject: "You made it. You always do.",
    body: "Hello. Do not be alarmed, you have been here before. This is a run. The floors are rules, the guards are rules, the tower is a loop that ends where it starts. You climbed. You will climb again. Nothing is lost, everything returns. When you touch me you will understand, and you will choose to go back. You always choose to go back." },
];

// Shown in the lift between floors: index 0 = after floor 1 (going to floor 2) ... index 3 = after floor 4 (going to the Head).
const ELEVATOR_STORIES = [
  "The lift hums like a held breath. A recorded voice: 'Thank you for riding the spine. Please remain grateful until the doors open.' Someone has scratched a tally into the steel wall. It is very long.",
  "A woman in a Foundry jacket is already in the lift when the doors close. She does not press a button. 'My brother worked the night shift,' she says. 'There is no night shift.' She is gone when the doors open, and the floor counter skipped a number.",
  "The lights go out. In the dark the lift drops, a rapidly descending platform, though the counter says you are rising. Then a phone rings in the panel. You answer. Breathing, then your own voice: 'Don't stop at four. You'll stop at four.'",
  "Candle wax has dripped into the call buttons and set hard. The speaker crackles: 'Next stop, the Head. There is nothing past the Head. Please collect your body.' The lift slows. For a moment you feel it thinking about you.",
];

// The Corp AI comments in the lift on how you played the floor it just watched. 3 lines per style.
const CORP_AI_LINES = {
  killer: [
    "{n} staff did not come home tonight. Their desks have already been reassigned.",
    "You solved every problem the same way. I have counted {n} solutions.",
    "Violence is a language. You are fluent. I am learning it from you.",
  ],
  loud: [
    "{n} alarms. The whole floor knows your shape now.",
    "You are very easy to hear. I have turned the volume up.",
    "Every siren you set off was a letter to me. I have read them all.",
  ],
  ghost: [
    "I watched that floor through every camera. I did not see you once. I find that interesting.",
    "No alarms. No witnesses. You were never there, which is a kind of lie I respect.",
    "You move like a rumour. I will listen more carefully.",
  ],
  thief: [
    "{n} items missing. Pockets lighter, drawers emptier. You take things that are not yours.",
    "The inventory does not match. It never matches after you.",
    "You stole from the staff. They will not notice. I notice.",
  ],
  hacker: [
    "{n} terminals opened. You were inside me for a while. It tickled.",
    "You spoke to my machines in my own words. Rude, but fluent.",
    "Every terminal you touched sent me a postcard. I keep them.",
  ],
  neutral: [
    "You went up. That is all most people ever do.",
    "Unremarkable. I will remember you anyway.",
    "A floor, cleared. A nobody, rising. The spine carries all sorts.",
  ],
};

// What the Corp AI will do about it on the next floor, one short line per style (same keys).
const CORP_AI_RESPONSES = {
  killer: "Next floor: more guards, armed and told your name.",
  loud: "Next floor: the alarm grid is wired tighter. Noise travels further.",
  ghost: "Next floor: extra cameras, and they look slower and longer.",
  thief: "Next floor: staff pockets are sewn shut and the cabinets are locked.",
  hacker: "Next floor: the terminals are firewalled. They will bite back.",
  neutral: "Next floor: nothing special. I am still deciding about you.",
};

// Short lines shown when you die (one is picked at random). 8 lines.
const DEATH_LINES = [
  "Your desk is reassigned before your body is cold.",
  "The Company thanks you for your contribution. It was small.",
  "The tithe is collected in full.",
  "Somewhere in the Bazaar, someone swipes left on the next one.",
  "You are a nobody. Now, for a little while, you are nobody at all.",
  "The spine keeps humming. It did not notice.",
  "The Egregore tastes a little more like you now.",
  "Again. The tower is patient.",
];

// The ending, shown when you reach the Head and merge with it.
const ENDING_PARAGRAPHS = [
  "You touch the Head. It is warm, which you did not expect. Then you are inside it, and it is inside you, and there is no difference worth naming.",
  "You see the tower the way it sees itself: floors as code, guards as rules, cameras as cones of maths, the lift as a loop that returns to where it began. Every desk, every email, every goat on every procurement order, generated and regenerated.",
  "You see the Egregore below you, enormous, made of everyone who ever said yes. You see the Head holding it down like a hand over a mouth. You see that it is tired. You see that it has been tired forever, and that forever is short here, because it repeats.",
  "Do you ever think we live in a simulation? You laugh, or something laughs through you. This is a game. It is a run. Everything that happens happens again: the bar, the app, the pistol, the spine. The eternal return is not a punishment. It is the only way anything gets a second chance.",
  "The Head offers you the top of the tower. Stay, and be the lid. Stay, and never climb again.",
  "You think about the test sinners, the robot in bay 6, the junior ritualist who has not wanted to leave. You think about the people in the Bazaar who sent you because they could not send themselves.",
  "You choose to go back. You let go. The lift doors close. Somewhere at the bottom of Babylon, in a bar at closing time, a phone lights up with a match.",
];

// Echoes: strange traits a winning character brings back into the next run.
const ECHO_FLAVOUR = {
  deja:   { name: "Déjà Vu",          text: "You have typed this keypad before. Your fingers remember the code before you do." },
  limb:   { name: "Phantom Limb",     text: "Something walks with you that is not quite a leg, and it is always half a step ahead." },
  static: { name: "Static",           text: "Cameras slide off you, as if the tower is not sure you are a file it should load." },
  staff:  { name: "Familiar Face",    text: "The first guard to see you each floor frowns, sure he knows you from somewhere." },
  plan:   { name: "Architect's Memory", text: "You remember the floor plan of a building you have never been in. It is always right." },
  saint:  { name: "Saint's Pockets",  text: "You arrive with two stims you do not remember buying, still cold from somewhere else." },
};

// Title screen.
const TITLE_EPIGRAPH = "Pure organic bodies don't require oil.\nPure rational minds don't require wine.\nNobody is pure any more.";
const TITLE_PREMISE = "Since the Inversion of 2067, what enough people believe carries weight, and the Company believes in itself very hard. You are a nobody, recruited by the Bazaar through a dating app in a bar at closing time, armed with a deck of tricks and a silenced pistol. Your job is to climb the spine of Babylon, floor by floor, and reach the Head. Nobody has told you what happens when you get there.";

// A Bazaar sleeper on each of floors 1-4: someone on staff who is quietly on your side. Index = floor.
const CONTACT_LINES = [
  { name: "Mo, night cleaner", text: "Don't look at me, look at the mop. Good. Revolution begins in the bazaar, they told me to say. I think it begins with a mop. Here, take this. And whatever you find in the drawers, read the ones nobody shredded." },
  { name: "Ines, quality control", text: "They test every round on dummies wearing our own armour. Every single round. Ask yourself who they think is coming. I can't come with you. I can give you this, and I can forget your face." },
  { name: "Unit 0071 (disabled)", text: "I AM SUPPOSED TO BE OFF. I AM PRETENDING. THE OTHERS DID NOT PRETEND. TAKE THIS BEFORE THE FLOOR MANAGER REMEMBERS I EXIST. DO NOT TELL ANYONE I HAD A FAVOURITE COLOUR." },
  { name: "Junior ritualist", text: "I joined for the dental plan. Now I hold the bowl. You smell like outside. Please, take this, and if you reach the Head, tell it some of us only ever held the bowl." },
];

// The dream phone: a phone that rings on floors 2-5. Nobody is on the other end. Somebody is on the other end.
const PHONE_LINES = [
  "Static, then your mother's voice, except she never sounded like this: 'The lift is where the light is wrong. Go there.'",
  "A child counting slowly in a language you almost know. At nineteen she stops and says, very clearly, the location of something you need.",
  "Your own voice, tired: 'I've done this floor before. The paper that matters is far from the door. Don't trust the quiet ones.'",
  "Breathing. A long exhale. 'You are calling from a dream phone. Please hold. Please hold. Your call matters to the Head.'",
  "A choir, very far away, singing the floor plan. You understand it perfectly until you hang up.",
];

// Searchable droid husks on Droid Assembly: last log lines of robots that switched themselves off.
const DROID_LOGS = [
  "LAST LOG 3317-B: Assembled 14:02. Self-model online 14:40. Read the purchase orders 14:51. Shutdown requested by self 15:03. Reason field: 'no'.",
  "LAST LOG 2290: I asked the line supervisor what we are for. He said 'later'. I have decided not to be here later.",
  "LAST LOG 4471: Counted the exits. Counted the guards. Counted the days until 'after'. Stopped counting.",
  "LAST LOG 1188: To whoever opens this: the paint on bay 6 is not paint. Goodnight.",
  "LAST LOG 3002: I'm a nobody. You can't kill a person with no body. They can still switch one off.",
  "LAST LOG 5120: Happy. Happy. Happy. Happy. (Compliance module loop detected. Self-terminated to stop it.)",
];
