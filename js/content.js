// content.js: emails, documents and other writing — part of the roguelike. Plain script (no modules): files share one global scope
// and load in the order listed in index.html.

// ---------- Office furniture you can search ----------
// Desks have a computer with an email on it; filing cabinets hold a document, sometimes nothing.
// Mostly it's ordinary office life; now and then something worse shows through. Loot is rare.
const EMAILS = [
  { from: 'Facilities', subject: 'Fridge on this floor', body: 'Whoever left the unlabelled container on the bottom shelf: it has started to move. Please collect it by Friday or it will be disposed of per Biohazard Protocol 4.' },
  { from: 'HR — Wellness Team', subject: 'Mandatory Gratitude Week', body: 'This week, every employee will log three moments of gratitude in the portal. Gratitude is tracked. Your neural lace will remind you hourly.' },
  { from: 'D. Marsh', subject: 'RE: RE: RE: printer', body: 'It is printing the same page again. Nobody sent it. It is just the word "below" over and over. I have unplugged it twice.' },
  { from: 'IT Service Desk', subject: 'Ticket #44812 closed', body: 'Your report of "voices in the server room" has been closed as Working As Intended. Please do not open the server room.' },
  { from: 'Payroll', subject: 'Your deductions', body: 'This month: tax, pension, implant lease (installment 31 of 240), and the usual tithe. Questions about the tithe are not answered by Payroll.' },
  { from: 'K. Oyelaran', subject: 'lunch?', body: 'Same place as usual? Not the cafeteria. They changed the menu again and nobody will say what the protein is.' },
  { from: 'Office of the Board', subject: 'Quarterly gathering', body: 'Senior staff will gather on the thirteenth floor at midnight. Wear the grey robes. Bring nothing that remembers your name.' },
  { from: 'R&D Pharmacology', subject: 'Batch 7 results', body: 'Compound shows 94% compliance in test subjects. Side effects: mild euphoria, loss of appetite, subjects report a man standing behind them. Proceeding to trials.' },
  { from: 'Security', subject: 'Badge access reminder', body: 'Sublevel B access is suspended until further notice. If your badge opens it anyway, report to Security immediately and do not go in.' },
  { from: 'M. Varga', subject: 'Leaving do', body: 'Cake in the break room at 4 for Petra, who is "moving to the countryside". She did not say goodbye to anyone. Her desk is still warm.' },
  { from: 'Procurement', subject: 'PO 2291 approved', body: 'Approved: 400 units printer paper, 12 cases saline, 3 adult goats (live), 1 replacement desk lamp.' },
  { from: 'Implant Support', subject: 'Firmware 9.4 rolled out', body: 'Your cortical implant has been updated. You may experience lost time, a metallic taste, or a strong urge to walk downstairs. These are normal.' },
  { from: 'J. Abara', subject: 'something is wrong with floor 3', body: 'I swear the corridor was longer this morning. I counted the doors. There was an extra one. Do not tell my manager I sent this.' },
  { from: 'Marketing', subject: 'New slogan — feedback by EOD', body: '"We Make You Better." Legal flagged the previous one ("Give Us Everything") as too literal.' },
];
const DOCUMENTS = [
  { title: 'Expense report', body: 'Taxi, 34.00. Client dinner, 212.50. Candles (black, unscented, 40), 88.00. Approved by: [signature smudged].' },
  { title: 'Floor safety notice', body: 'In case of fire, use the stairs. In case of the other thing, stay at your desk and keep your eyes on your screen until it passes.' },
  { title: 'Meeting minutes', body: 'Attendees: 7. Agenda: Q3 targets, the sacrifice schedule, parking. Action items: parking to be discussed next quarter.' },
  { title: 'Performance review', body: 'Meets expectations. Punctual. Asks too many questions about the basement. Recommend reassignment to Below.' },
  { title: 'Clinical trial consent form', body: 'I agree to the procedure. I understand that what is removed will not be returned. I understand that I may hear it afterwards.' },
  { title: 'Implant spec sheet', body: 'Model SERAPH-3 ocular graft. Night vision, threat overlay, 0.4% chance per year of seeing things that are there.' },
  { title: 'Inventory list', body: 'Staplers 14. Desk fans 6. Specimen jars (full) 22. Specimen jars (full, labelled DO NOT FEED) 3.' },
  { title: 'Handwritten note', body: 'If you are reading this, the lift does not go where the buttons say. Take the stairs. Count them. If you count more than 200, go back up.' },
  { title: 'Org chart', body: 'Everyone reports up to the Board. The Board reports to a box drawn in red at the top of the page with no name in it.' },
  { title: 'Sticky note', body: 'Password: ••••••••. Do NOT write the password on a sticky note — Security' },
];
const EMPTY_FINDS = ['Dust, paperclips and a dried-out pen.', 'Empty folders. Someone has removed every page.', 'A stale sandwich and a stress ball shaped like a heart. A real one.'];
