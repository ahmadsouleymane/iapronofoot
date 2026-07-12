import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const packs = [
  { name: 'Découverte', priceFcfa: 500, creditsAmount: 5 },
  { name: 'Standard', priceFcfa: 1500, creditsAmount: 18 },
  { name: 'Avantage', priceFcfa: 3000, creditsAmount: 40 },
  { name: 'Pro', priceFcfa: 5000, creditsAmount: 75 },
];

async function main() {
  for (const pack of packs) {
    const { rows } = await pool.query('SELECT id FROM credit_pack WHERE name = $1', [pack.name]);

    if (rows.length > 0) {
      continue;
    }

    await pool.query(
      `INSERT INTO credit_pack (name, price_fcfa, credits_amount, lemonsqueezy_variant_id, active)
       VALUES ($1, $2, $3, '', true)`,
      [pack.name, pack.priceFcfa, pack.creditsAmount],
    );
  }

  await pool.end();
}

main().catch((error) => {
  process.exitCode = 1;
  throw error;
});
