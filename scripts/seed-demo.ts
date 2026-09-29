/**
 * Fill a data source with made-up demo people — for trying the app and for
 * testing it at a realistic size. Everything is invented (555 phone numbers,
 * example.com addresses) and the same seed always makes the same people.
 *
 *   npm run seed                      # 250 people into the data source in config.json
 *   npm run seed -- --people 1000     # more
 *   npm run seed -- --no-photos       # skip the generated portrait photos
 *   npm run seed -- --force           # allow it even if the data source already has people
 *   PM_CONFIG=/tmp/x/config.json npm run seed   # into a scratch setup instead
 *
 * It refuses to touch a data source that already has people unless --force is
 * given, so it can't mix invented people into your real ones by accident.
 */
import zlib from "node:zlib";
import { Config } from "../server/src/config.js";
import { Service } from "../server/src/service.js";

const args = process.argv.slice(2);
const flag = (n: string) => args.includes(`--${n}`);
const num = (n: string, d: number) => { const i = args.indexOf(`--${n}`); return i >= 0 ? Number(args[i + 1]) || d : d; };
const COUNT = num("people", 250);
const PHOTOS = !flag("no-photos");

// ---------------------------------------------------------------- a seeded random
let seed = num("seed", 20260929);
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const chance = (p: number) => rnd() < p;
const some = <T>(a: T[], min: number, max: number): T[] => { const n = min + Math.floor(rnd() * (max - min + 1)); const c = [...a]; const out: T[] = []; while (out.length < n && c.length) out.push(c.splice(Math.floor(rnd() * c.length), 1)[0]); return out; };

