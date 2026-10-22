import { randomBytes, scryptSync } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { eq } from 'drizzle-orm';
import { openDatabase, type Store } from './db.js';
import { users, categories, sellerProfiles, products } from './schema.js';

export const DEMO_PASSWORD = 'DemoPass123!';
export const DEMO_ACCOUNTS = [
  { name: 'Demo Administrator', email: 'admin@3legant.demo', role: 'admin' as const },
  { name: 'Oak & Linen', email: 'seller@3legant.demo', role: 'seller' as const },
  { name: 'Form Studio', email: 'studio@3legant.demo', role: 'seller' as const },
  { name: 'Jamie Morgan', email: 'buyer@3legant.demo', role: 'buyer' as const },
];
const categoryNames = ['Living Room', 'Bedroom', 'Kitchen', 'Lighting', 'Accessories'];
const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

// Sample catalog. Illustrations are original local placeholders, not product photography.
const catalog: {
  name: string;
  category: string;
  price: number;
  stock: number;
  image: string;
  description: string;
}[] = [
  {
    name: 'Linen Lounge Chair',
    category: 'Living Room',
    price: 24900,
    stock: 14,
    image: 'chair',
    description:
      'An inviting lounge chair with a softly curved frame and warm linen upholstery. A comfortable reading companion, sized for a quiet corner. Sample dimensions: 76 × 82 × 80 cm.',
  },
  {
    name: 'Cloud Three Seat Sofa',
    category: 'Living Room',
    price: 89900,
    stock: 6,
    image: 'sofa',
    description:
      'Generously proportioned seating with a low profile and removable cushion covers. Neutral woven fabric brings a calm, relaxed feeling to your living room. Sample dimensions: 220 × 94 × 78 cm.',
  },
  {
    name: 'Oak Coffee Table',
    category: 'Living Room',
    price: 17900,
    stock: 18,
    image: 'table',
    description:
      'A simple oak-tone coffee table with rounded corners and a practical open shelf. Made for everyday living, from morning coffee to evenings with friends. Sample dimensions: 110 × 60 × 40 cm.',
  },
  {
    name: 'Woven Accent Chair',
    category: 'Living Room',
    price: 21900,
    stock: 9,
    image: 'chair',
    description:
      'A light, sculptural accent chair with a woven-inspired finish and solid legs. Pair with soft textiles for a natural, balanced interior. Sample dimensions: 68 × 74 × 78 cm.',
  },
  {
    name: 'Modular Corner Sofa',
    category: 'Living Room',
    price: 129900,
    stock: 4,
    image: 'sofa',
    description:
      'A spacious corner sofa designed around deep comfort and clean lines. Flexible styling for family rooms and open-plan living. Sample dimensions: 280 × 180 × 80 cm.',
  },
  {
    name: 'Walnut Side Table',
    category: 'Living Room',
    price: 8900,
    stock: 22,
    image: 'table',
    description:
      'A compact walnut-tone table that keeps your current read and favourite mug close by. Its small footprint suits narrow spaces. Sample dimensions: 42 × 42 × 52 cm.',
  },
  {
    name: 'Linen Platform Bed',
    category: 'Bedroom',
    price: 69900,
    stock: 7,
    image: 'bed',
    description:
      'A low-profile platform bed with a padded linen headboard and a quiet, contemporary silhouette. Mattress is not included. Sample size: queen, 160 × 200 cm.',
  },
  {
    name: 'Oak Bedside Table',
    category: 'Bedroom',
    price: 12900,
    stock: 16,
    image: 'table',
    description:
      'An oak-tone bedside table with generous surface space for a lamp and a book. A timeless addition to restful bedrooms. Sample dimensions: 48 × 40 × 54 cm.',
  },
  {
    name: 'Upholstered Reading Chair',
    category: 'Bedroom',
    price: 28900,
    stock: 8,
    image: 'chair',
    description:
      'Create a place to pause with this upholstered chair, designed for relaxed seating and soft bedroom palettes. Sample dimensions: 72 × 78 × 84 cm.',
  },
  {
    name: 'Natural Wood Bed Frame',
    category: 'Bedroom',
    price: 55900,
    stock: 5,
    image: 'bed',
    description:
      'A simple wood-tone bed frame with a light, airy shape and dependable proportions. Designed for a calm and uncluttered room. Mattress not included. Sample size: queen, 160 × 200 cm.',
  },
  {
    name: 'Round Dining Table',
    category: 'Kitchen',
    price: 34900,
    stock: 10,
    image: 'table',
    description:
      'Gather around a round dining table with an oak-tone finish and room for four. Rounded edges make it feel welcoming in smaller dining spaces. Sample dimensions: diameter 110 × 75 cm.',
  },
  {
    name: 'Everyday Dining Chair',
    category: 'Kitchen',
    price: 9900,
    stock: 32,
    image: 'chair',
    description:
      'An easygoing dining chair with a comfortable seat and balanced wood-tone frame. Sold individually. Sample dimensions: 45 × 52 × 80 cm.',
  },
  {
    name: 'Ceramic Serving Bowl',
    category: 'Kitchen',
    price: 3900,
    stock: 25,
    image: 'vase',
    description:
      'A generous ceramic-inspired serving vessel for the everyday table. This sample product uses an illustrative placeholder; verify material and care information before real merchandising.',
  },
  {
    name: 'Breakfast Side Table',
    category: 'Kitchen',
    price: 11900,
    stock: 12,
    image: 'table',
    description:
      'A versatile small table for breakfast corners, compact kitchens, or extra surface space when guests arrive. Sample dimensions: 65 × 65 × 74 cm.',
  },
  {
    name: 'Arc Floor Lamp',
    category: 'Lighting',
    price: 14900,
    stock: 13,
    image: 'lamp',
    description:
      'A sculptural floor lamp with a soft, diffused glow for reading corners and relaxed evenings. Decorative sample listing; electrical specifications require confirmation before commercial use.',
  },
  {
    name: 'Mushroom Table Lamp',
    category: 'Lighting',
    price: 7900,
    stock: 21,
    image: 'lamp',
    description:
      'A rounded table lamp that adds a gentle glow to shelves and bedside tables. Its simple profile sits easily with natural textures. Decorative sample listing.',
  },
  {
    name: 'Linen Shade Lamp',
    category: 'Lighting',
    price: 6900,
    stock: 17,
    image: 'lamp',
    description:
      'A linen-inspired shade and understated base create a warm pool of light on side tables and desks. Decorative sample listing; bulb is not included.',
  },
  {
    name: 'Studio Desk Lamp',
    category: 'Lighting',
    price: 5900,
    stock: 19,
    image: 'lamp',
    description:
      'An understated desk companion with a compact base and focused silhouette. Suits a quiet workspace or bedside setting. Decorative sample listing.',
  },
  {
    name: 'Sculptural Ceramic Vase',
    category: 'Accessories',
    price: 4900,
    stock: 30,
    image: 'vase',
    description:
      'A sculptural vessel in a softly textured neutral finish. Style on its own or alongside dried stems for a considered finishing touch. Sample height: 26 cm.',
  },
  {
    name: 'Terracotta Bud Vase',
    category: 'Accessories',
    price: 2400,
    stock: 34,
    image: 'vase',
    description:
      'An earthy accent for a single stem or a small arrangement. Each sample listing represents a decorative placeholder product. Sample height: 15 cm.',
  },
  {
    name: 'Tall Stoneware Vessel',
    category: 'Accessories',
    price: 6400,
    stock: 11,
    image: 'vase',
    description:
      'A tall, quiet statement for a console or open shelf. Its balanced proportions pair well with natural wood and soft textiles. Sample height: 36 cm.',
  },
  {
    name: 'Mini Ceramic Pot',
    category: 'Accessories',
    price: 1900,
    stock: 40,
    image: 'vase',
    description:
      'A small decorative ceramic-inspired pot for compact shelves and tabletop displays. Sample height: 11 cm. Plant is not included.',
  },
  {
    name: 'Soft Curve Accent Chair',
    category: 'Living Room',
    price: 32900,
    stock: 0,
    image: 'chair',
    description:
      'A softly curved statement chair for thoughtful living spaces. This sample listing is intentionally out of stock to demonstrate inventory states. Sample dimensions: 78 × 80 × 76 cm.',
  },
  {
    name: 'Low Oak Console',
    category: 'Bedroom',
    price: 22900,
    stock: 8,
    image: 'table',
    description:
      'A low-profile oak-tone console for storage baskets, books, or display pieces. A versatile addition to a hallway or bedroom. Sample dimensions: 120 × 36 × 60 cm.',
  },
];

