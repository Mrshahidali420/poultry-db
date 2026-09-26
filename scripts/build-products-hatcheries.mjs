// One-off generator for data/products.json, data/product-categories.json, data/hatcheries.json
// Run: node scripts/build-products-hatcheries.mjs
import { writeFileSync } from "node:fs";

const PRICE_CHECKED = "2026-09-26";
const amzSearch = (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`;

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------
const categories = [
  {
    id: "coops",
    title: "Chicken Coops",
    buyer_guide_points: [
      "Budget 2-4 square feet of coop floor per standard-size hen, more for large breeds",
      "Look for a hinged roof or side panel so you can actually reach the far corners to clean",
      "Predator-proofing matters more than looks: hardware cloth over vents, secure latches, no gaps over 0.5 inch",
      "Roosting bars should sit higher than nest boxes so hens sleep on the bars, not in the boxes",
      "Ventilation near the roofline (not at floor level, to avoid drafts) prevents ammonia buildup and frostbite",
      "Wood needs yearly maintenance and repainting; plastic/resin coops cost more but need almost none",
      "Check if the coop ships fully assembled or flat-packed, and how many people it takes to build",
    ],
    search_phrase: "best chicken coop for 6 chickens",
  },
  {
    id: "runs",
    title: "Chicken Runs",
    buyer_guide_points: [
      "Aim for at least 8-10 square feet of run per hen on top of the coop itself",
      "Cover the run, not just the sides: hawks attack from above",
      "Welded wire holds up to raccoons far better than chicken wire, which mainly stops the chickens, not predators",
      "A run with a buried or apron-skirted bottom edge stops digging predators",
      "Portable/collapsible runs are easiest to move onto fresh grass but blow around in wind unless staked down",
      "Tarp or clear panel roof options let snow and rain shed instead of pooling on flat wire tops",
    ],
    search_phrase: "predator proof chicken run",
  },
  {
    id: "feeders",
    title: "Chicken Feeders",
    buyer_guide_points: [
      "Gravity feeders are cheapest and simplest but let feed sit exposed to rain and rodents",
      "Treadle feeders close when hens step off, which cuts rodent and wild-bird access dramatically",
      "PVC pipe feeders are a low-cost DIY option and resist tipping better than open pans",
      "Size feeder capacity to how often you want to refill: a 4-6 hen flock usually needs a 5-12 lb capacity feeder",
      "Metal feeders resist chewing and UV breakdown better than plastic over multiple seasons",
      "Treadle feeders need chicks to be trained onto the pedal and are not ideal for very small bantams",
    ],
    search_phrase: "best treadle chicken feeder",
  },
  {
    id: "waterers",
    title: "Chicken Waterers",
    buyer_guide_points: [
      "Nipple waterers keep water cleanest since birds can't stand or defecate in the water source",
      "Cup waterers are easier for chicks to learn but need daily cleaning of the cup",
      "In freezing climates, a heated waterer or a heated base under a standard fount avoids daily ice-breaking",
      "Match nipple height to your shortest bird and adjust as chicks grow",
      "Gravity founts should be elevated slightly above litter level to keep bedding and droppings out",
      "Check flow rate in cold weather: some nipples clog before they fully freeze",
    ],
    search_phrase: "best chicken waterer for winter",
  },
  {
    id: "heated-base-deicer",
    title: "Heated Bases and De-Icers",
    buyer_guide_points: [
      "A heated base under an existing plastic fount is cheaper than buying a whole new heated waterer",
      "Look for thermostatically controlled bases that only draw power below about 40°F",
      "Check the base's wattage against your coop's extension cord and outlet capacity",
      "Cord should be chew-resistant or run through conduit; chickens and rodents both go after cords",
      "Confirm the base's diameter matches the waterer or bucket you already own",
    ],
    search_phrase: "heated chicken waterer base",
  },
  {
    id: "brooder-heat-plate",
    title: "Brooder Heat Plates",
    buyer_guide_points: [
      "Radiant heat plates are safer than heat lamps because there's no exposed bulb or open flame risk",
      "Adjustable-height plates let you raise the plate as chicks grow instead of buying a new unit",
      "Chicks should be able to walk under the plate and stand up without touching it",
      "Size the plate to your chick count; overcrowding under an undersized plate causes pile-ups",
      "Plates draw far less power than a 250W heat lamp, which matters for extension cord safety",
    ],
    search_phrase: "chick brooder heat plate",
  },
  {
    id: "heat-lamp",
    title: "Heat Lamps",
    buyer_guide_points: [
      "Heat lamps are the single most common cause of coop and brooder fires; a radiant heat plate is safer where practical",
      "If using a lamp, always use a ceramic socket, a metal guard/dome, and a secondary safety chain or clamp, never just the clamp",
      "Never hang a lamp directly over dry bedding, wood shavings, or cardboard without a solid heat gap",
      "Red bulbs reduce pecking behavior compared with bright white bulbs",
      "Check the bulb wattage against the brooder size; 250W is overkill for a small indoor brooder",
    ],
    search_phrase: "chicken coop heat lamp safety",
  },
  {
    id: "brooders-starter-kits",
    title: "Brooders and Chick Starter Kits",
    buyer_guide_points: [
      "A brooder needs draft-free sides at least 12-18 inches tall as chicks start test-flying at a few weeks old",
      "Starter kits bundling a heat source, feeder, and waterer save first-time keepers from guessing at sizing",
      "Solid (not wire) flooring under bedding prevents leg injuries in very young chicks",
      "Plan for at least 0.5 square feet per chick at first, doubling by 4 weeks old",
      "Clear or mesh lids/covers keep curious pets and older birds out of a young brooder",
    ],
    search_phrase: "chick brooder starter kit",
  },
  {
    id: "incubators",
    title: "Egg Incubators",
    buyer_guide_points: [
      "Still-air incubators are cheaper but need more manual temperature and turning attention",
      "Forced-air (fan-circulated) incubators hold temperature far more evenly across all eggs",
      "Automatic egg turners save you from turning eggs by hand 3-5 times a day for 18 days",
      "Match capacity to your actual hatching plans; small hobby incubators run 3-12 eggs, cabinet models 40+",
      "A clear lid or viewing window lets you monitor without opening and losing humidity",
      "Humidity control (manual water channels vs. digital humidity readout) affects hatch rate more than most buyers expect",
    ],
    search_phrase: "best egg incubator for beginners",
  },
  {
    id: "candlers",
    title: "Egg Candlers",
    buyer_guide_points: [
      "A bright, focused LED beam matters more than lumens on the spec sheet; diffuse light won't show veining",
      "Adjustable or cone-shaped heads seal out ambient light for a clearer view of dark or brown-shelled eggs",
      "Candling is easiest around day 7-10 for the first check and day 14-18 for a second check",
      "Brown and dark-shelled eggs need a stronger, more concentrated light than white eggs",
      "Battery-powered units are easiest to use right at the incubator instead of ferrying eggs to an outlet",
    ],
    search_phrase: "egg candler for hatching eggs",
  },
  {
    id: "egg-cartons",
    title: "Egg Cartons",
    buyer_guide_points: [
      "Pulp (molded fiber) cartons are compostable and the standard choice for farm-stand sales",
      "Clear plastic (PET) cartons show off egg color and size, popular for farmers market displays",
      "Blank cartons let you add your own farm-name stamp or sticker without reprinting",
      "Check state cottage-food and egg-labeling rules before selling eggs in any carton to the public",
      "Buy jumbo or duck-size cartons separately if your birds lay larger eggs than standard",
    ],
    search_phrase: "blank egg cartons for farm sales",
  },
  {
    id: "egg-skelter",
    title: "Egg Skelters and Countertop Storage",
    buyer_guide_points: [
      "A skelter rotates stock automatically: new eggs go in the top, oldest come out the bottom",
      "Countertop storage only makes sense for unwashed, bloom-intact eggs; washed eggs need refrigeration",
      "Check stated capacity in eggs, not dozens, since spiral skelters vary a lot by model",
      "Metal skelters last longer and look better on a counter than most plastic holders",
      "A skelter is a nice-to-have organizer, not a substitute for knowing how old your eggs are",
    ],
    search_phrase: "egg skelter countertop storage",
  },
  {
    id: "nesting-boxes",
    title: "Nesting Boxes",
    buyer_guide_points: [
      "Plan on one nest box per 3-4 hens; more boxes than that just invite broodiness and mess",
      "12x12x12 inches is the standard interior size for a standard breed; bantams can go smaller, large breeds bigger",
      "A slightly recessed or lipped front keeps bedding and eggs from spilling out",
      "Dark, enclosed boxes get used more readily than open ones; hens want privacy to lay",
      "Removable or hinged lids make collecting eggs and cleaning much faster",
    ],
    search_phrase: "chicken nesting box plastic",
  },
  {
    id: "roll-away-nest-boxes",
    title: "Roll-Away Nesting Boxes",
    buyer_guide_points: [
      "A sloped floor lets the egg roll away from the hen into a protected collection tray, cutting down on breakage and egg-eating",
      "Roll-away boxes only work well once hens are already trained to use a standard nest box",
      "Check the collection tray is deep and padded enough to prevent cracked eggs on impact",
      "Best paired with an automatic coop door setup since they reduce the need for multiple daily collections",
      "External-access roll-away boxes let you collect eggs from outside the coop without disturbing the flock",
    ],
    search_phrase: "roll away chicken nesting box",
  },
  {
    id: "bedding",
    title: "Coop Bedding",
    buyer_guide_points: [
      "Pine shavings are the standard, affordable choice; never use cedar shavings, which are toxic to poultry",
      "Hemp bedding absorbs more moisture and dust than pine and composts faster",
      "Straw insulates well in winter but holds moisture and mats down faster than shavings",
      "Sand (the deep litter alternative) is easy to sift like a litter box but is heavy and holds cold in winter",
      "Whatever you choose, budget for 3-4 inches of depth and a full change every few weeks to control ammonia",
    ],
    search_phrase: "best chicken coop bedding",
  },
  {
    id: "grit",
    title: "Poultry Grit",
    buyer_guide_points: [
      "Grit is insoluble stone that sits in the gizzard to grind food; it is not the same thing as oyster shell calcium",
      "Free-ranging birds on gravelly ground may need little or no supplemental grit",
      "Chick-size (starter) grit and adult-size grit are not interchangeable; check the bag",
      "Offer grit free-choice in a separate dish rather than mixing it into feed",
      "Skip grit entirely if you only feed pelleted feed and birds never get scratch, whole grain, or forage",
    ],
    search_phrase: "chicken grit supplement",
  },
  {
    id: "oyster-shell",
    title: "Oyster Shell",
    buyer_guide_points: [
      "Crushed oyster shell is a calcium supplement for laying hens, not a substitute for grit",
      "Offer it free-choice in a separate dish; don't mix into layer feed, which is already balanced",
      "Only birds actively laying eggs need supplemental calcium; it can harm younger, non-laying birds' kidneys",
      "Particle size matters: too fine and it's ignored, too coarse and smaller breeds skip it",
      "Watch shell quality (thin or soft-shelled eggs) as the signal to add or increase oyster shell",
    ],
    search_phrase: "crushed oyster shell for chickens",
  },
  {
    id: "feed",
    title: "Chicken Feed",
    buyer_guide_points: [
      "Starter feed (18-20% protein) is for chicks 0-8 weeks; layer feed's added calcium can harm young kidneys",
      "Layer feed (16-18% protein, added calcium) is for hens already laying, generally from about 18-20 weeks",
      "Organic and non-GMO feed lines cost noticeably more per pound; decide if that matters for your goals",
      "Crumble is easier for young or small-beaked birds; pellets waste less and are easier to store",
      "Medicated starter feed (with amprolium) helps prevent coccidiosis in unvaccinated chicks; skip it if chicks were already vaccinated",
    ],
    search_phrase: "best layer feed for backyard chickens",
  },
  {
    id: "treats",
    title: "Chicken Treats",
    buyer_guide_points: [
      "Treats should stay under about 10% of a bird's total daily diet so they don't dilute complete feed nutrition",
      "Dried mealworms and black soldier fly larvae are both high-protein, popular, and easy to store",
      "Black soldier fly larvae have a better calcium-to-phosphorus ratio than mealworms, which is gentler on laying hens",
      "Scatter treats in bedding to encourage natural scratching behavior instead of just tossing in a pile",
      "Skip treats high in salt, sugar, or avocado, onion, and chocolate, all of which are unsafe for chickens",
    ],
    search_phrase: "dried mealworms for chickens",
  },
  {
    id: "dust-bath",
    title: "Dust Bath Supplies",
    buyer_guide_points: [
      "Dust bathing is a natural behavior chickens use to control mites, lice, and skin oil, not just play",
      "A mix of fine sand and wood ash or dry dirt works as well as commercial dust bath product for most flocks",
      "Food-grade diatomaceous earth is a popular additive but should be used dry and away from anyone's lungs, including yours",
      "Keep the dust bath area covered or under an overhang so rain doesn't turn it to mud",
      "A dedicated container (old tire, low tub, or built-in box) keeps the mix from spreading through the whole run",
    ],
    search_phrase: "chicken dust bath diatomaceous earth",
  },
  {
    id: "poultry-netting-electric-fence",
    title: "Poultry Netting and Electric Fencing",
    buyer_guide_points: [
      "Electrified poultry netting is the standard way to give a flock fresh range daily while keeping most predators out",
      "Check the horizontal spacing near the ground; keeps small chicks in and stops digging predators",
      "A dedicated low-impedance energizer sized to the total fence length is critical; underpowered fences train predators that it's safe to push through",
      "Netting needs regular grass trimming underneath, since contact with vegetation drains the charge",
      "Bright or double-spiked posts make the netting easier to see and keep upright on uneven ground",
    ],
    search_phrase: "electric poultry netting fence",
  },
  {
    id: "predator-proof-latch",
    title: "Predator-Proof Latches",
    buyer_guide_points: [
      "Standard slide bolts and hook-and-eye latches are easily opened by raccoon paws; look for latches needing two motions",
      "Carabiners or spring-loaded snaps added to existing latches are the cheapest predator-proofing upgrade",
      "Check latch material for rust resistance if the coop door faces weather",
      "Test any new latch yourself at raccoon height before trusting it overnight",
      "Pair latches with hardware-cloth-covered gaps; a good latch on a weak door frame won't help",
    ],
    search_phrase: "raccoon proof chicken coop latch",
  },
  {
    id: "automatic-coop-door",
    title: "Automatic Coop Doors",
    buyer_guide_points: [
      "Automatic doors run on a light-sensor, timer, or both; timer-only units need manual seasonal adjustment",
      "Battery life matters if the coop has no outlet nearby; look for low-power draw and battery-level warnings",
      "Check maximum door size and weight rating against your coop's existing door opening",
      "An anti-crush safety stop (or a door that reverses on obstruction) prevents trapping a slow bird",
      "Weatherproofing and a manual override switch matter if the motor housing sits outside the coop",
    ],
    search_phrase: "automatic chicken coop door",
  },
  {
    id: "first-aid",
    title: "Poultry First Aid",
    buyer_guide_points: [
      "A basic kit covers a wound spray, electrolytes, and a way to isolate an injured or sick bird",
      "Vetericyn-type wound sprays are non-stinging and safe without a prescription for minor cuts and pecking wounds",
      "Poultry electrolyte and vitamin powders help birds recovering from heat stress, shipping stress, or illness",
      "Keep a separate dog crate or tote on hand for isolating a sick or injured bird from the flock",
      "Know your nearest avian or livestock vet before an emergency, since many small-animal vets won't see poultry",
    ],
    search_phrase: "chicken first aid kit",
  },
  {
    id: "poultry-scale",
    title: "Poultry Scales",
    buyer_guide_points: [
      "A hanging sling or bag scale is the easiest way to weigh a live, wriggling bird",
      "Digital scales with a hold/lock function make reading the number easier once the bird stops moving",
      "Weight tracking helps catch illness early, since weight loss often shows before obvious symptoms",
      "Choose a capacity comfortably above your heaviest breed's adult weight, with some headroom",
      "A simple kitchen or luggage scale with a sling or basket works fine for small flocks; dedicated poultry scales just add a purpose-built harness",
    ],
    search_phrase: "hanging scale for weighing chickens",
  },
  {
    id: "egg-washer",
    title: "Egg Washers",
    buyer_guide_points: [
      "Washing is only necessary for visibly dirty eggs; clean eggs keep longer unwashed thanks to the natural bloom coating",
      "Water for washing should be warmer than the egg, never colder, to avoid drawing contaminants through the shell",
      "Small brush-drum washers work well for flocks producing a few dozen eggs a day; larger flocks may want a motorized model",
      "Washed eggs lose the protective bloom and must be refrigerated, unlike unwashed eggs",
      "Sanitize the washer itself regularly since it handles dozens of eggs in a row",
    ],
    search_phrase: "egg washing machine for chicken eggs",
  },
];

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------
let productSeq = 0;
const products = [];

function addProduct(p) {
  productSeq += 1;
  const id = p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  products.push({
    id,
    name: p.name,
    brand: p.brand,
    category: p.category,
    subcategory: p.subcategory,
    amazon_asin: p.amazon_asin || null,
    amazon_url_search: amzSearch(p.searchTerm || `${p.brand} ${p.name}`),
    price_range_usd: p.price_range_usd,
    price_checked: PRICE_CHECKED,
    flock_size: p.flock_size || null,
    key_specs: p.key_specs || {},
    pros: p.pros,
    cons: p.cons,
    who_its_for: p.who_its_for,
    sources: p.sources,
  });
}

// ---- Coops ----
addProduct({ name: "Pre-Fab Chicken Coop", brand: "Petmate", category: "coops", subcategory: "small", price_range_usd: "$180-$260", flock_size: { min: 2, max: 4 }, key_specs: { material: "resin/plastic", nest_boxes: 2, roost_bars: 1 }, pros: ["Resin never needs painting or sealing", "Lightweight enough for one person to move", "Easy-clean removable tray"], cons: ["Small floor space limits it to a true starter flock", "Not built for harsh winter climates without added insulation"], who_its_for: "A first-time keeper with 2-4 standard hens in a mild climate.", sources: [{ name: "Petmate", url: "https://www.petmate.com/" }] });
addProduct({ name: "Home Sweet Home Chicken Coop", brand: "Ware Manufacturing", category: "coops", subcategory: "small", price_range_usd: "$220-$320", flock_size: { min: 2, max: 4 }, key_specs: { material: "wood", nest_boxes: 1, roof: "asphalt shingle" }, pros: ["Real wood look at a budget price", "Elevated design keeps birds off cold, damp ground"], cons: ["Thin wood needs yearly weatherproofing", "Ramp and door hardware are on the flimsy side"], who_its_for: "Backyard keepers who want a traditional wood coop look on a budget.", sources: [{ name: "Ware Pet Products", url: "https://www.warepet.com/" }] });
addProduct({ name: "AIR26 Wooden Chicken Coop", brand: "Aivituvin", category: "coops", subcategory: "small", price_range_usd: "$180-$250", flock_size: { min: 2, max: 4 }, key_specs: { material: "fir wood", nest_boxes: 2, run_included: true }, pros: ["Attached small run included in the price", "Pull-out tray makes cleaning quick"], cons: ["Assembly instructions are often reported as unclear", "Wood needs annual sealant to hold up outdoors"], who_its_for: "Small-yard keepers who want coop and run in one box.", sources: [{ name: "Aivituvin", url: "https://www.aivituvin.com/" }] });
addProduct({ name: "Sonoma Chicken Coop", brand: "Producer's Pride", category: "coops", subcategory: "medium", price_range_usd: "$500-$650", flock_size: { min: 4, max: 8 }, key_specs: { material: "wood", nest_boxes: 3, run_included: true }, pros: ["Sold and stocked at Tractor Supply stores nationwide", "Roomy run plus enclosed coop in one structure"], cons: ["Heavy and time-consuming to assemble, often a two-person job", "Roofing material is thin and benefits from an upgrade"], who_its_for: "A mid-size backyard flock owner shopping in-store rather than only online.", sources: [{ name: "Tractor Supply Co.", url: "https://www.tractorsupply.com/" }] });
addProduct({ name: "AIR56 Wooden Chicken Coop", brand: "Aivituvin", category: "coops", subcategory: "medium", price_range_usd: "$380-$470", flock_size: { min: 4, max: 8 }, key_specs: { material: "fir wood", nest_boxes: 3, roost_bars: 2 }, pros: ["Good ventilation panels near the roofline", "Larger run footprint than most boxed coops in this price range"], cons: ["Roofing shingles are cosmetic, not a true waterproof layer, over time", "Latch hardware benefits from an aftermarket predator-proof upgrade"], who_its_for: "Keepers scaling from a starter flock to 6-8 hens.", sources: [{ name: "Aivituvin", url: "https://www.aivituvin.com/" }] });
addProduct({ name: "Big Setup Chicken Coop", brand: "Best Choice Products", category: "coops", subcategory: "medium", price_range_usd: "$300-$420", flock_size: { min: 4, max: 8 }, key_specs: { material: "fir wood", nest_boxes: 2, run_included: true }, pros: ["Competitive price for the combined coop-and-run footprint", "Removable bottom tray for easier waste cleanup"], cons: ["Wood thickness is on the thinner side compared with premium brands", "Predator-proofing on stock latches is minimal out of the box"], who_its_for: "Budget-focused buyers wanting a coop-and-run combo shipped to the door.", sources: [{ name: "Best Choice Products", url: "https://www.bestchoiceproducts.com/" }] });
addProduct({ name: "Large Chicken Coop", brand: "Little Cottage Co.", category: "coops", subcategory: "large", price_range_usd: "$1,200-$2,000", flock_size: { min: 8, max: 15 }, key_specs: { material: "solid wood", nest_boxes: 4, roost_bars: 3 }, pros: ["Amish-built solid wood construction holds up for years", "Large windows and vents keep airflow strong in summer"], cons: ["High price point compared with big-box coops", "Heavy; typically needs delivery or a truck, not just home shipping"], who_its_for: "Established keepers with 8+ birds wanting a coop built to last a decade or more.", sources: [{ name: "Little Cottage Co.", url: "https://www.littlecottage.com/" }] });
addProduct({ name: "OverEZ Large Chicken Coop", brand: "OverEZ", category: "coops", subcategory: "large", price_range_usd: "$1,400-$1,700", flock_size: { min: 8, max: 12 }, key_specs: { material: "engineered wood panels", nest_boxes: 4, tool_free_assembly: true }, pros: ["Panelized, mostly tool-free assembly is faster than stick-built coops", "Elevated floor design keeps birds dry and reduces rodent burrowing"], cons: ["Premium price relative to floor space", "Panels can warp if not sealed promptly after assembly"], who_its_for: "Keepers who want a large coop without hiring a carpenter.", sources: [{ name: "OverEZ", url: "https://overez.com/" }] });
addProduct({ name: "Snap Lock Chicken Coop", brand: "Formex", category: "coops", subcategory: "large", price_range_usd: "$1,300-$1,600", flock_size: { min: 8, max: 12 }, key_specs: { material: "recycled plastic panels", nest_boxes: 4 }, pros: ["Plastic panels never rot, need no repainting", "Snap-together assembly with no power tools required"], cons: ["Higher upfront cost than an equivalent wood coop", "Plastic can get warm inside in full sun without added ventilation"], who_its_for: "Keepers in humid or rainy climates who want a maintenance-free large coop.", sources: [{ name: "Formex", url: "https://formex.com/" }] });
addProduct({ name: "Walk-In Chicken Coop", brand: "OverEZ", category: "coops", subcategory: "walk-in", price_range_usd: "$1,800-$2,400", flock_size: { min: 10, max: 20 }, key_specs: { material: "engineered wood panels", human_door_height: "6 ft", nest_boxes: 6 }, pros: ["Full standing-height interior makes daily chores far easier", "Panelized build ships flat and assembles without a crew"], cons: ["Large footprint needs real yard space to install", "One of the pricier coop options on this list"], who_its_for: "Keepers with larger flocks who are tired of stooping to clean a coop.", sources: [{ name: "OverEZ", url: "https://overez.com/" }] });
addProduct({ name: "Carolina Coops Walk-In Coop", brand: "Carolina Coops", category: "coops", subcategory: "walk-in", price_range_usd: "$3,000-$6,000+", flock_size: { min: 10, max: 30 }, key_specs: { material: "cedar/pine, custom", human_door_height: "6-7 ft" }, pros: ["Fully custom sizing and add-ons (windows, runs, cupolas)", "High-end build quality intended to last decades"], cons: ["Long lead times since each coop is built to order", "Premium pricing puts it out of reach for casual keepers"], who_its_for: "Serious hobbyists or small farms wanting a custom, permanent structure.", sources: [{ name: "Carolina Coops", url: "https://carolinacoops.com/" }] });
addProduct({ name: "A-Frame Chicken Tractor", brand: "Carolina Coops", category: "coops", subcategory: "chicken tractor", price_range_usd: "$700-$1,400", flock_size: { min: 4, max: 10 }, key_specs: { material: "wood frame, wire", wheels: true }, pros: ["Classic A-frame design is lightweight relative to its size", "Wheel kit lets one person reposition it over fresh grass"], cons: ["Interior headroom is limited compared with a stationary coop", "Not ideal as a sole permanent home in cold climates"], who_its_for: "Rotational graziers who want to move the flock across pasture regularly.", sources: [{ name: "Carolina Coops", url: "https://carolinacoops.com/" }] });
addProduct({ name: "Chicken Tractor Coop and Run", brand: "PawHut", category: "coops", subcategory: "chicken tractor", price_range_usd: "$180-$260", flock_size: { min: 2, max: 5 }, key_specs: { material: "fir wood", wheels: true }, pros: ["Budget entry point into mobile chicken tractors", "Small enough for one person to drag short distances"], cons: ["Thin materials wear faster than heavier-duty tractors", "Limited interior space for larger breeds"], who_its_for: "Small suburban flocks that need to rotate across a modest lawn.", sources: [{ name: "PawHut", url: "https://www.aosom.com/pawhut" }] });

// ---- Runs ----
addProduct({ name: "Walk-In Chicken Run", brand: "VEVOR", category: "runs", subcategory: "walk-in run", price_range_usd: "$150-$300", key_specs: { material: "galvanized steel, wire mesh", coverage: "tarp roof panel" }, pros: ["Large footprint options up to 20+ feet long", "Steel frame is sturdier than PVC-frame competitors"], cons: ["Assembly with many wire panels takes real time", "Ground-level wire alone won't stop a determined digger without an apron"], who_its_for: "Keepers who want a big, walk-in secure run without building one from scratch.", sources: [{ name: "VEVOR", url: "https://www.vevor.com/" }] });
addProduct({ name: "Chicken Run Extension", brand: "Omlet", category: "runs", subcategory: "walk-in run", price_range_usd: "$300-$900", key_specs: { material: "powder-coated steel mesh", modular: true }, pros: ["Modular panels connect directly to Omlet coops for a sealed system", "Anti-tunnel skirt is included standard, not an add-on"], cons: ["Premium price point compared with generic run kits", "Best value only if paired with a matching Omlet coop"], who_its_for: "Omlet coop owners wanting a matched, predator-resistant run.", sources: [{ name: "Omlet", url: "https://www.omlet.us/" }] });
addProduct({ name: "Portable Chicken Run", brand: "PawHut", category: "runs", subcategory: "portable run", price_range_usd: "$70-$140", key_specs: { material: "wire mesh, wood or metal frame", foldable: true }, pros: ["Light enough to move daily for fresh grass", "Low price makes it an easy add-on purchase"], cons: ["Blows over in wind without staking", "Wire gauge is thin, more of a fence than a predator barrier"], who_its_for: "Small flocks needing daytime pasture access next to a fixed coop.", sources: [{ name: "PawHut", url: "https://www.aosom.com/pawhut" }] });
addProduct({ name: "PoultryNet Plus Electric Fence", brand: "Premier1 Supplies", category: "runs", subcategory: "netting run", price_range_usd: "$180-$260", key_specs: { length: "164 ft", height: "42 in" }, pros: ["Tight horizontal spacing keeps chicks in and small predators out", "Double-spiked posts stay upright on uneven ground"], cons: ["Needs a dedicated energizer, sold separately", "Grass must be trimmed regularly under the netting to hold charge"], who_its_for: "Free-range keepers rotating flocks across open pasture.", sources: [{ name: "Premier1 Supplies", url: "https://www.premier1supplies.com/" }] });

// ---- Feeders ----
addProduct({ name: "Plastic Hanging Poultry Feeder", brand: "Little Giant", category: "feeders", subcategory: "gravity", price_range_usd: "$10-$25", key_specs: { capacity_lb: "5-20", material: "plastic" }, pros: ["Inexpensive and widely available", "Hanging design keeps feed cleaner than a ground pan"], cons: ["Feed is exposed to rain if not under cover", "Easy for wild birds and rodents to access"], who_its_for: "Anyone wanting the simplest, cheapest way to feed a small flock.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });
addProduct({ name: "Galvanized Hanging Poultry Feeder", brand: "Harris Farms", category: "feeders", subcategory: "gravity", price_range_usd: "$15-$35", key_specs: { capacity_lb: "10-40", material: "galvanized steel" }, pros: ["Metal resists chewing and holds up longer outdoors than plastic", "Wide range of sizes for small to large flocks"], cons: ["Heavier to lift and refill than plastic equivalents", "Still exposes feed to weather unless housed under a roof"], who_its_for: "Keepers who want a durable feeder that will survive years outdoors.", sources: [{ name: "Harris Farms", url: "https://www.harrisfarms.com/" }] });
addProduct({ name: "Automatic Treadle Chicken Feeder", brand: "Grandpa's Feeders", category: "feeders", subcategory: "treadle", price_range_usd: "$180-$260", key_specs: { capacity_lb: "20", weatherproof: true }, pros: ["Weatherproof lid keeps feed dry in rain and snow", "Closing lid blocks rodents and wild birds almost entirely"], cons: ["Higher upfront cost than a basic gravity feeder", "Chicks and very light bantams may need training to trigger the pedal"], who_its_for: "Keepers with a rodent problem who want to stop feeding pests along with chickens.", sources: [{ name: "Grandpa's Feeders", url: "https://grandpasfeeders.com/" }] });
addProduct({ name: "Treadle Chicken Feeder", brand: "RentACoop", category: "feeders", subcategory: "treadle", price_range_usd: "$90-$150", key_specs: { capacity_lb: "10-20", material: "metal/plastic hybrid" }, pros: ["More affordable entry point into treadle-style feeders", "Adjustable pedal tension for different bird weights"], cons: ["Smaller capacity than premium treadle feeders means more refills", "Some assembly and pedal adjustment required out of the box"], who_its_for: "Budget-conscious keepers who still want rodent-resistant feeding.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });
addProduct({ name: "PVC Pipe Poultry Feeder Kit", brand: "RentACoop", category: "feeders", subcategory: "PVC", price_range_usd: "$25-$45", key_specs: { material: "PVC fittings kit", diy_assembly: true }, pros: ["Very low cost per feeding station", "Simple to clean and hard to tip over once mounted"], cons: ["Requires basic assembly and mounting on your own pipe/post", "No weather cover; still needs to be placed under shelter"], who_its_for: "DIY-minded keepers building their own low-cost feed stations.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });
addProduct({ name: "No-Waste Poultry Feeder", brand: "Rite Farm Products", category: "feeders", subcategory: "gravity", price_range_usd: "$20-$40", key_specs: { capacity_lb: "9-20", material: "galvanized steel" }, pros: ["Lip design reduces feed being scratched out and wasted", "Sturdy galvanized build for the price"], cons: ["Still open to the elements without a roof overhead", "Not rodent-proof compared with a treadle design"], who_its_for: "Keepers wanting less wasted feed without paying treadle-feeder prices.", sources: [{ name: "Rite Farm Products", url: "https://ritefarmproducts.com/" }] });

// ---- Waterers ----
addProduct({ name: "Poultry Nipple Waterer Kit", brand: "RentACoop", category: "waterers", subcategory: "nipple", price_range_usd: "$12-$25", key_specs: { nipples: "5-10 pack", mounts_to: "bucket or PVC" }, pros: ["Keeps water far cleaner than an open fount", "Cheap enough to add nipples to any bucket you already own"], cons: ["Chicks need a short training period to learn to peck the nipple", "Can clog with sediment if the water source isn't filtered"], who_its_for: "Keepers wanting the cleanest possible water setup on a small budget.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });
addProduct({ name: "Poultry Nipple Drinker", brand: "Little Giant", category: "waterers", subcategory: "nipple", price_range_usd: "$8-$18", key_specs: { pack_size: "5-10", thread: "standard PVC/bucket" }, pros: ["Widely available and inexpensive", "Simple screw-in installation"], cons: ["Individual nipples occasionally drip if not seated well", "Needs a bucket or reservoir purchased separately"], who_its_for: "Anyone retrofitting an existing bucket into a nipple waterer.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });
addProduct({ name: "Automatic Cup Waterer Kit", brand: "RentACoop", category: "waterers", subcategory: "cup", price_range_usd: "$15-$30", key_specs: { cups: "4 pack", mounts_to: "bucket or barrel" }, pros: ["Easier for chicks to learn than nipple waterers", "Cups refill automatically as birds drink"], cons: ["Cups need more frequent cleaning than sealed nipples", "Droppings and bedding can end up in the cup if placed too low"], who_its_for: "Keepers with chicks or older birds who struggle with nipple-style drinking.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });
addProduct({ name: "Plastic Poultry Fountain Waterer", brand: "Little Giant", category: "waterers", subcategory: "cup", price_range_usd: "$8-$20", key_specs: { capacity_gal: "1-3", material: "plastic" }, pros: ["Classic, dependable gravity design", "Very inexpensive and easy to find in stores"], cons: ["Bedding and droppings easily contaminate the open tray", "Needs daily cleaning to stay sanitary"], who_its_for: "New keepers wanting the simplest, cheapest waterer to start with.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });
addProduct({ name: "Heated Poultry Waterer", brand: "Farm Innovators", category: "waterers", subcategory: "heated", price_range_usd: "$45-$70", key_specs: { capacity_gal: 3, wattage: 100, thermostat: true }, pros: ["Built-in thermostat only runs power when needed", "Keeps water ice-free through most winter nights"], cons: ["Cord needs protection from chewing and weather", "Heavier and pricier than a non-heated equivalent"], who_its_for: "Keepers in freezing climates who don't want to haul warm water twice a day.", sources: [{ name: "Farm Innovators", url: "https://farminnovators.com/" }] });
addProduct({ name: "Heated Poultry Fount", brand: "API / Harris Farms", category: "waterers", subcategory: "heated", price_range_usd: "$40-$65", key_specs: { capacity_gal: "2-3", wattage: "80-125" }, pros: ["Reliable heating element rated for outdoor winter use", "Available in several capacities for different flock sizes"], cons: ["Metal base can get hot to bare hands during operation", "Needs a nearby weatherproof outlet"], who_its_for: "Cold-climate keepers who already have outdoor power access.", sources: [{ name: "Harris Farms", url: "https://www.harrisfarms.com/" }] });

// ---- Heated base / de-icer ----
addProduct({ name: "Heated Poultry Waterer Base", brand: "Farm Innovators", category: "heated-base-deicer", subcategory: "heated base", price_range_usd: "$30-$50", key_specs: { wattage: 100, thermostat: true }, pros: ["Turns any existing plastic fount into a heated one", "Thermostatically controlled to save electricity"], cons: ["Only works with founts sized to match the base diameter", "Cord placement still needs chew and weather protection"], who_its_for: "Keepers who already own a fount and don't want to replace the whole thing.", sources: [{ name: "Farm Innovators", url: "https://farminnovators.com/" }] });
addProduct({ name: "Thermo-Poultry Waterer Heater Base", brand: "K&H Pet Products", category: "heated-base-deicer", subcategory: "heated base", price_range_usd: "$30-$45", key_specs: { wattage: 80, thermostat: true }, pros: ["Lower wattage than many competitors, easier on extension cords", "Backed by a well-known heated pet-product brand"], cons: ["Smaller diameter fits a narrower range of founts", "Not rated for standing water submersion, base only"], who_its_for: "Small-flock keepers who want an efficient, low-draw heating base.", sources: [{ name: "K&H Pet Products", url: "https://khpet.com/" }] });
addProduct({ name: "Bird Bath De-Icer", brand: "Farm Innovators", category: "heated-base-deicer", subcategory: "de-icer", price_range_usd: "$18-$30", key_specs: { wattage: 60, thermostat: true }, pros: ["Drop-in style works in open pans, tubs, or founts without a matching base", "Automatically shuts off when water reaches a safe temperature"], cons: ["Not designed for large water volumes", "Should not be used unsubmerged; needs standing water to function safely"], who_its_for: "Keepers using open pans or tubs who want a simple drop-in de-icer.", sources: [{ name: "Farm Innovators", url: "https://farminnovators.com/" }] });

// ---- Brooder heat plate ----
addProduct({ name: "EcoGlow 20 Safety Brooder", brand: "Brinsea", category: "brooder-heat-plate", subcategory: "radiant plate", price_range_usd: "$70-$90", flock_size: { min: 1, max: 20 }, key_specs: { adjustable_height: true, wattage: 20 }, pros: ["Widely recommended as the safest brooder heat option, no exposed bulb", "Adjustable legs raise as chicks grow"], cons: ["Higher price than a basic heat lamp bulb", "Smaller capacity models limit how many chicks fit underneath at once"], who_its_for: "Keepers who want the lowest fire-risk brooder heat source available.", sources: [{ name: "Brinsea", url: "https://brinsea.com/" }] });
addProduct({ name: "EcoGlow 1200 Safety Brooder", brand: "Brinsea", category: "brooder-heat-plate", subcategory: "radiant plate", price_range_usd: "$90-$120", flock_size: { min: 1, max: 20 }, key_specs: { adjustable_height: true, wattage: 12 }, pros: ["Larger platform than the EcoGlow 20 for bigger hatches", "Very low power draw compared with heat lamps"], cons: ["Premium price point for a brooder accessory", "Legs need periodic readjustment as chicks grow quickly"], who_its_for: "Keepers brooding larger batches of chicks at once.", sources: [{ name: "Brinsea", url: "https://brinsea.com/" }] });
addProduct({ name: "Thermo-Chicken Heated Pad", brand: "K&H Pet Products", category: "brooder-heat-plate", subcategory: "radiant plate", price_range_usd: "$35-$55", key_specs: { wattage: "4-10", chew_resistant_cord: true }, pros: ["Budget-friendlier than the leading brooder-plate brand", "Chew-resistant cord adds a layer of safety"], cons: ["Flat pad design rather than adjustable-leg canopy, less natural huddling shape", "Best suited to smaller chick counts"], who_its_for: "Small-batch chick keepers wanting a safer, cheaper alternative to a heat lamp.", sources: [{ name: "K&H Pet Products", url: "https://khpet.com/" }] });

// ---- Heat lamp ----
addProduct({ name: "Clamp Lamp with Dome", brand: "Fluker's", category: "heat-lamp", subcategory: "clamp lamp", price_range_usd: "$15-$25", key_specs: { max_wattage: 150, dome_material: "aluminum" }, pros: ["Inexpensive and widely available at pet and farm stores", "Aluminum dome reflects heat downward efficiently"], cons: ["Heat lamps are a leading cause of coop and brooder fires; secure with a chain, not just the clamp", "No thermostat, so bulb wattage must be chosen carefully for the space"], who_its_for: "Keepers who prefer a traditional heat lamp and will use a secondary safety mount.", sources: [{ name: "Fluker's", url: "https://flukerfarms.com/" }] });
addProduct({ name: "250W Infrared Heat Lamp Bulb", brand: "Woods", category: "heat-lamp", subcategory: "bulb", price_range_usd: "$8-$15", key_specs: { wattage: 250, color: "red" }, pros: ["Red light is shown to reduce pecking among chicks", "High output warms larger brooders or coop corners effectively"], cons: ["250W is a real fire hazard if the fixture, cord, or mount is substandard", "Overkill and wasteful for a small indoor brooder"], who_its_for: "Larger brooder or unheated coop setups needing a strong heat source, used with a rated fixture.", sources: [{ name: "Woods", url: "https://www.woodsindustries.com/" }] });

// ---- Brooders / starter kits ----
addProduct({ name: "Chick Brooder Starter Kit", brand: "RentACoop", category: "brooders-starter-kits", subcategory: "starter kit", price_range_usd: "$60-$110", flock_size: { min: 1, max: 15 }, key_specs: { includes: "brooder box, feeder, waterer" }, pros: ["Bundled kit takes the guesswork out of a first brooder setup", "Components are sized appropriately for each other"], cons: ["Buying components separately can be slightly cheaper if you shop sales", "Box size may need an upgrade quickly as chicks grow"], who_its_for: "First-time chick keepers who want a single, simple purchase.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });
addProduct({ name: "Brooder Box", brand: "Little Giant", category: "brooders-starter-kits", subcategory: "brooder box", price_range_usd: "$25-$45", flock_size: { min: 1, max: 10 }, key_specs: { material: "plastic", height_in: 12 }, pros: ["Solid sides block drafts better than a cardboard box", "Easy to hose out and disinfect between batches"], cons: ["Fixed size means an upgrade is needed as chicks mature", "No lid included, so a separate cover is needed for jumping chicks"], who_its_for: "Keepers wanting a reusable, washable brooder rather than a cardboard box.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });

// ---- Incubators ----
addProduct({ name: "Still Air Incubator 9300", brand: "Little Giant", category: "incubators", subcategory: "still air", price_range_usd: "$45-$65", key_specs: { egg_capacity: 9, turner: "manual", humidity_control: "manual channels" }, pros: ["Lowest-cost way to try incubating at home", "Simple design with few parts to fail"], cons: ["Manual turning 3-5 times a day required for good hatch rates", "Temperature swings more than fan-circulated models, needs closer monitoring"], who_its_for: "First-time or classroom incubators on a tight budget.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });
addProduct({ name: "Hova-Bator 1602N", brand: "GQF Manufacturing", category: "incubators", subcategory: "still air", price_range_usd: "$55-$80", key_specs: { egg_capacity: "41-50", turner: "optional add-on", humidity_control: "manual" }, pros: ["Decades-old design with a long track record among hobbyists", "Optional automatic turner and fan kits can be added later"], cons: ["Base unit still requires hands-on temperature and humidity management", "Styrofoam body is less durable than hard-shell competitors"], who_its_for: "Hobbyists who want to start basic and upgrade the same unit over time.", sources: [{ name: "GQF Manufacturing", url: "https://www.gqfmfg.com/" }] });
addProduct({ name: "Mini II Advance Incubator", brand: "Brinsea", category: "incubators", subcategory: "forced air", price_range_usd: "$180-$220", key_specs: { egg_capacity: 7, turner: "automatic", humidity_control: "digital readout" }, pros: ["Fan-circulated air holds a far more even temperature than still-air units", "Compact footprint fits on a kitchen counter or shelf"], cons: ["Small capacity limits it to hobby-scale hatching", "Premium price relative to egg capacity"], who_its_for: "Hobbyists who want a reliable small hatch with minimal manual fuss.", sources: [{ name: "Brinsea", url: "https://brinsea.com/" }] });
addProduct({ name: "Ovation 28 Advance Incubator", brand: "Brinsea", category: "incubators", subcategory: "forced air", price_range_usd: "$400-$500", key_specs: { egg_capacity: 28, turner: "automatic", humidity_control: "digital" }, pros: ["Handles a much larger hatch than entry-level models", "Digital controls make dialing in temperature and humidity easier"], cons: ["Significant step up in price from hobby-tier incubators", "Larger footprint needs dedicated counter or shelf space"], who_its_for: "Serious hobbyists hatching multiple breeds or larger batches regularly.", sources: [{ name: "Brinsea", url: "https://brinsea.com/" }] });
addProduct({ name: "Genesis Hova-Bator 1588 Incubator", brand: "GQF Manufacturing", category: "incubators", subcategory: "forced air", price_range_usd: "$100-$140", key_specs: { egg_capacity: "40-50", turner: "included automatic", humidity_control: "digital" }, pros: ["Automatic turner and digital controls included at a mid-range price", "Circulated air fan improves hatch consistency over still-air models"], cons: ["Plastic housing feels less premium than metal-bodied competitors", "Digital display and buttons can be fiddly for first-time users"], who_its_for: "Keepers ready to move up from a basic still-air incubator.", sources: [{ name: "GQF Manufacturing", url: "https://www.gqfmfg.com/" }] });
addProduct({ name: "Nurture Right 360 Incubator", brand: "Brinsea", category: "incubators", subcategory: "auto turner", price_range_usd: "$180-$220", key_specs: { egg_capacity: 22, turner: "automatic cradle", humidity_control: "digital" }, pros: ["Clear dome gives a full view of every egg during incubation", "Automatic turning cradle removes daily hand-turning"], cons: ["Higher price than manual-turn models of similar capacity", "Dome removal for cleaning takes some care not to disturb eggs"], who_its_for: "Families and classrooms wanting a highly visible, low-maintenance hatch.", sources: [{ name: "Brinsea", url: "https://brinsea.com/" }] });
addProduct({ name: "Digital Egg Incubator", brand: "Magicfly", category: "incubators", subcategory: "auto turner", price_range_usd: "$60-$90", key_specs: { egg_capacity: "12-24", turner: "automatic", humidity_control: "digital" }, pros: ["Automatic turning and digital display at a budget-friendly price", "Clear lid lets you watch progress without opening the unit"], cons: ["Build quality and calibration accuracy is less consistent than premium brands", "Customer support and parts availability vary by seller"], who_its_for: "Budget-conscious buyers wanting automatic features without Brinsea pricing.", sources: [{ name: "Magicfly", url: "https://www.magicflyhome.com/" }] });
addProduct({ name: "4200 Incubator", brand: "Farm Innovators", category: "incubators", subcategory: "by egg count", price_range_usd: "$140-$180", key_specs: { egg_capacity: 41, turner: "automatic", humidity_control: "manual channels" }, pros: ["Mid-size 41-egg capacity fits a serious hobby flock", "Automatic turning included at a reasonable price point"], cons: ["Humidity is manually managed rather than digitally controlled", "Larger size needs a dedicated, stable indoor spot"], who_its_for: "Keepers hatching regularly who've outgrown a 6-12 egg unit.", sources: [{ name: "Farm Innovators", url: "https://farminnovators.com/" }] });
addProduct({ name: "Ovation 56 Advance Incubator", brand: "Brinsea", category: "incubators", subcategory: "by egg count", price_range_usd: "$550-$650", key_specs: { egg_capacity: 56, turner: "automatic", humidity_control: "digital" }, pros: ["Large capacity suits small farms or serious breeders", "Consistent digital climate control across a big batch"], cons: ["Among the most expensive units on this list", "Needs a dedicated table or cabinet given its footprint"], who_its_for: "Small-scale breeders hatching dozens of eggs per cycle.", sources: [{ name: "Brinsea", url: "https://brinsea.com/" }] });
addProduct({ name: "PX-30 Cabinet Incubator", brand: "R-Com", category: "incubators", subcategory: "by egg count", price_range_usd: "$400-$550", key_specs: { egg_capacity: 30, turner: "automatic", humidity_control: "digital sensor" }, pros: ["Cabinet-style build with strong insulation for stable temperatures", "Digital sensors give precise readouts rather than estimates"], cons: ["Higher price bracket for the given capacity", "Bulkier than tray-style incubators of similar egg count"], who_its_for: "Buyers prioritizing incubation precision over price.", sources: [{ name: "R-Com", url: "https://r-com.com/" }] });

// ---- Candlers ----
addProduct({ name: "OvaView LED Candler", brand: "Brinsea", category: "candlers", subcategory: "LED candler", price_range_usd: "$30-$45", key_specs: { light_type: "high-intensity LED", cone: "adjustable seal" }, pros: ["Strong enough beam to see through dark or brown shells", "Cone seals out ambient light for a clear view"], cons: ["Pricier than basic flashlight-style candlers", "Battery-powered, so batteries need to be on hand"], who_its_for: "Keepers regularly candling brown or dark-shelled eggs.", sources: [{ name: "Brinsea", url: "https://brinsea.com/" }] });
addProduct({ name: "LED Egg Candler", brand: "Magicfly", category: "candlers", subcategory: "LED candler", price_range_usd: "$12-$20", key_specs: { light_type: "LED", power: "USB or battery" }, pros: ["Very affordable way to start candling eggs at home", "Compact and easy to store near the incubator"], cons: ["Less effective on very dark or thick-shelled eggs", "Build quality is basic compared with dedicated brooding brands"], who_its_for: "Casual or first-time hatchers on a small budget.", sources: [{ name: "Magicfly", url: "https://www.magicflyhome.com/" }] });

// ---- Egg cartons ----
addProduct({ name: "Pulp Egg Cartons, Blank", brand: "Pinnacle Mercantile", category: "egg-cartons", subcategory: "pulp blank", price_range_usd: "$15-$30 per 100", key_specs: { holds: "1 dozen", material: "molded pulp" }, pros: ["Compostable and biodegradable, good for farm-stand branding", "Blank surface is easy to stamp or label with a farm name"], cons: ["Less rigid than plastic cartons, can crush if stacked carelessly", "Sold in bulk, so storage space is needed"], who_its_for: "Farm-stand and market sellers wanting eco-friendly, brandable cartons.", sources: [{ name: "Pinnacle Mercantile", url: "https://pinnaclemercantile.com/" }] });
addProduct({ name: "Clear Plastic Egg Cartons", brand: "Egg Cartons.com", category: "egg-cartons", subcategory: "clear PET", price_range_usd: "$20-$40 per 100", key_specs: { holds: "1 dozen", material: "PET plastic" }, pros: ["Shows off egg color and size, popular at farmers markets", "More reusable and durable than pulp cartons"], cons: ["Not biodegradable, a downside for eco-focused branding", "Costs more per unit than basic pulp cartons"], who_its_for: "Sellers who want their egg color and size on display.", sources: [{ name: "EggCartons.com", url: "https://www.eggcartons.com/" }] });
addProduct({ name: "Jumbo Pulp Egg Cartons", brand: "Papertise", category: "egg-cartons", subcategory: "pulp jumbo", price_range_usd: "$18-$32 per 100", key_specs: { holds: "1 dozen jumbo/duck eggs", material: "molded pulp" }, pros: ["Fits larger duck or jumbo chicken eggs that standard cartons crush", "Compostable material matches standard pulp cartons"], cons: ["Harder to find in small quantities than standard-size cartons", "Not suited for standard or smaller egg sizes"], who_its_for: "Duck-egg sellers or flocks that consistently lay oversized eggs.", sources: [{ name: "Papertise", url: "https://papertise.com/" }] });

// ---- Egg skelter ----
addProduct({ name: "Original Egg Skelter", brand: "Egg Skelter", category: "egg-skelter", subcategory: "spiral skelter", price_range_usd: "$25-$40", key_specs: { capacity_eggs: "12-24", material: "powder-coated steel" }, pros: ["First-in-first-out spiral rotates stock automatically", "Attractive countertop design that also displays the eggs"], cons: ["Premium price for what is essentially a countertop organizer", "Not a substitute for tracking lay dates on very old eggs"], who_its_for: "Kitchen counters that need an attractive, self-rotating egg store.", sources: [{ name: "Egg Skelter", url: "https://eggskelter.com/" }] });
addProduct({ name: "Countertop Egg Holder", brand: "Cooler Kitchen", category: "egg-skelter", subcategory: "spiral skelter", price_range_usd: "$18-$28", key_specs: { capacity_eggs: "12-18", material: "metal wire" }, pros: ["More affordable than the original branded skelter", "Compact size fits smaller kitchens"], cons: ["Smaller capacity than premium spiral skelters", "Wire construction is less sturdy long-term than solid steel"], who_its_for: "Small households wanting a budget egg-rotation holder.", sources: [{ name: "Cooler Kitchen", url: "https://coolerkitchen.com/" }] });

// ---- Nesting boxes ----
addProduct({ name: "Plastic Poultry Nest Box", brand: "Little Giant", category: "nesting-boxes", subcategory: "single box", price_range_usd: "$15-$25", key_specs: { interior_in: "12x12x12", material: "plastic" }, pros: ["Easy to clean and disinfect compared with wood boxes", "Inexpensive way to add extra nesting spots"], cons: ["Single-box units need multiples for a larger flock", "Basic design lacks a lipped front to hold in bedding"], who_its_for: "Keepers adding a spare nest box or two to an existing coop.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });
addProduct({ name: "4-Hole Nest Box", brand: "Miller Manufacturing", category: "nesting-boxes", subcategory: "multi-box", price_range_usd: "$60-$100", key_specs: { holes: 4, material: "galvanized steel/plastic" }, pros: ["Covers a whole small-to-medium flock's nesting needs in one unit", "Durable metal frame holds up to years of use"], cons: ["Bulkier footprint needs enough interior coop space", "Heavier to mount and move than single plastic boxes"], who_its_for: "Flocks of roughly 12-16 hens needing several nest sites in one fixture.", sources: [{ name: "Miller Manufacturing", url: "https://www.millermfgco.com/" }] });

// ---- Roll-away nest boxes ----
addProduct({ name: "Roll Out Nesting Box", brand: "RentACoop", category: "roll-away-nest-boxes", subcategory: "single roll-away", price_range_usd: "$45-$70", key_specs: { slope_design: true, tray: "padded collection tray" }, pros: ["Sloped floor reduces egg breakage and egg-eating habits", "External access panel lets you collect without entering the coop"], cons: ["Hens need to already be nest-trained for the roll-away design to work well", "Costs more per box than a basic static nest box"], who_its_for: "Keepers dealing with egg-eating hens or wanting outside-access collection.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });
addProduct({ name: "Roll Out Nest Box", brand: "Rite Farm Products", category: "roll-away-nest-boxes", subcategory: "multi roll-away", price_range_usd: "$120-$200", key_specs: { holes: "2-4", slope_design: true }, pros: ["Multi-hole version covers a bigger flock in one install", "Sturdy build intended for repeated daily use"], cons: ["Larger unit needs more coop wall space to mount", "Higher price than single-hole roll-away boxes"], who_its_for: "Medium flocks wanting roll-away benefits across several hens at once.", sources: [{ name: "Rite Farm Products", url: "https://ritefarmproducts.com/" }] });

// ---- Bedding ----
addProduct({ name: "Premium Pine Shavings", brand: "Kaytee", category: "bedding", subcategory: "pine shavings", price_range_usd: "$8-$15 per bag", key_specs: { bag_size_cuft: "8", kiln_dried: true }, pros: ["Affordable, absorbent, and widely available", "Kiln-dried processing reduces dust compared with raw shavings"], cons: ["Needs full replacement more often than hemp bedding", "Never use cedar shavings from any brand, which are toxic to poultry"], who_its_for: "Most backyard keepers looking for a reliable, low-cost default bedding.", sources: [{ name: "Kaytee", url: "https://www.kaytee.com/" }] });
addProduct({ name: "Hemp Bedding", brand: "Small Pet Select", category: "bedding", subcategory: "hemp", price_range_usd: "$20-$35 per bag", key_specs: { absorbency: "high", dust_level: "low" }, pros: ["Absorbs more moisture and odor than pine shavings", "Composts faster, a plus for garden-focused keepers"], cons: ["Costs noticeably more per bag than pine shavings", "Less widely stocked in brick-and-mortar farm stores"], who_its_for: "Keepers prioritizing odor and moisture control over upfront cost.", sources: [{ name: "Small Pet Select", url: "https://www.smallpetselect.com/" }] });
addProduct({ name: "Premium Western Forage Straw", brand: "Standlee", category: "bedding", subcategory: "straw", price_range_usd: "$12-$20 per bale", key_specs: { bale_type: "compressed", use: "bedding/insulation" }, pros: ["Good insulating value in cold-weather coops", "Widely available at farm and feed stores"], cons: ["Holds moisture and mats down faster than shavings", "Can harbor mites or mold if it gets wet and isn't changed promptly"], who_its_for: "Cold-climate keepers wanting extra winter insulation in nest boxes or coop floors.", sources: [{ name: "Standlee Forage", url: "https://standleeforage.com/" }] });
addProduct({ name: "All-Purpose Play Sand", brand: "Sakrete", category: "bedding", subcategory: "sand", price_range_usd: "$5-$10 per bag", key_specs: { grain: "washed, fine" }, pros: ["Easy to sift like a litter box, cutting daily cleaning time", "Doubles as dust-bath material"], cons: ["Heavy to haul and spread compared with shavings or straw", "Holds cold in winter, a downside in freezing climates"], who_its_for: "Keepers in warm-to-mild climates who like the deep-litter sand method.", sources: [{ name: "Sakrete", url: "https://www.sakrete.com/" }] });

// ---- Grit ----
addProduct({ name: "Poultry Grit", brand: "Manna Pro", category: "grit", subcategory: "adult grit", price_range_usd: "$8-$15", key_specs: { bag_size_lb: 5, particle: "insoluble granite" }, pros: ["Widely stocked at feed stores nationwide", "Reasonably priced for the bag size"], cons: ["Unnecessary for birds that already free-range on gravelly ground", "Must be offered separately, not mixed into feed"], who_its_for: "Keepers whose birds eat scratch, forage, or whole grains and need digestive grit.", sources: [{ name: "Manna Pro", url: "https://www.mannapro.com/" }] });
addProduct({ name: "Chick Grit", brand: "Small Pet Select", category: "grit", subcategory: "starter grit", price_range_usd: "$8-$14", key_specs: { bag_size_lb: 3, particle: "fine granite" }, pros: ["Sized appropriately for young chicks eating scratch or treats", "Prevents crop impaction issues in smaller birds"], cons: ["Not usable interchangeably with coarser adult grit", "Only needed once chicks start eating anything besides starter crumble"], who_its_for: "Keepers introducing treats or scratch to chicks for the first time.", sources: [{ name: "Small Pet Select", url: "https://www.smallpetselect.com/" }] });

// ---- Oyster shell ----
addProduct({ name: "Crushed Oyster Shell", brand: "Manna Pro", category: "oyster-shell", subcategory: "layer supplement", price_range_usd: "$10-$18", key_specs: { bag_size_lb: 5, calcium_source: "oyster shell" }, pros: ["Widely available and inexpensive calcium boost for layers", "Coarse particle size suited to standard-breed hens"], cons: ["Should not be given to non-laying pullets or roosters regularly", "Needs a separate dish, not mixed into complete feed"], who_its_for: "Keepers whose hens show thin or soft-shelled eggs.", sources: [{ name: "Manna Pro", url: "https://www.mannapro.com/" }] });
addProduct({ name: "Oyster Shell", brand: "Producer's Pride", category: "oyster-shell", subcategory: "layer supplement", price_range_usd: "$9-$16", key_specs: { bag_size_lb: 5 }, pros: ["Budget-friendly option sold widely at Tractor Supply", "Simple, single-ingredient calcium supplement"], cons: ["No fine-particle version for smaller breeds in this line", "Same general caution: free-choice only, not for young birds"], who_its_for: "Tractor Supply shoppers wanting a straightforward calcium supplement.", sources: [{ name: "Tractor Supply Co.", url: "https://www.tractorsupply.com/" }] });

// ---- Feed ----
addProduct({ name: "Start & Grow Chick Starter-Grower", brand: "Purina", category: "feed", subcategory: "starter", price_range_usd: "$18-$28 per 25 lb", key_specs: { protein_pct: 18, medicated: "available medicated or non-medicated" }, pros: ["One of the most recognized and widely available starter feeds in the US", "Medicated version helps guard against coccidiosis in unvaccinated chicks"], cons: ["Not certified organic", "Medicated version isn't needed if chicks are already vaccinated"], who_its_for: "Most first-time chick owners looking for a trusted, easy-to-find starter feed.", sources: [{ name: "Purina Mills", url: "https://www.purinamills.com/" }] });
addProduct({ name: "NatureWise Starter Feed", brand: "Nutrena", category: "feed", subcategory: "starter", price_range_usd: "$17-$26 per 25 lb", key_specs: { protein_pct: 18, prebiotics_probiotics: true }, pros: ["Added prebiotics and probiotics for gut health", "Comparable pricing to the leading starter feed brand"], cons: ["Slightly less widely stocked than Purina in some regions", "Non-organic formula, like most mainstream starter feeds"], who_its_for: "Keepers who want a probiotic-fortified starter without an organic price tag.", sources: [{ name: "Nutrena", url: "https://www.nutrenaworld.com/" }] });
addProduct({ name: "Layena Layer Feed", brand: "Purina", category: "feed", subcategory: "layer", price_range_usd: "$18-$27 per 25 lb", key_specs: { protein_pct: 16, calcium_pct: "3.25-4.25", form: "pellet or crumble" }, pros: ["Reliable, consistent formula backed by decades of use", "Available in both pellet and crumble forms"], cons: ["Not certified organic or non-GMO", "Layer calcium levels make it unsuitable for pre-laying pullets"], who_its_for: "Most keepers with an actively laying flock wanting a trusted mainstream feed.", sources: [{ name: "Purina Mills", url: "https://www.purinamills.com/" }] });
addProduct({ name: "NatureWise Layer Pellet", brand: "Nutrena", category: "feed", subcategory: "layer", price_range_usd: "$17-$26 per 25 lb", key_specs: { protein_pct: 16, added: "marigold extract for yolk color" }, pros: ["Marigold extract is marketed to deepen yolk color", "Competitive pricing against the market-leading layer brand"], cons: ["Still a conventional, non-organic formula", "Yolk color effect is modest and not dramatic for all flocks"], who_its_for: "Keepers wanting a mainstream layer feed with a slight yolk-color boost.", sources: [{ name: "Nutrena", url: "https://www.nutrenaworld.com/" }] });
addProduct({ id: "organic-layer-feed-scratch-and-peck", name: "Organic Layer Feed", brand: "Scratch and Peck Feeds", category: "feed", subcategory: "organic", price_range_usd: "$35-$50 per 25 lb", key_specs: { protein_pct: 16, certification: "USDA Organic, whole grain" }, pros: ["Whole-grain, minimally processed formula appeals to organic-focused keepers", "USDA Organic certification for those selling eggs as organic"], cons: ["Substantially more expensive per pound than conventional layer feed", "Whole-grain form means less uniform bite size than pelleted feed"], who_its_for: "Keepers committed to an organic feed program, often selling eggs as organic.", sources: [{ name: "Scratch and Peck Feeds", url: "https://scratchandpeck.com/" }] });
addProduct({ id: "organic-layer-feed-kalmbach", name: "Organic Layer Feed", brand: "Kalmbach Feeds", category: "feed", subcategory: "organic", price_range_usd: "$28-$40 per 25 lb", key_specs: { protein_pct: 16, certification: "USDA Organic, pellet" }, pros: ["Pelleted organic option, less picky-eater waste than whole-grain organic feed", "Priced somewhat below the leading whole-grain organic brand"], cons: ["Still a premium price versus conventional layer feed", "Regional availability is more limited than national mainstream brands"], who_its_for: "Organic-feed keepers who prefer a pellet over a whole-grain mix.", sources: [{ name: "Kalmbach Feeds", url: "https://www.kalmbachfeeds.com/" }] });

// ---- Treats ----
addProduct({ name: "Dried Mealworms", brand: "Small Pet Select", category: "treats", subcategory: "mealworms", price_range_usd: "$15-$30 per lb", key_specs: { protein_pct: "high (~50%)", form: "dried, whole" }, pros: ["High-protein treat chickens reliably love", "Long shelf life since they're fully dried"], cons: ["Should stay under about 10% of total daily diet", "More expensive per pound than most other treats"], who_its_for: "Keepers wanting a reliable high-protein treat for hand-feeding or boredom-busting.", sources: [{ name: "Small Pet Select", url: "https://www.smallpetselect.com/" }] });
addProduct({ name: "Non-GMO Dried Mealworms", brand: "Chubby Mealworms", category: "treats", subcategory: "mealworms", price_range_usd: "$12-$25 per lb", key_specs: { protein_pct: "high", non_gmo: true }, pros: ["Non-GMO sourcing appeals to feed-conscious keepers", "Competitive pricing against other mealworm brands"], cons: ["Same overfeeding caution applies as with any mealworm treat", "Sourcing and farm origin vary between suppliers"], who_its_for: "Keepers wanting a non-GMO mealworm option at a similar price point.", sources: [{ name: "Chubby Mealworms", url: "https://chubbymealworms.com/" }] });
addProduct({ name: "Original Black Soldier Fly Larvae", brand: "Grubblies", category: "treats", subcategory: "black soldier fly larvae", price_range_usd: "$18-$32 per lb", key_specs: { calcium_phosphorus_ratio: "improved vs. mealworms", form: "dried" }, pros: ["Better calcium-to-phosphorus balance than mealworms, gentler for layers", "High protein content chickens actively seek out"], cons: ["Costs more per pound than mealworms in most cases", "Still needs to stay a minority share of total diet"], who_its_for: "Keepers wanting a treat that's a bit more nutritionally balanced than mealworms.", sources: [{ name: "Grubblies", url: "https://grubblies.com/" }] });
addProduct({ name: "Dried Black Soldier Fly Larvae", brand: "Tuck's Grubs", category: "treats", subcategory: "black soldier fly larvae", price_range_usd: "$15-$28 per lb", key_specs: { form: "dried, whole", protein_pct: "high" }, pros: ["Comparable nutrition profile to leading BSFL brands at a lower price", "Sold in a range of bag sizes for small or larger flocks"], cons: ["Smaller brand with less widespread retail presence", "Same moderation rules apply as any protein treat"], who_its_for: "Budget-conscious keepers wanting BSFL treats without the premium brand price.", sources: [{ name: "Tuck's Grubs", url: "https://tucksnaturals.com/" }] });

// ---- Dust bath ----
addProduct({ name: "Poultry Dust Bath", brand: "Manna Pro", category: "dust-bath", subcategory: "dust bath mix", price_range_usd: "$12-$20", key_specs: { ingredients: "sand, herbs, diatomaceous earth blend" }, pros: ["Ready-to-use blend saves mixing your own from scratch", "Herbal additives are marketed to help with mite and lice control"], cons: ["More expensive than mixing plain sand and dry dirt yourself", "Needs to stay dry and covered to remain effective"], who_its_for: "Keepers who want a convenient, pre-mixed dust bath product.", sources: [{ name: "Manna Pro", url: "https://www.mannapro.com/" }] });
addProduct({ name: "Food Grade Diatomaceous Earth", brand: "Harris", category: "dust-bath", subcategory: "diatomaceous earth", price_range_usd: "$10-$20 per 4-5 lb", key_specs: { grade: "food grade", use: "dust bath additive" }, pros: ["Inexpensive additive to mix into a homemade dust bath", "Widely available and multi-purpose around the homestead"], cons: ["Should be used dry and with care to avoid inhaling the fine dust", "Not a stand-alone treatment for a heavy mite or lice infestation"], who_its_for: "Keepers building their own dust bath mix rather than buying a pre-made blend.", sources: [{ name: "Harris", url: "https://www.harrisproducts.com/" }] });

// ---- Poultry netting / electric fence ----
addProduct({ name: "PermaNet Electric Poultry Fence", brand: "Premier1 Supplies", category: "poultry-netting-electric-fence", subcategory: "permanent netting", price_range_usd: "$220-$320", key_specs: { length: "164 ft", height: "42 in", posts: "rigid, fixed" }, pros: ["Rigid post design is more permanent and stable than standard flexible netting", "Good option for a fixed daily range area rather than frequent moves"], cons: ["Heavier and less portable than standard PoultryNet", "Higher price than basic flexible netting"], who_its_for: "Keepers who want one semi-permanent, sturdy fenced range area.", sources: [{ name: "Premier1 Supplies", url: "https://www.premier1supplies.com/" }] });
addProduct({ name: "ElectroStop Predator Netting", brand: "Premier1 Supplies", category: "poultry-netting-electric-fence", subcategory: "predator netting", price_range_usd: "$260-$380", key_specs: { length: "164 ft", height: "48 in", spacing: "tight for predator deterrence" }, pros: ["Taller height and tighter mesh aimed specifically at deterring climbing and jumping predators", "Works alongside standard PoultryNet for extra protection"], cons: ["More expensive than standard poultry netting", "Still needs a properly sized energizer to be effective"], who_its_for: "Keepers in areas with heavy predator pressure from dogs, coyotes, or bobcats.", sources: [{ name: "Premier1 Supplies", url: "https://www.premier1supplies.com/" }] });

// ---- Predator-proof latch ----
addProduct({ name: "Raccoon-Proof Coop Latch", brand: "RentACoop", category: "predator-proof-latch", subcategory: "two-motion latch", price_range_usd: "$8-$18", key_specs: { motion: "two-step", material: "steel" }, pros: ["Two-motion design defeats typical raccoon paw dexterity", "Cheap, simple upgrade to an existing door"], cons: ["Requires basic hardware installation onto your existing coop", "Not a substitute for hardware-cloth-covered gaps elsewhere"], who_its_for: "Anyone upgrading a stock coop's weak factory latch.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });
addProduct({ name: "Predator Proof Latch", brand: "OverEZ", category: "predator-proof-latch", subcategory: "two-motion latch", price_range_usd: "$10-$20", key_specs: { motion: "two-step", material: "galvanized steel" }, pros: ["Purpose-built to match OverEZ coop doors but works on many others", "Rust-resistant coating for outdoor longevity"], cons: ["Slightly pricier than generic hardware-store latch upgrades", "Installation hardware may need adapting on non-OverEZ coops"], who_its_for: "OverEZ coop owners, or anyone wanting a purpose-built predator latch.", sources: [{ name: "OverEZ", url: "https://overez.com/" }] });

// ---- Automatic coop door ----
addProduct({ id: "automatic-chicken-coop-door-chickenguard", name: "Automatic Chicken Coop Door", brand: "ChickenGuard", category: "automatic-coop-door", subcategory: "timer + light sensor", price_range_usd: "$140-$220", key_specs: { power: "battery or mains", safety_stop: true }, pros: ["Combines timer and light-sensor modes for flexible scheduling", "Anti-crush safety stop reverses if a bird is in the doorway"], cons: ["Higher price point than basic timer-only doors", "Battery models need regular battery checks in cold weather"], who_its_for: "Keepers wanting a well-reviewed, safety-featured automatic door.", sources: [{ name: "ChickenGuard", url: "https://chickenguard.com/" }] });
addProduct({ id: "automatic-chicken-coop-door-run-chicken", name: "Automatic Chicken Coop Door", brand: "Run-Chicken", category: "automatic-coop-door", subcategory: "timer + light sensor", price_range_usd: "$100-$160", key_specs: { power: "battery or mains", remote_control: true }, pros: ["Included remote control makes manual override easy from a distance", "Competitive pricing against premium automatic-door brands"], cons: ["Plastic housing is less rugged than metal-bodied competitors", "Firmware/sensor quirks are reported more often than top-tier brands"], who_its_for: "Budget-conscious keepers still wanting light-sensor automation.", sources: [{ name: "Run-Chicken", url: "https://www.run-chicken.com/" }] });
addProduct({ name: "Add-A-Motor Automatic Chicken Door", brand: "Add-A-Motor", category: "automatic-coop-door", subcategory: "add-on motor kit", price_range_usd: "$180-$250", key_specs: { compatibility: "fits many existing pop doors", power: "battery" }, pros: ["Designed to retrofit an existing manual pop door rather than replacing it", "Strong reputation for reliability among longtime keepers"], cons: ["Among the pricier automatic door options", "Retrofitting still requires some hands-on adjustment to fit your exact door"], who_its_for: "Keepers who like their current pop door and just want to automate it.", sources: [{ name: "Add-A-Motor", url: "https://www.add-a-motor.com/" }] });
addProduct({ name: "Autodoor", brand: "Omlet", category: "automatic-coop-door", subcategory: "smart/app-connected", price_range_usd: "$220-$280", key_specs: { power: "battery", app_control: true }, pros: ["App control adds remote scheduling and manual override from a phone", "Clean, weatherproof housing built to match Omlet coops"], cons: ["One of the more expensive automatic doors on the market", "App dependency is a downside if you prefer a fully manual fallback"], who_its_for: "Tech-comfortable keepers wanting phone-based control and monitoring.", sources: [{ name: "Omlet", url: "https://www.omlet.us/" }] });

// ---- First aid ----
addProduct({ name: "Plus Antimicrobial Poultry Care Spray", brand: "Vetericyn", category: "first-aid", subcategory: "wound spray", price_range_usd: "$12-$20", key_specs: { size_oz: 3, prescription: "not required" }, pros: ["Non-stinging formula is easier to apply to a stressed, injured bird", "No prescription needed, widely available at farm stores"], cons: ["Only for minor wounds; deeper injuries still need a vet", "Bottle size is small relative to price for larger flocks"], who_its_for: "Every flock owner as a baseline first-aid item for pecking wounds and minor cuts.", sources: [{ name: "Vetericyn", url: "https://vetericyn.com/" }] });
addProduct({ name: "Sav-A-Chick Electrolyte & Vitamin Supplement", brand: "Sav-A-Chick", category: "first-aid", subcategory: "electrolytes", price_range_usd: "$6-$12", key_specs: { form: "powder, water-soluble" }, pros: ["Helps chicks and adult birds recover from shipping or heat stress", "Inexpensive and simple to dose into drinking water"], cons: ["Not a treatment for underlying illness, just supportive care", "Needs fresh mixing; leftover solution shouldn't sit too long"], who_its_for: "Anyone receiving shipped chicks or dealing with a heat wave.", sources: [{ name: "Sav-A-Chick / Manna Pro", url: "https://www.mannapro.com/" }] });
addProduct({ name: "Poultry Cell Vitamins & Electrolytes", brand: "Rooster Booster", category: "first-aid", subcategory: "electrolytes", price_range_usd: "$8-$15", key_specs: { form: "liquid concentrate" }, pros: ["Liquid concentrate format is easy to measure into a waterer", "Long-standing, trusted brand among poultry keepers"], cons: ["Liquid formula has a shorter shelf life once opened than powder", "Same supportive-care caveat: doesn't replace veterinary treatment for illness"], who_its_for: "Keepers who prefer a liquid vitamin supplement over powder packets.", sources: [{ name: "Rooster Booster / Durvet", url: "https://durvet.com/" }] });

// ---- Poultry scale ----
addProduct({ name: "Hanging Sling Scale", brand: "Rite Farm Products", category: "poultry-scale", subcategory: "hanging sling scale", price_range_usd: "$20-$35", key_specs: { capacity_lb: 44, harness: "sling included" }, pros: ["Purpose-built sling makes weighing a live bird far easier than a flat scale", "Reasonable capacity covers most standard breeds"], cons: ["Bulkier to store than a small digital kitchen scale", "Mechanical dial is less precise than a digital readout"], who_its_for: "Keepers who want a dedicated tool for regular flock weight tracking.", sources: [{ name: "Rite Farm Products", url: "https://ritefarmproducts.com/" }] });
addProduct({ name: "Digital Hanging Luggage Scale", brand: "Etekcity", category: "poultry-scale", subcategory: "digital hanging scale", price_range_usd: "$10-$18", key_specs: { capacity_lb: 110, hold_function: true }, pros: ["Hold function locks in the weight even while a bird wriggles", "Much cheaper than a dedicated poultry-branded scale"], cons: ["No harness included, so you'll need a bag or sling of your own", "Not marketed for livestock, though widely used that way by keepers"], who_its_for: "Budget keepers happy to repurpose a general digital hanging scale with their own sling or bag.", sources: [{ name: "Etekcity", url: "https://www.etekcity.com/" }] });

// ---- Egg washer ----
addProduct({ name: "Egg Bathe Egg Washer", brand: "Egg Bathe", category: "egg-washer", subcategory: "brush drum washer", price_range_usd: "$180-$260", key_specs: { capacity: "small batch, brush drum", power: "electric" }, pros: ["Speeds up cleaning for flocks producing multiple dozen eggs a day", "Brush drum design is gentler than hand-scrubbing individual eggs"], cons: ["Overkill for a small backyard flock washing a few eggs a week", "Needs regular sanitizing since it's in contact with many eggs"], who_its_for: "Small farms or market sellers washing a meaningful daily egg volume.", sources: [{ name: "Egg Bathe", url: "https://eggbathe.com/" }] });
addProduct({ name: "Egg Washer Machine", brand: "Rite Farm Products", category: "egg-washer", subcategory: "brush drum washer", price_range_usd: "$200-$320", key_specs: { capacity: "small batch, brush drum", power: "electric" }, pros: ["Comparable capacity to other small-batch washers at a similar price", "Sold by a brand already familiar to many poultry keepers"], cons: ["Same overkill caveat for very small flocks", "Larger footprint needs dedicated wash-station space"], who_its_for: "Sellers who've outgrown hand-washing eggs one at a time.", sources: [{ name: "Rite Farm Products", url: "https://ritefarmproducts.com/" }] });

// ---- Additional products to broaden coverage ----
addProduct({ name: "Precision Chicken Coop", brand: "PawHut", category: "coops", subcategory: "medium", price_range_usd: "$260-$360", flock_size: { min: 4, max: 8 }, key_specs: { material: "fir wood", nest_boxes: 2, run_included: true }, pros: ["Compact footprint fits smaller suburban yards", "Removable tray simplifies cleaning"], cons: ["Thinner wood than premium mid-size coops", "Run height is low, requires stooping to enter"], who_its_for: "Suburban keepers with limited yard space wanting a mid-size flock coop.", sources: [{ name: "PawHut", url: "https://www.aosom.com/pawhut" }] });
addProduct({ name: "Wooden Chicken Coop with Run", brand: "Tangkula", category: "coops", subcategory: "small", price_range_usd: "$160-$230", flock_size: { min: 2, max: 4 }, key_specs: { material: "fir wood", nest_boxes: 1, run_included: true }, pros: ["Low entry price for coop-and-run combo", "Lightweight enough to reposition occasionally"], cons: ["Build quality is basic at this price point", "Limited weatherproofing out of the box"], who_its_for: "First-time keepers testing the hobby with a small starter flock.", sources: [{ name: "Tangkula", url: "https://www.tangkula.com/" }] });
addProduct({ name: "XXL Walk-In Chicken Coop", brand: "TSISQ", category: "coops", subcategory: "walk-in", price_range_usd: "$600-$900", flock_size: { min: 8, max: 15 }, key_specs: { material: "galvanized steel frame, wire", human_door_height: "6 ft" }, pros: ["Large walk-in footprint at a lower price than premium wood walk-ins", "Steel frame resists rot compared with all-wood builds"], cons: ["Wire-and-tarp construction offers less insulation than a solid-wall coop", "Tarp roof needs periodic replacement from UV exposure"], who_its_for: "Budget keepers wanting walk-in convenience without premium wood pricing.", sources: [{ name: "TSISQ", url: "https://www.amazon.com/" }] });
addProduct({ name: "Salt Box Style Chicken Tractor", brand: "Kricket's Coops", category: "coops", subcategory: "chicken tractor", price_range_usd: "$900-$1,500", flock_size: { min: 6, max: 12 }, key_specs: { material: "wood frame", wheels: true }, pros: ["Salt-box roofline sheds rain and snow well for a mobile structure", "Roomier interior than typical A-frame tractors"], cons: ["Heavier to tow than lighter A-frame designs", "Custom/small-shop builds mean longer lead times"], who_its_for: "Rotational graziers wanting more headroom than an A-frame tractor offers.", sources: [{ name: "Kricket's Coops", url: "https://krickets-coops.com/" }] });

addProduct({ name: "Pop Door Coop Run Combo", brand: "Yaheetech", category: "runs", subcategory: "portable run", price_range_usd: "$90-$160", key_specs: { material: "wire mesh, wood frame", foldable: true }, pros: ["Attaches easily to most small and medium coops", "Reasonably priced for the covered floor space"], cons: ["Wire gauge is on the light side for serious predator pressure", "Ground stakes are minimal; needs additional anchoring in wind"], who_its_for: "Keepers wanting an affordable add-on run for an existing coop.", sources: [{ name: "Yaheetech", url: "https://www.yaheetech.com/" }] });
addProduct({ name: "Heavy Duty Chicken Run", brand: "Precision Pet Products", category: "runs", subcategory: "walk-in run", price_range_usd: "$200-$350", key_specs: { material: "powder-coated steel", coverage: "partial roof panel" }, pros: ["Sturdier steel gauge than most budget wire-panel runs", "Modular panels allow some size customization"], cons: ["Assembly involves many panels and connectors", "No full roof coverage on base model, aerial predators still a risk"], who_its_for: "Keepers wanting a step up in build quality from basic wire-panel runs.", sources: [{ name: "Precision Pet Products", url: "https://www.precisionpet.com/" }] });

addProduct({ name: "Galvanized Steel Poultry Feeder", brand: "Miller Manufacturing", category: "feeders", subcategory: "gravity", price_range_usd: "$18-$40", key_specs: { capacity_lb: "10-40", material: "galvanized steel" }, pros: ["Rust-resistant coating extends outdoor lifespan", "Available across a wide range of capacities"], cons: ["No rodent-proofing compared with treadle feeders", "Heavier than plastic, awkward for smaller keepers to lift full"], who_its_for: "Keepers wanting a long-lasting metal gravity feeder at a moderate price.", sources: [{ name: "Miller Manufacturing", url: "https://www.millermfgco.com/" }] });
addProduct({ name: "Automatic Chicken Feeder", brand: "OverEZ", category: "feeders", subcategory: "treadle", price_range_usd: "$150-$220", key_specs: { capacity_lb: 20, weatherproof: true }, pros: ["Matches OverEZ coop aesthetics but works with any coop", "Solid housing keeps feed dry through most weather"], cons: ["Premium pricing similar to other name-brand treadle feeders", "Pedal tension needs occasional readjustment for very light bantams"], who_its_for: "OverEZ coop owners or anyone wanting a matched-brand treadle feeder.", sources: [{ name: "OverEZ", url: "https://overez.com/" }] });

addProduct({ name: "Poultry Fount Waterer", brand: "Miller Manufacturing", category: "waterers", subcategory: "cup", price_range_usd: "$10-$22", key_specs: { capacity_gal: "1-5", material: "galvanized steel" }, pros: ["Metal build outlasts plastic founts in direct sun", "Wide capacity range fits small to larger flocks"], cons: ["Still an open gravity design prone to bedding contamination", "Heavier to carry and refill than plastic"], who_its_for: "Keepers wanting a durable metal alternative to plastic gravity founts.", sources: [{ name: "Miller Manufacturing", url: "https://www.millermfgco.com/" }] });
addProduct({ name: "Automatic Nipple Waterer System", brand: "RentACoop", category: "waterers", subcategory: "nipple", price_range_usd: "$30-$60", key_specs: { nipples: "8-10", mounts_to: "bucket, gravity-fed" }, pros: ["Full kit scales up more easily than buying individual nipples", "Gravity-fed design needs no electricity"], cons: ["Larger kit costs more upfront than a basic nipple pack", "Still needs training time for chicks new to nipple drinking"], who_its_for: "Keepers scaling up a nipple-waterer setup for a bigger flock.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });

addProduct({ name: "Heated Base for 3 Gallon Waterer", brand: "Miller Manufacturing", category: "heated-base-deicer", subcategory: "heated base", price_range_usd: "$28-$45", key_specs: { wattage: 125, thermostat: true }, pros: ["Sized specifically for standard 3-gallon plastic founts", "Thermostatic control limits unnecessary power draw"], cons: ["Only fits founts matching its base diameter", "Higher wattage than some competitors, worth checking circuit load"], who_its_for: "Keepers with a standard 3-gallon fount wanting to winterize it cheaply.", sources: [{ name: "Miller Manufacturing", url: "https://www.millermfgco.com/" }] });

addProduct({ name: "Safety Chick Brooder", brand: "Premier1 Supplies", category: "brooder-heat-plate", subcategory: "radiant plate", price_range_usd: "$70-$100", flock_size: { min: 1, max: 15 }, key_specs: { adjustable_height: true }, pros: ["No exposed heating element, reducing brooder fire risk", "Sold by a trusted poultry-equipment retailer"], cons: ["More expensive than a basic heat lamp bulb", "Needs a flat, dry surface to sit properly"], who_its_for: "Keepers who want a safer heat source without ordering directly from the manufacturer.", sources: [{ name: "Premier1 Supplies", url: "https://www.premier1supplies.com/" }] });

addProduct({ name: "Clamp Lamp Fixture", brand: "Woods", category: "heat-lamp", subcategory: "clamp lamp", price_range_usd: "$18-$28", key_specs: { max_wattage: 250, dome_material: "steel" }, pros: ["Heavier-gauge housing than many budget clamp lamps", "Rated for higher wattage bulbs when more heat is needed"], cons: ["Same fire-risk cautions apply: secure with a chain, never the clamp alone", "Bulkier and heavier than lightweight aluminum-dome lamps"], who_its_for: "Keepers needing a higher-wattage-rated fixture for larger brooders or coop corners.", sources: [{ name: "Woods", url: "https://www.woodsindustries.com/" }] });

addProduct({ name: "Chick Starter Kit with Brooder Box", brand: "Little Giant", category: "brooders-starter-kits", subcategory: "starter kit", price_range_usd: "$50-$90", flock_size: { min: 1, max: 10 }, key_specs: { includes: "brooder box, feeder, waterer, thermometer" }, pros: ["Includes a thermometer, a detail some bundled kits skip", "Recognizable, widely stocked brand"], cons: ["Heat source often sold separately from this kit", "Box size is best for smaller chick counts"], who_its_for: "First-time keepers wanting a slightly more complete starter bundle.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });

addProduct({ name: "Digital Egg Candler Flashlight", brand: "Kebonnixs", category: "candlers", subcategory: "LED candler", price_range_usd: "$10-$18", key_specs: { light_type: "LED", power: "battery" }, pros: ["Pocket-sized and easy to store near the incubator", "One of the cheapest ways to start candling eggs"], cons: ["Weaker beam struggles on very dark shells", "Plastic housing feels less durable than premium candlers"], who_its_for: "Casual hatchers wanting the lowest-cost candling tool.", sources: [{ name: "Kebonnixs", url: "https://www.amazon.com/" }] });

addProduct({ name: "Paper Pulp Nest Box Liners", brand: "Rite Farm Products", category: "nesting-boxes", subcategory: "accessory", price_range_usd: "$12-$20 per pack", key_specs: { material: "molded pulp", disposable: true }, pros: ["Disposable liners cut down on nest box cleaning time", "Compostable material fits an eco-conscious setup"], cons: ["Ongoing cost compared with reusable bedding alone", "Not a substitute for the nest box itself"], who_its_for: "Keepers wanting a faster nest-box cleaning routine.", sources: [{ name: "Rite Farm Products", url: "https://ritefarmproducts.com/" }] });
addProduct({ name: "Wall-Mount Nest Box", brand: "Little Giant", category: "nesting-boxes", subcategory: "single box", price_range_usd: "$18-$28", key_specs: { interior_in: "12x12x12", material: "plastic", mount: "wall bracket" }, pros: ["Wall-mount bracket frees up floor space inside the coop", "Same easy-clean plastic as other Little Giant nest boxes"], cons: ["Needs a sturdy wall or stud to mount securely", "Single-hole unit, multiples needed for bigger flocks"], who_its_for: "Keepers with limited coop floor space wanting a wall-mounted option.", sources: [{ name: "Miller Manufacturing / Little Giant", url: "https://www.millermfgco.com/" }] });

addProduct({ name: "Coarse Poultry Grit", brand: "Producer's Pride", category: "grit", subcategory: "adult grit", price_range_usd: "$7-$13", key_specs: { bag_size_lb: 5, particle: "coarse granite" }, pros: ["Budget option widely available at Tractor Supply", "Coarse size suits standard and larger breeds well"], cons: ["No fine-grit version in this line for bantams or chicks", "Still needs a separate dish, not mixed into feed"], who_its_for: "Tractor Supply shoppers with standard-size free-ranging flocks.", sources: [{ name: "Tractor Supply Co.", url: "https://www.tractorsupply.com/" }] });

addProduct({ name: "Oyster Shell Fine Ground", brand: "Small Pet Select", category: "oyster-shell", subcategory: "layer supplement", price_range_usd: "$12-$20", key_specs: { bag_size_lb: 5, particle: "finer grind" }, pros: ["Finer grind suits bantams and smaller-beaked breeds better", "Same calcium benefit as coarse oyster shell for active layers"], cons: ["Costs slightly more than standard coarse oyster shell", "Same caution: not for non-laying birds"], who_its_for: "Keepers with bantam or mixed-size flocks needing a finer calcium source.", sources: [{ name: "Small Pet Select", url: "https://www.smallpetselect.com/" }] });

addProduct({ name: "Meatbird Broiler Feed", brand: "Purina", category: "feed", subcategory: "starter", price_range_usd: "$20-$30 per 25 lb", key_specs: { protein_pct: 20, use: "meat bird grower" }, pros: ["Higher protein formula suited to fast-growing meat breeds", "Widely available alongside standard starter feed"], cons: ["Not ideal as a long-term feed for laying breeds", "Pricier than standard starter due to higher protein content"], who_its_for: "Keepers raising broilers or other meat-purpose chicks.", sources: [{ name: "Purina Mills", url: "https://www.purinamills.com/" }] });
addProduct({ name: "Flock Raiser Feed", brand: "Purina", category: "feed", subcategory: "layer", price_range_usd: "$18-$27 per 25 lb", key_specs: { protein_pct: 20, use: "mixed-age flock feed" }, pros: ["Good option for mixed flocks with chicks, layers, and roosters together", "Higher protein supports birds not solely fed a layer ration"], cons: ["Needs separate oyster shell offered on the side since it isn't a dedicated layer formula", "Slightly pricier than a straightforward layer feed"], who_its_for: "Keepers with mixed-age or mixed-purpose flocks who can't easily separate feed by age.", sources: [{ name: "Purina Mills", url: "https://www.purinamills.com/" }] });

addProduct({ name: "Freeze-Dried Mealworm and Grub Blend", brand: "Small Pet Select", category: "treats", subcategory: "mealworms", price_range_usd: "$18-$32 per lb", key_specs: { blend: "mealworms + black soldier fly larvae" }, pros: ["Combines two popular protein treats in one bag", "Convenient if you don't want to buy two separate treat products"], cons: ["Costs more than a single-ingredient treat bag", "Same 10%-of-diet moderation rule still applies"], who_its_for: "Keepers wanting variety without buying multiple treat bags.", sources: [{ name: "Small Pet Select", url: "https://www.smallpetselect.com/" }] });
addProduct({ name: "Scratch Grain Treat Mix", brand: "Manna Pro", category: "treats", subcategory: "mealworms", price_range_usd: "$10-$18 per bag", key_specs: { ingredients: "cracked corn, wheat, oats" }, pros: ["Inexpensive way to encourage natural scratching behavior", "Widely available at most farm and feed stores"], cons: ["Lower protein than mealworm or BSFL treats", "Best used sparingly since it's mostly carbohydrate, not protein"], who_its_for: "Keepers wanting a classic, low-cost scratch treat for cold-weather energy or enrichment.", sources: [{ name: "Manna Pro", url: "https://www.mannapro.com/" }] });

addProduct({ name: "Poultry Dust Bath Additive", brand: "Dr. Killigan's", category: "dust-bath", subcategory: "diatomaceous earth", price_range_usd: "$15-$25", key_specs: { grade: "food grade", additive: "herbal blend" }, pros: ["Herbal additive blend beyond plain diatomaceous earth", "Marketed specifically for poultry dust bath use"], cons: ["Pricier than plain food-grade diatomaceous earth alone", "Effectiveness of herbal additives is more anecdotal than proven"], who_its_for: "Keepers wanting an all-in-one dust bath additive rather than mixing their own.", sources: [{ name: "Dr. Killigan's", url: "https://drkilligans.com/" }] });

addProduct({ name: "PoultryNet Standard Electric Fence", brand: "Premier1 Supplies", category: "poultry-netting-electric-fence", subcategory: "portable netting", price_range_usd: "$150-$220", key_specs: { length: "164 ft", height: "42 in", posts: "flexible, single-spiked" }, pros: ["The standard, most affordable Premier1 netting option", "Lightweight enough for one person to move between rotations"], cons: ["Single-spiked posts are less stable on rocky or uneven ground than double-spiked versions", "Needs an energizer purchased separately"], who_its_for: "Keepers wanting the classic, budget-friendly poultry netting to start with.", sources: [{ name: "Premier1 Supplies", url: "https://www.premier1supplies.com/" }] });
addProduct({ name: "IntelliShock 60 Fence Energizer", brand: "Premier1 Supplies", category: "poultry-netting-electric-fence", subcategory: "energizer", price_range_usd: "$150-$220", key_specs: { power: "battery or plug-in", output_joules: 0.5 }, pros: ["Sized appropriately for a single strand of poultry netting", "Battery or mains operation gives flexibility away from outlets"], cons: ["Underpowered for combining with much longer perimeter fencing", "Battery models need regular charging or fresh batteries to stay effective"], who_its_for: "Anyone buying poultry netting who doesn't already own a compatible energizer.", sources: [{ name: "Premier1 Supplies", url: "https://www.premier1supplies.com/" }] });

addProduct({ name: "Spring-Loaded Gate Latch", brand: "National Hardware", category: "predator-proof-latch", subcategory: "spring latch", price_range_usd: "$6-$14", key_specs: { material: "steel", self_closing: true }, pros: ["Self-closing action means the door can't be left ajar by accident", "Inexpensive hardware-store upgrade for coop or run gates"], cons: ["Not specifically marketed for predator-proofing, more of a general gate latch", "Best combined with a second predator-specific latch for full security"], who_its_for: "Keepers wanting a cheap self-closing upgrade for run gates.", sources: [{ name: "National Hardware", url: "https://nationalhardware.com/" }] });
addProduct({ name: "Carabiner Latch Pack", brand: "RentACoop", category: "predator-proof-latch", subcategory: "carabiner add-on", price_range_usd: "$8-$15", key_specs: { pack_size: "4-6", material: "aluminum" }, pros: ["Cheapest possible predator-proofing add-on for existing latches", "No tools or drilling required to install"], cons: ["Adds an extra step to daily coop opening and closing", "Not a full latch replacement, just a supplementary lock"], who_its_for: "Keepers wanting the fastest, cheapest predator-proofing fix available.", sources: [{ name: "RentACoop", url: "https://www.rentacoop.com/" }] });

addProduct({ name: "Poultry Multivitamin Supplement", brand: "Durvet", category: "first-aid", subcategory: "electrolytes", price_range_usd: "$8-$16", key_specs: { form: "powder or liquid" }, pros: ["General-purpose vitamin support beyond just electrolytes", "Affordable addition to a basic flock first-aid kit"], cons: ["Not a treatment for active illness, supportive use only", "Overlaps in function with dedicated electrolyte products"], who_its_for: "Keepers wanting general vitamin support during molting or stress periods.", sources: [{ name: "Durvet", url: "https://durvet.com/" }] });
addProduct({ name: "Blu-Kote Antiseptic Wound Spray", brand: "Blu-Kote", category: "first-aid", subcategory: "wound spray", price_range_usd: "$10-$18", key_specs: { form: "liquid spray", color: "blue-tinted" }, pros: ["Blue tint helps disguise a wound from pecking flock mates", "Long-standing product trusted by many poultry keepers"], cons: ["Stains skin, clothing, and coop surfaces it touches", "Should not be used near eyes or on very deep wounds without vet input"], who_its_for: "Keepers dealing with pecking-order injuries in a mixed flock.", sources: [{ name: "Blu-Kote / Durvet", url: "https://durvet.com/" }] });

addProduct({ name: "Digital Pocket Scale with Hook", brand: "American Weigh Scales", category: "poultry-scale", subcategory: "digital hanging scale", price_range_usd: "$12-$20", key_specs: { capacity_lb: 100, hold_function: true }, pros: ["Compact and easy to store compared with a full sling scale", "Digital hold function gives a stable, precise reading"], cons: ["Small hook needs a bag or sling added for a live bird", "Not marketed specifically for poultry use"], who_its_for: "Keepers wanting a small, precise digital scale rather than a bulky sling scale.", sources: [{ name: "American Weigh Scales", url: "https://www.americanweigh.com/" }] });

addProduct({ name: "Manual Egg Washer Brush", brand: "Rite Farm Products", category: "egg-washer", subcategory: "hand brush", price_range_usd: "$10-$18", key_specs: { power: "manual, no electricity" }, pros: ["Cheapest possible option for washing dirty eggs by hand", "No electricity or plumbing setup required"], cons: ["Slower than any motorized washer for larger volumes", "More physical effort per dozen eggs washed"], who_its_for: "Small backyard flocks washing only a few dirty eggs at a time.", sources: [{ name: "Rite Farm Products", url: "https://ritefarmproducts.com/" }] });

// ---------------------------------------------------------------------------
// Hatcheries
// ---------------------------------------------------------------------------
const hatcheries = [];
function addHatchery(h) {
  hatcheries.push({
    id: h.id,
    name: h.name,
    state: h.state,
    city: h.city,
    website: h.website,
    founded_year: h.founded_year ?? null,
    npip_certified: h.npip_certified ?? "unknown",
    min_order: h.min_order ?? null,
    ships_to: h.ships_to ?? null,
    shipping_season: h.shipping_season ?? null,
    sells: h.sells ?? [],
    breed_count: h.breed_count ?? null,
    notable_breeds: h.notable_breeds ?? [],
    vaccination_offered: h.vaccination_offered ?? "unknown",
    sexing_guarantee: h.sexing_guarantee ?? null,
    sources: h.sources,
    last_checked: "2026-09-26",
    needs_review: true,
  });
}

addHatchery({ id: "meyer-hatchery", name: "Meyer Hatchery", state: "OH", city: null, website: "https://meyerhatchery.com/", founded_year: 1985, npip_certified: "yes", min_order: "3 chicks April-November, 8 chicks December-March", ships_to: "all 50 states", shipping_season: "year-round, seasonal minimums apply", sells: ["chicks", "hatching eggs", "started pullets", "ducks", "turkeys", "quail", "guineas"], breed_count: 160, notable_breeds: [], vaccination_offered: "yes", sexing_guarantee: "sexed and straight-run options offered, guarantee terms on site", sources: [{ name: "Meyer Hatchery", url: "https://meyerhatchery.com/" }, { name: "Meyer Hatchery NPIP info", url: "https://meyerhatchery.zendesk.com/hc/en-us/articles/360024553431-The-National-Poultry-Improvement-Plan-NPIP" }, { name: "Meyer Hatchery ordering policy", url: "https://blog.meyerhatchery.com/ordering-from-meyer-hatchery-5/" }] });

addHatchery({ id: "cackle-hatchery", name: "Cackle Hatchery", state: "MO", city: "Lebanon", website: "https://www.cacklehatchery.com/", founded_year: 1936, npip_certified: "yes", min_order: "15 birds for free shipping", ships_to: "all 50 states", shipping_season: "year-round", sells: ["chicks", "hatching eggs", "started pullets", "ducks", "turkeys", "quail", "guineas"], breed_count: 190, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Cackle Hatchery", url: "https://www.cacklehatchery.com/" }, { name: "Cackle Hatchery History", url: "https://www.cacklehatchery.com/history/" }, { name: "Cackle Hatchery Guarantees & Policies", url: "https://www.cacklehatchery.com/guarantees-policies/" }] });

addHatchery({ id: "murray-mcmurray-hatchery", name: "Murray McMurray Hatchery", state: "IA", city: "Webster City", website: "https://www.mcmurrayhatchery.com/", founded_year: 1917, npip_certified: "yes", min_order: null, ships_to: "all 50 states", shipping_season: "seasonal, primarily spring", sells: ["chicks", "hatching eggs", "ducks", "turkeys", "guineas"], breed_count: 200, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Murray McMurray Hatchery History", url: "https://www.mcmurrayhatchery.com/history.html" }, { name: "Messenger News: 100 years of poultry", url: "https://www.messengernews.net/news/local-business/2017/09/100-years-of-poultry/" }] });

addHatchery({ id: "my-pet-chicken", name: "My Pet Chicken", state: "OH", city: null, website: "https://www.mypetchicken.com/", founded_year: 2005, npip_certified: "yes (via partner hatcheries)", min_order: "3 chicks April-November, 8 chicks December-March; 6 eggs per farm for hatching eggs", ships_to: "all 50 states", shipping_season: "year-round, seasonal minimums apply", sells: ["chicks", "hatching eggs", "started pullets", "ducks", "turkeys", "quail", "guineas"], breed_count: 100, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "My Pet Chicken shipping policy", url: "https://www.mypetchicken.com/policies/shipping-policy" }, { name: "My Pet Chicken baby chick info", url: "https://www.mypetchicken.com/pages/baby-chick-information" }] });

addHatchery({ id: "hoovers-hatchery", name: "Hoover's Hatchery", state: "IA", city: "Rudd", website: "https://hoovershatchery.com/", founded_year: 1944, npip_certified: "yes", min_order: null, ships_to: "all 50 states", shipping_season: "seasonal, primarily spring and fall", sells: ["chicks", "started pullets", "ducks", "turkeys", "guineas"], breed_count: 100, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Hoover's Hatchery About Us", url: "https://hoovershatchery.com/about-hoovers-hatchery" }, { name: "Hoover's Hatchery Policies", url: "https://hoovershatchery.com/hoovers-hatchery-policies" }] });

addHatchery({ id: "ideal-poultry", name: "Ideal Poultry Breeding Farms", state: "TX", city: "Cameron", website: "https://www.idealpoultry.com/", founded_year: 1937, npip_certified: "yes", min_order: "$30 minimum order value, no fixed bird count minimum", ships_to: "all 50 states", shipping_season: "year-round, hatches 52 weeks a year", sells: ["chicks", "ducks", "turkeys", "guineas", "quail"], breed_count: 100, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Ideal Poultry", url: "https://www.idealpoultry.com/shipping" }, { name: "Ideal Poultry History", url: "https://www.idealpoultryinsights.com/history-of-ideal-poultry" }] });

addHatchery({ id: "strombergs-chickens", name: "Stromberg's Chicks and Game Birds", state: "MN", city: "Hackensack / Pine River", website: "https://www.strombergschickens.com/", founded_year: 1921, npip_certified: "unknown", min_order: null, ships_to: "all 50 states", shipping_season: "seasonal", sells: ["chicks", "hatching eggs", "ducks", "turkeys", "quail", "guineas"], breed_count: 200, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Stromberg's Chickens", url: "https://www.strombergschickens.com/" }, { name: "Mergr company profile", url: "https://mergr.com/stromberg-s-chicks-and-game-birds-overview" }] });

addHatchery({ id: "welp-hatchery", name: "Welp Hatchery", state: "IA", city: "Bancroft", website: "https://welphatchery.com/", founded_year: 1929, npip_certified: "yes", min_order: "25 chicks for free shipping (lower paid-shipping minimums also offered)", ships_to: "all 50 states", shipping_season: "seasonal, primarily spring", sells: ["chicks", "ducks", "turkeys", "guineas"], breed_count: 100, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Welp Hatchery", url: "https://welphatchery.com/" }, { name: "Welp Hatchery FAQs", url: "https://www.welphatchery.com/faqs" }] });

addHatchery({ id: "freedom-ranger-hatchery", name: "Freedom Ranger Hatchery", state: "PA", city: "Reinholds / Lancaster County", website: "https://www.freedomrangerhatchery.com/", founded_year: 2007, npip_certified: "yes", min_order: null, ships_to: "all 50 states", shipping_season: "seasonal, primarily spring through fall", sells: ["chicks", "started pullets"], breed_count: 15, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "straight-run broilers primarily; sexed layers offered separately", sources: [{ name: "Freedom Ranger Hatcheries", url: "https://www.freedomrangerhatchery.com/" }, { name: "Freedom Ranger Hatcheries story", url: "https://www.freedomrangerhatchery.com/hatcheries/" }] });

addHatchery({ id: "purely-poultry", name: "Purely Poultry", state: "WI", city: "Fremont / Durand", website: "https://purelypoultry.com/", founded_year: 2007, npip_certified: "yes (via NPIP-certified breeder network)", min_order: "as few as 3 chicks", ships_to: "all 50 states", shipping_season: "year-round, seasonal minimums may apply", sells: ["chicks", "hatching eggs", "ducks", "turkeys", "quail", "guineas"], breed_count: 300, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Purely Poultry", url: "https://purelypoultry.com/" }, { name: "Purely Poultry FAQ", url: "https://purelypoultry.com/faq/" }] });

addHatchery({ id: "chickens-for-backyards", name: "Chickens for Backyards", state: "MO", city: null, website: "https://www.chickensforbackyards.com/", founded_year: null, npip_certified: "yes (via partner hatchery network)", min_order: "as few as 3 birds", ships_to: "all 50 states", shipping_season: "February through October", sells: ["chicks", "ducks", "turkeys", "guineas"], breed_count: 100, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Chickens for Backyards", url: "http://go.chickensforbackyards.com/home.html" }, { name: "The Featherbrain hatchery comparison", url: "https://www.thefeatherbrain.com/blog/chicken-hatchery-comparison" }] });

addHatchery({ id: "townline-hatchery", name: "Townline Poultry Farm (Townline Hatchery)", state: "MI", city: "Zeeland", website: "https://townlinehatchery.com/", founded_year: 1913, npip_certified: "yes", min_order: null, ships_to: "all 50 states", shipping_season: "seasonal", sells: ["chicks", "started pullets", "ducks", "turkeys", "guineas"], breed_count: 60, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Townline Poultry Farm", url: "https://townlinehatchery.com/" }, { name: "Townline About page", url: "https://townlinehatchery.com/about-townline/" }] });

addHatchery({ id: "moyers-chicks", name: "Moyer's Chicks", state: "PA", city: "Quakertown", website: "https://www.moyerschicks.com/", founded_year: 1946, npip_certified: "yes", min_order: null, ships_to: "contiguous US", shipping_season: "seasonal", sells: ["chicks", "started pullets", "turkeys", "guineas"], breed_count: 40, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Hoover's Hatchery: about Moyer's Chicks", url: "https://hoovershatchery.com/about-moyers-chicks" }, { name: "PennAg member profile", url: "https://pennag.com/member_company/moyers-hatchery/" }] });

addHatchery({ id: "dunlap-hatchery", name: "Dunlap Hatchery", state: "ID", city: "Caldwell", website: "https://www.dunlaphatcherypoultry.com/", founded_year: 1918, npip_certified: "yes", min_order: null, ships_to: "unknown, primarily regional pickup and shipping", shipping_season: "seasonal", sells: ["chicks", "hatching eggs", "ducks", "turkeys", "guineas"], breed_count: 50, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Dunlap Hatchery", url: "https://www.dunlaphatcherypoultry.com/" }, { name: "Idaho Business Review: Dunlap Hatchery at 106 years", url: "https://idahobusinessreview.com/2024/05/09/dunlap-hatchery-still-good-place-to-pick-up-chicks-after-106-years/" }] });

addHatchery({ id: "privett-hatchery", name: "Privett Hatchery", state: "NM", city: "Portales", website: "http://www.privetthatchery.com/", founded_year: 1960, npip_certified: "yes", min_order: null, ships_to: "all 50 states", shipping_season: "seasonal", sells: ["chicks", "turkeys", "guineas", "quail"], breed_count: 60, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Privett Hatchery BBB profile", url: "https://www.bbb.org/us/nm/portales/profile/poultry-farm/privett-hatchery-inc-0806-48017" }, { name: "Hoover's Hatchery: Privett Rare Breeds", url: "https://hoovershatchery.com/privett-rare-breeds-2" }] });

addHatchery({ id: "mt-healthy-hatcheries", name: "Mt. Healthy Hatcheries", state: "OH", city: "Cincinnati", website: "https://www.mthealthy.com/", founded_year: 1924, npip_certified: "yes", min_order: "5 chicks (approx., tied to $65 shipping band for 5-15 chicks)", ships_to: "all 50 states", shipping_season: "seasonal", sells: ["chicks", "turkeys", "guineas", "game birds"], breed_count: 40, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Mt. Healthy Hatcheries", url: "https://www.mthealthy.com/" }, { name: "Mt. Healthy Hatcheries BBB profile", url: "https://www.bbb.org/us/oh/cincinnati/profile/hatchery/mt-healthy-hatcheries-inc-0292-1170704" }] });

addHatchery({ id: "tractor-supply-chick-days", name: "Tractor Supply Co. (Chick Days)", state: "TN", city: "Brentwood", website: "https://www.tractorsupply.com/tsc/cms/chick-days", founded_year: null, npip_certified: "yes (via hatchery suppliers)", min_order: "varies by store, in-store purchase only, no shipping minimum", ships_to: "in-store pickup only, not a mail-order hatchery", shipping_season: "late winter through spring, store-dependent", sells: ["chicks", "ducks", "turkeys", "guineas"], breed_count: null, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "generally straight-run in-store; policies vary by store", sources: [{ name: "Tractor Supply Chick Days", url: "https://www.tractorsupply.com/tsc/cms/chick-days" }, { name: "Tractor Supply newsroom", url: "https://corporate.tractorsupply.com/newsroom/news-releases/news-releases-details/2026/Tractor-Supply-Announces-a-Flock-of-Animal-Friendly-Festivities-Launching-This-Month/default.aspx" }] });

addHatchery({ id: "rural-king-chick-days", name: "Rural King (Chick Days)", state: "IN", city: "Mattoon", website: "https://www.ruralking.com/chick-days", founded_year: null, npip_certified: "unknown", min_order: "varies by store, in-store purchase only", ships_to: "in-store pickup only, not a mail-order hatchery", shipping_season: "spring and late summer, store-dependent", sells: ["chicks"], breed_count: null, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "policies vary by store", sources: [{ name: "Rural King Chick Days", url: "https://www.ruralking.com/chick-days" }] });

addHatchery({ id: "atwoods-chick-days", name: "Atwoods Ranch & Home (Chick Days)", state: "OK", city: "Ardmore", website: "https://www.atwoods.com/seasonal/chick-days/", founded_year: null, npip_certified: "unknown", min_order: "sold in small packs (e.g. 6-pack) in-store", ships_to: "in-store pickup only, not a mail-order hatchery; stores in OK, TX, KS, MO, AR", shipping_season: "spring, store-dependent", sells: ["chicks"], breed_count: null, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "policies vary by store", sources: [{ name: "Atwoods Chick Days", url: "https://www.atwoods.com/seasonal/chick-days/" }] });

addHatchery({ id: "belt-hatchery", name: "Belt Hatchery", state: "CA", city: "Fresno", website: "https://www.belthatchery.com/", founded_year: null, npip_certified: "yes", min_order: "25 chicks for delivery safety", ships_to: "primarily western US", shipping_season: "seasonal", sells: ["chicks", "ducks", "turkeys", "guineas", "game birds"], breed_count: 22, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "sexed and straight-run options offered", sources: [{ name: "Belt Hatchery", url: "https://www.belthatchery.com/" }, { name: "Belt Hatchery FAQ", url: "https://www.belthatchery.com/faq.htm" }] });

addHatchery({ id: "eagle-nest-poultry", name: "Eagle Nest Poultry", state: "OH", city: "Bucyrus", website: "https://eaglenestpoultryohio.com/", founded_year: null, npip_certified: "yes", min_order: null, ships_to: "unknown, regional Ohio focus with some mail order", shipping_season: "seasonal", sells: ["chicks", "started pullets", "ducks", "turkeys", "guineas"], breed_count: 30, notable_breeds: [], vaccination_offered: "unknown", sexing_guarantee: "unknown", sources: [{ name: "Eagle Nest Poultry", url: "https://eaglenestpoultryohio.com/" }, { name: "Ohio Ag Net: Eagle Nest Hatchery finds new wings", url: "https://ocj.com/2026/04/eagle-nest-hatchery-finds-new-wings/" }] });

// ---------------------------------------------------------------------------
// Write output
// ---------------------------------------------------------------------------
writeFileSync(new URL("../data/product-categories.json", import.meta.url), JSON.stringify(categories, null, 2) + "\n");
writeFileSync(new URL("../data/products.json", import.meta.url), JSON.stringify(products, null, 2) + "\n");
writeFileSync(new URL("../data/hatcheries.json", import.meta.url), JSON.stringify(hatcheries, null, 2) + "\n");

console.log(`categories: ${categories.length}`);
console.log(`products: ${products.length}`);
console.log(`hatcheries: ${hatcheries.length}`);
const withAsin = products.filter((p) => p.amazon_asin).length;
console.log(`products with real ASIN: ${withAsin}`);