const FIRST = ["Susan", "Mark", "Priya", "Tomás", "Elena", "Jordan", "Amir", "Grace", "Wei", "Kofi", "Ruth", "Dana", "Marcus", "Aisha", "Liam", "Sofia", "Noah", "Hannah", "Diego", "Mei", "Olivia", "Ethan", "Zoë", "Rafael", "Ingrid", "Sam", "Nadia", "Owen", "Leila", "Carlos", "Fatima", "Ben", "Chloé", "Hiroshi", "Ana", "Victor", "Julia", "Kwame", "Rosa", "Andrés", "Emily", "Tariq", "Yuki", "Isabel", "Patrick", "Amara", "Luca", "Beatriz", "Omar", "Claire"];
const LAST = ["Park", "Jones", "Natarajan", "Álvarez", "Ruiz", "Blake", "Haddad", "Adeyemi", "Chen", "Mensah", "Okafor", "Whitfield", "Reyes", "Khan", "O'Brien", "Rossi", "Nguyen", "Schmidt", "García", "Tanaka", "Müller", "Dubois", "Kowalski", "Silva", "Hughes", "Patel", "Andersson", "Moreau", "Novak", "Hassan", "Bennett", "Lindqvist", "Costa", "Ibrahim", "Walsh", "Fischer"];
const NICK: Record<string, string[]> = { Susan: ["Sue"], Tomás: ["Tom"], Elena: ["Lena"], Marcus: ["Marc"], Olivia: ["Liv"], Samuel: ["Sam"], Patrick: ["Pat"], Isabel: ["Izzy"], Victor: ["Vic"], Mark: ["MJ", "Marky"] };
const CATS: Record<string, [string[], string[]]> = {
  Healthcare: [["Dentist", "Orthopedic surgeon", "Pediatrician", "Physical therapist", "Clinic manager"], ["Practice owner", "Chief of staff", "Partner", "Director"]],
  Legal: [["Real-estate attorney", "Litigator", "Paralegal", "Patent attorney"], ["Partner", "Associate", "General counsel"]],
  Finance: [["Accountant", "Financial planner", "Banker", "Controller"], ["CFO", "VP Finance", "Senior analyst", "CPA"]],
  Marketing: [["Brand strategist", "Content lead", "Growth marketer"], ["VP Marketing", "CMO", "Marketing director"]],
  Technology: [["Software engineer", "Sales engineer", "Product manager", "Data scientist"], ["CTO", "Founder & CEO", "Engineering manager", "Senior engineer"]],
  "Real estate": [["Realtor", "Property manager", "Developer"], ["Broker", "Owner", "Principal"]],
  Insurance: [["Insurance broker", "Underwriter"], ["Agency owner", "Senior broker"]],
  Nonprofit: [["Program director", "Fundraiser"], ["Executive director", "Board member"]],
};
const COMPANIES = ["Ridgeline Logistics", "Lumen Analytics", "Cobalt Systems", "Brightline", "Harbor Robotics", "Northwind Ventures", "Park Family Dental", "Summit Legal", "Oakwood Partners", "Bluebonnet Realty", "Pecan Street Insurance", "Lakeside Clinic", "Granite Bank", "Juniper Health", "Copperleaf Media"];
const PLACES = ["Portland, Oregon", "Tulsa, Oklahoma", "Austin, Texas", "Chicago, Illinois", "Lagos, Nigeria", "Madrid, Spain", "Seoul, South Korea", "Denver, Colorado", "Toronto, Canada", "Boston, Massachusetts", "Monterrey, Mexico", "Dublin, Ireland", "Round Rock, Texas", "Nashville, Tennessee"];
const EVENTS = ["the Round Rock Chamber lunch", "Austin Tech Summit 2026", "a BNI Thursday breakfast", "the school fundraiser", "a friend's wedding", "SXSW", "the dental association mixer", "a LinkedIn introduction", "the neighborhood block party", "a client dinner", "the golf scramble", "the airport lounge in Denver"];
const LOOKS = ["Tall, short silver hair, tortoiseshell glasses.", "Curly red hair, always in a denim jacket.", "Very tall, shaved head, big laugh.", "Wears bright scarves; speaks quickly.", "Short, grey beard, quiet until you ask about fishing.", "Runner's build, usually in a fleece vest.", "Dark bob, round glasses, carries a green notebook.", "Warm, direct; likes numbers before stories."];
const FACTS = ["Prefers a text over email", "Daughter starts college this fall", "Allergic to shellfish — remember at dinners", "Just ran the Boston marathon", "Considering a second office", "Big Astros fan", "Vegetarian", "Going on sabbatical in the spring", "Introduced us to three clients", "Hates phone calls before 10am", "Fluent in Spanish and Portuguese", "Learning to fly small planes"];
const NOTES = ["Asked about Q4 availability. Follow up after Oct 10.", "Coffee at Summer Moon. Comparing two vendors; wants a cost side-by-side.", "Sent a birthday card.", "Introduced to Amir — they are now referring to each other.", "Great conversation about hiring. Send the article on onboarding: https://example.com/onboarding", "Moving offices in January — new address to come.", "Mentioned their kid plays travel soccer.", "Wants a proposal by end of month.", "Met briefly; exchanged cards.", "Quiet on email lately; try a call."];
const TAGS = ["golf", "referral-source", "chamber-lunch", "vip", "atx-summit", "board", "speaker", "investor", "startup", "neighbor", "school", "bni", "dental", "follow-up", "holiday-card"];
const KIDS = ["None", "1 (Mia, 18)", "2 (Owen 14, Ava 11)", "3", "Grown kids", ""];
const PETS = ["Dog — Biscuit", "Two cats", "None", "A very old parrot", ""];

/** A small PNG portrait: a head-and-shoulders silhouette on a coloured ground. */
function portrait(hue: number): Buffer {
  const W = 320; const raw = Buffer.alloc((W * 3 + 1) * W);
  const hsl = (h: number, s: number, l: number) => { const k = (n: number) => (n + h / 30) % 12; const a = s * Math.min(l, 1 - l); const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)); };
  const bg = hsl(hue, 0.35, 0.82), fg = hsl(hue, 0.3, 0.55), shade = hsl(hue, 0.3, 0.5);
  for (let y = 0; y < W; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const head = (x - 160) ** 2 + (y - 128) ** 2 < 58 ** 2;
      const body = y > 205 && ((x - 160) / 125) ** 2 + ((y - 330) / 125) ** 2 < 1;
      const c = head ? fg : body ? shade : bg;
      const o = y * (W * 3 + 1) + 1 + x * 3; raw[o] = c[0]; raw[o + 1] = c[1]; raw[o + 2] = c[2];
    }
  }
  const crc = (b: Buffer) => { let c = ~0; for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return ~c >>> 0; };
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const pad = (n: number) => String(n).padStart(2, "0");
const date = (y0: number, y1: number) => `${y0 + Math.floor(rnd() * (y1 - y0 + 1))}-${pad(1 + Math.floor(rnd() * 12))}-${pad(1 + Math.floor(rnd() * 28))}`;

