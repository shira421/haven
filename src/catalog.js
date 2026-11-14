// Every plant and animal that can live in a haven. Art for each id is in art.js.
// price: coins to unlock (0 = yours from the start).
// goal: a way to earn it without coins. season: months (1-12) when it is free to grow.

export const HABITATS = {
  meadow: 'Meadow',
  woodland: 'Woodland',
  pond: 'Pond',
  dryland: 'Dryland',
  tropics: 'Tropics',
  frost: 'Frost',
  home: 'Home',
};

const plant = (id, name, habitat, price, blurb, extra = {}) => ({ id, kind: 'plant', name, habitat, price, blurb, ...extra });
const animal = (id, name, habitat, price, blurb, extra = {}) => ({ id, kind: 'animal', name, habitat, price, blurb, ...extra });

export const SPECIES = [
  // Plants
  plant('clover', 'Clover', 'meadow', 0, 'Low, quick to spread, and good for the soil.'),
  plant('fern', 'Fern', 'woodland', 0, 'Unrolls a new frond from a tight spiral.'),
  plant('daisy', 'Daisy', 'meadow', 80, 'Closes at night and opens again with the light.'),
  plant('tulip', 'Tulip', 'meadow', 150, 'Grows from a bulb and keeps growing after it is cut.'),
  plant('cattail', 'Cattail', 'pond', 160, 'Stands at the water’s edge with a brown seed head.'),
  plant('toadstool', 'Toadstool', 'woodland', 180, 'A red cap with white spots. Look, do not eat.'),
  plant('poppy', 'Poppy', 'meadow', 200, 'Paper-thin petals on a thin, hairy stem.'),
  plant('aloe', 'Aloe', 'dryland', 220, 'Stores water in thick, pointed leaves.'),
  plant('lavender', 'Lavender', 'meadow', 260, 'Purple spikes that bees visit all day.'),
  plant('blueberry', 'Blueberry bush', 'woodland', 280, 'Small bush, heavy with berries in summer.'),
  plant('waterlily', 'Water lily', 'pond', 300, 'Floats on a round pad anchored to the mud.'),
  plant('sunflower', 'Sunflower', 'meadow', 320, 'Young flowers turn to follow the sun.'),
  plant('pricklypear', 'Prickly pear', 'dryland', 340, 'Flat green pads with fruit along the top.'),
  plant('cactus', 'Saguaro', 'dryland', 380, 'Grows its first arm after many decades.'),
  plant('birch', 'Birch', 'woodland', 400, 'White bark that peels in thin strips.'),
  plant('monstera', 'Monstera', 'tropics', 420, 'Big leaves with holes that let the wind through.'),
  plant('bamboo', 'Bamboo', 'tropics', 450, 'A grass, and one of the fastest growers there is.'),
  plant('pine', 'Pine', 'woodland', 480, 'Keeps its needles all year.'),
  plant('oak', 'Oak', 'woodland', 520, 'Slow to grow and home to hundreds of species.'),
  plant('palm', 'Palm', 'tropics', 560, 'One tall trunk and a crown of fronds.'),
  plant('maple', 'Maple', 'woodland', 600, 'Turns red and orange before the leaves fall.'),
  plant('willow', 'Willow', 'pond', 700, 'Long branches that hang down to the water.'),
  plant('pumpkin', 'Pumpkin', 'meadow', 500, 'A vine that puts everything into one big fruit.', { season: [10, 11] }),
  plant('lotus', 'Lotus', 'pond', 650, 'Rises clean out of muddy water.', { season: [6, 7, 8] }),
  plant('frostpine', 'Snow pine', 'frost', 800, 'A pine carrying a load of fresh snow.', { season: [12, 1, 2] }),
  plant('cherry', 'Cherry blossom', 'woodland', 900, 'Blooms for about two weeks each spring.', { season: [3, 4] }),
  plant('bonsai', 'Bonsai', 'home', 1500, 'A full tree kept small with years of patient care.', { goal: { type: 'longSession', n: 120 } }),

  // Animals
  animal('rabbit', 'Rabbit', 'meadow', 0, 'Listens with ears that turn on their own.'),
  animal('snail', 'Snail', 'meadow', 90, 'Carries its home and takes its time.'),
  animal('ladybug', 'Ladybird', 'meadow', 120, 'Eats aphids by the dozen.'),
  animal('frog', 'Frog', 'pond', 180, 'Drinks through its skin.'),
  animal('bee', 'Bee', 'meadow', 200, 'Tells the hive where flowers are with a dance.'),
  animal('butterfly', 'Butterfly', 'meadow', 240, 'Tastes with its feet.'),
  animal('robin', 'Robin', 'woodland', 260, 'Sings early, often before sunrise.'),
  animal('lizard', 'Gecko', 'dryland', 280, 'Walks up walls on millions of tiny hairs.'),
  animal('duck', 'Duck', 'pond', 300, 'Feathers so oily that water rolls off.'),
  animal('hedgehog', 'Hedgehog', 'meadow', 380, 'Rolls into a ball of several thousand spines.'),
  animal('squirrel', 'Squirrel', 'woodland', 420, 'Buries nuts and forgets some, which plants trees.'),
  animal('turtle', 'Turtle', 'pond', 440, 'Its shell is part of its skeleton.'),
  animal('cat', 'Cat', 'home', 500, 'Sleeps most of the day and judges the rest.'),
  animal('shiba', 'Shiba', 'home', 500, 'A small, alert dog with a curled tail.'),
  animal('raccoon', 'Raccoon', 'woodland', 560, 'Feels food with its front paws before eating.'),
  animal('parrot', 'Parrot', 'tropics', 620, 'Learns sounds and repeats them back.'),
  animal('fox', 'Fox', 'woodland', 640, 'Hears a mouse move under snow.'),
  animal('penguin', 'Penguin', 'frost', 680, 'Cannot fly, and swims like it is flying.'),
  animal('fennec', 'Fennec fox', 'dryland', 720, 'Huge ears that let the heat out.'),
  animal('seal', 'Seal', 'frost', 740, 'Sleeps in the water with half its brain awake.'),
  animal('deer', 'Deer', 'woodland', 760, 'Grows new antlers every year.'),
  animal('redpanda', 'Red panda', 'tropics', 980, 'Wraps its tail around itself to keep warm.'),
  animal('owl', 'Owl', 'woodland', 900, 'Flies almost without a sound.', { goal: { type: 'nightSessions', n: 5 } }),
  animal('otter', 'Otter', 'pond', 1200, 'Holds hands while sleeping so no one drifts off.', { goal: { type: 'groupSessions', n: 1 } }),
  animal('capybara', 'Capybara', 'pond', 1300, 'Gets along with nearly every other animal.', { goal: { type: 'friends', n: 3 } }),
  animal('bear', 'Bear', 'woodland', 1400, 'Sleeps through winter and wakes up hungry.', { goal: { type: 'streak', n: 7 } }),
  animal('panda', 'Panda', 'tropics', 2500, 'Eats bamboo for most of its waking hours.', { goal: { type: 'hours', n: 50 } }),
];