export function seedDatabase(store: Store): void {
  store.sqlite.transaction(() => {
    for (const account of DEMO_ACCOUNTS) {
      if (!store.orm.select().from(users).where(eq(users.email, account.email)).get()) {
        const salt = randomBytes(16).toString('hex');
        store.orm
          .insert(users)
          .values({
            ...account,
            passwordHash: `${salt}:${scryptSync(DEMO_PASSWORD, salt, 64).toString('hex')}`,
          })
          .run();
      }
    }
    for (const name of categoryNames)
      store.orm
        .insert(categories)
        .values({ name, slug: slugify(name) })
        .onConflictDoNothing()
        .run();
    const seller = store.orm
      .select()
      .from(users)
      .where(eq(users.email, 'seller@3legant.demo'))
      .get()!;
    const studio = store.orm
      .select()
      .from(users)
      .where(eq(users.email, 'studio@3legant.demo'))
      .get()!;
    for (const user of [seller, studio])
      store.orm
        .insert(sellerProfiles)
        .values({ userId: user.id, storeName: user.name })
        .onConflictDoNothing()
        .run();
    for (const [i, item] of catalog.entries()) {
      const category = store.orm
        .select()
        .from(categories)
        .where(eq(categories.slug, slugify(item.category)))
        .get()!;
      store.orm
        .insert(products)
        .values({
          slug: slugify(item.name),
          name: item.name,
          description: item.description,
          price: item.price,
          stock: item.stock,
          categoryId: category.id,
          sellerId: i % 2 === 0 ? seller.id : studio.id,
          images: [`/images/${item.image}.svg`, `/images/${item.image}-detail.svg`],
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString(),
        })
        .onConflictDoNothing()
        .run();
    }
  })();
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.loadEnvFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error(
      'Demo seeding is disabled in production. Set ALLOW_DEMO_SEED=true only for an isolated demo environment.',
    );
    process.exitCode = 1;
  } else {
    const store = openDatabase();
    try {
      seedDatabase(store);
      console.log(
        'Sample catalog and four demo accounts created if absent. Password: DemoPass123! (development only).',
      );
    } finally {
      store.close();
    }
  }
}