async function main() {
  const config = new Config();
  const svc = new Service(config);
  await svc.useConfiguredSource();
  const st = await svc.store.status();
  if (!st.ok) throw new Error(`The data source is not ready: ${st.message}`);
  if ((st.counts?.people ?? 0) > 0 && !flag("force")) throw new Error(`The data source already has ${st.counts!.people} people. Use --force to add demo people anyway (it will not delete anything).`);

  const t0 = Date.now();
  const fieldId = async (name: string, type: "text" | "boolean" | "paragraph") => (await svc.listFields()).find((f) => f.name === name)?.id ?? (await svc.createField({ name, type })).id;
  const golf = await fieldId("Golf handicap", "text");
  const news = await fieldId("Newsletter subscriber", "boolean");
  const coffee = await fieldId("Coffee order", "text");
  const gifts = await fieldId("Gift ideas", "paragraph");

  // tabs → directories (three levels deep in places)
  const tree: Record<string, [string, string, [string, string][]][]> = {
    Clients: [["Active clients", "Paying clients and current engagements", [["Healthcare", "Clinics and practices"], ["Law firms", ""], ["Tech companies", "SaaS and hardware"]]],
      ["Prospects", "Warm leads from 2026 events", [["Austin Tech Summit 2026", "Met September 18–19"], ["Chamber referrals", "Introduced at the Chamber"]]],
      ["Past clients", "Finished engagements — keep in touch", []]],
    Networking: [["Round Rock Chamber", "Monthly lunch, second Tuesday", [["Board", "The Chamber board"]]], ["BNI Thursday group", "Weekly breakfast", []], ["Conferences", "", [["SXSW", "March"], ["Dental association", "Annual meeting"]]]],
    Personal: [["Neighbors", "Maple Court", []], ["School parents", "Lincoln Elementary", [["Soccer team", "U12 travel team"]]], ["Old friends", "", []]],
    Vendors: [],
  };
  const places: { tabId: string; dirId: string | null }[] = [];
  for (const [tabName, dirs] of Object.entries(tree)) {
    const tab = (await svc.listTabs()).find((t) => t.name === tabName) ?? await svc.createTab(tabName);
    if (tabName !== "Vendors") places.push({ tabId: tab.id, dirId: null });
    for (const [name, desc, kids] of dirs) {
      const d = await svc.createDirectory({ tabId: tab.id, name, description: desc });
      places.push({ tabId: tab.id, dirId: d.id });
      for (const [kName, kDesc] of kids) {
        const k = await svc.createDirectory({ tabId: tab.id, parentId: d.id, name: kName, description: kDesc });
        places.push({ tabId: tab.id, dirId: k.id }, { tabId: tab.id, dirId: k.id });
      }
    }
  }

  let photos = 0;
  for (let i = 0; i < COUNT; i++) {
    const at = pick(places);
    // a few deliberate same-name people, like three different Mark Joneses
    const first = i < 3 ? "Mark" : pick(FIRST);
    const last = i < 3 ? "Jones" : chance(0.92) ? pick(LAST) : "";
    const [cat, [professions, titles]] = pick(Object.entries(CATS));
    const company = pick(COMPANIES);
    const title = pick(titles);
    const event = pick(EVENTS);
    const met = date(2019, 2026);
    const email = `${first.normalize("NFD").replace(/[^\w]/g, "").toLowerCase()}.${(last || "x").normalize("NFD").replace(/[^\w]/g, "").toLowerCase()}@${company.toLowerCase().replace(/[^a-z]/g, "")}.example`;
    const p = await svc.createPerson({
      tabId: at.tabId, directoryId: at.dirId,
      firstName: first, lastName: last, nickname: chance(0.25) ? pick(NICK[first] ?? [""]) : "",
      description: `${title}, ${company}${chance(0.5) ? ` · met at ${event}` : ""}`,
      title, profession: pick(professions), businessCategory: cat, ageRange: pick(["20s", "30s", "40s", "50s", "60s", "70s"]),
      maritalStatus: chance(0.7) ? pick(["Single", "Married", "In a relationship", "Divorced", "Widowed"]) : "", kids: pick(KIDS), pets: pick(PETS),
      familyNotes: chance(0.2) ? "Spouse works in education; big family gatherings at Thanksgiving." : "",
      birthday: chance(0.6) ? (chance(0.5) ? date(1950, 2000) : date(2000, 2000).slice(5)) : "",
      dateMet: met, fromPlace: pick(PLACES),
      howMet: `Met at ${event} in ${met.slice(0, 4)}. ${pick(["We talked about hiring.", "They asked about our services.", "Sat at the same table.", "Introduced by a mutual friend.", "Bumped into each other at the coffee line."])}`,
      generalDescription: pick(LOOKS),
      businessWebsite: chance(0.6) ? `${company.toLowerCase().replace(/[^a-z]/g, "")}.example` : "",
      businessDescription: chance(0.4) ? `${cat} company, about ${10 + Math.floor(rnd() * 400)} people.` : "",
      keyFacts: some(FACTS, 0, 3),
      contacts: [
        { kind: "phone", label: "Mobile", value: `(512) 555-${String(100 + i).padStart(4, "0")}` },
        ...(chance(0.5) ? [{ kind: "phone" as const, label: "Office", value: `(512) 555-${String(2000 + i).padStart(4, "0")}` }] : []),
        { kind: "email", label: "Work", value: email },
        ...(chance(0.3) ? [{ kind: "address" as const, label: "Office", value: `${100 + Math.floor(rnd() * 9000)} Main St\nRound Rock, TX 78664` }] : []),
      ],
      links: [
        ...(chance(0.7) ? [{ label: "LinkedIn", url: `linkedin.example/in/${email.split("@")[0]}` }] : []),
        ...(chance(0.25) ? [{ label: "Instagram", url: `instagram.example/${email.split("@")[0]}` }] : []),
      ],
      tags: some(TAGS, 0, 3),
      custom: { ...(chance(0.3) ? { [golf]: String(Math.floor(rnd() * 30)) } : {}), ...(chance(0.5) ? { [news]: chance(0.6) ? "true" : "false" } : {}),
        ...(chance(0.25) ? { [coffee]: pick(["Oat latte", "Black coffee", "Cortado", "Green tea"]) } : {}), ...(chance(0.15) ? { [gifts]: "Likes local bourbon and fly-fishing books." } : {}) },
    });
    for (const n of some(NOTES, 0, 4)) await svc.addNote(p.id, n);
    if (PHOTOS && chance(0.45)) {
      const hue = Math.floor(rnd() * 360);
      for (let k = 0, n = 1 + Math.floor(rnd() * 3); k < n; k++) { await svc.addPhoto(p.id, { buffer: portrait((hue + k * 40) % 360), originalname: `${first} ${last} ${k + 1}.png`, mimetype: "image/png" }); photos++; }
    }
    if ((i + 1) % 50 === 0) process.stdout.write(`  ${i + 1} people…\n`);
  }
  const done = await svc.store.status();
  console.log(`Demo data ready in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${done.counts?.people} people, ${done.counts?.directories} directories, ${done.counts?.tabs} tabs, ${photos} photos (${config.get().dataSource.type}).`);
  await svc.store.close();
}

main().catch((e) => { console.error(`Could not add demo data: ${e.message}`); process.exitCode = 1; });