const BY_ID = new Map(SPECIES.map(s => [s.id, s]));
export const speciesById = id => BY_ID.get(id) || null;
export const STARTERS = SPECIES.filter(s => s.price === 0).map(s => s.id);
export const PLANTS = SPECIES.filter(s => s.kind === 'plant');
export const ANIMALS = SPECIES.filter(s => s.kind === 'animal');

/** True when the species is free to grow this month. */
export function inSeason(species, month) {
  return Array.isArray(species.season) && species.season.includes(month);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function seasonText(species) {
  if (!species.season) return '';
  const first = MONTHS[species.season[0] - 1];
  const last = MONTHS[species.season[species.season.length - 1] - 1];
  return first === last ? first : `${first} to ${last}`;
}

/** Plain words for a goal, e.g. "Finish one 120 min session". */
export function goalText(goal) {
  if (!goal) return '';
  switch (goal.type) {
    case 'longSession': return `Finish one ${goal.n} min session`;
    case 'nightSessions': return `Finish ${goal.n} sessions that start after 10 pm`;
    case 'groupSessions': return goal.n === 1 ? 'Finish a session with friends' : `Finish ${goal.n} sessions with friends`;
    case 'friends': return `Have ${goal.n} friends on Haven`;
    case 'streak': return `Focus ${goal.n} days in a row`;
    case 'hours': return `Focus for ${goal.n} hours in total`;
    default: return '';
  }
}
