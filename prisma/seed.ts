import { db } from "../src/lib/db";
import { dataProducts } from "./data/products";

async function main() {
  for (const dataProduct of dataProducts) {
    const upsertedProduct = await db.product.upsert({
      where: { slug: dataProduct.slug },
      update: dataProduct,
      create: dataProduct,
    });

    console.log(`👕 ${upsertedProduct.name}`);
  }
}

main()
  .then(async () => {
    await db.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
